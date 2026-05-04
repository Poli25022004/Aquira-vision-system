#include <thread>
#include <chrono>
#include <map>
#include <set>
#include <vector>
#include <memory>
#include <condition_variable>
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "ws2_32.lib")
#include "VisionSystem.hpp"
#include <httplib.h>
#include <nlohmann/json.hpp>

using namespace httplib;
using namespace std;
using json = nlohmann::json;

// ══════════════════════════════════════════════════════════════════════════════
// CAMERA STREAM
// One virtual camera per cameraId; all share a single webcam via the
// broadcaster thread, which pushes encoded frames through here.
// ══════════════════════════════════════════════════════════════════════════════

struct WsClient {
    function<bool(const void*, size_t)> send;
};

struct CameraStream {
    string         id;
    string         name;
    atomic<bool>   isStreaming{ false };
    atomic<int>    fps{ 0 };
    atomic<uint32_t> frameCount{ 0 };
    int            qualityScore{ 100 };

    vector<uchar> lastJpegBuffer;
    mutex         frameMtx;

    condition_variable frameCV;
    mutex              frameCVMtx;

    vector<WsClient> wsClients;
    mutex            wsMtx;

    CameraStream(string _id, string _name)
        : id(move(_id)), name(move(_name)) {
    }

    void pushEncodedFrame(const vector<uchar>& jpeg, int score) {
        if (!isStreaming) return;

        {
            lock_guard<mutex> lk(frameMtx);
            lastJpegBuffer = jpeg;
            qualityScore = score;
        }
        frameCount++;
        frameCV.notify_all();

        {
            lock_guard<mutex> lk(wsMtx);
            wsClients.erase(
                remove_if(wsClients.begin(), wsClients.end(),
                    [&](const WsClient& c) {
                        return !c.send(jpeg.data(), jpeg.size());
                    }),
                wsClients.end());
        }
    }

    bool waitFrame(uint32_t lastCount, int timeoutMs) {
        unique_lock<mutex> lk(frameCVMtx);
        return frameCV.wait_for(lk, chrono::milliseconds(timeoutMs),
            [this, lastCount]() {
                return frameCount.load() != lastCount || !isStreaming.load();
            });
    }

    void addWsClient(WsClient c) {
        lock_guard<mutex> lk(wsMtx);
        wsClients.push_back(move(c));
    }

    void start() {
        if (!isStreaming) {
            frameCount = 0;
            isStreaming = true;
            con::ok("Camera " + id + " — stream avviato");
        }
    }

    void stop() {
        if (isStreaming) {
            isStreaming = false;
            frameCV.notify_all();
            lock_guard<mutex> lk(wsMtx);
            wsClients.clear();
            con::warn("Camera " + id + " — stream fermato");
        }
    }

    vector<uchar> getFrameJpeg() {
        lock_guard<mutex> lk(frameMtx);
        return lastJpegBuffer;
    }

    string getFrameBase64() {
        vector<uchar> buf = getFrameJpeg();
        if (buf.empty()) return "";
        static const char* B64 =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        string out;
        out.reserve(((buf.size() + 2) / 3) * 4);
        for (size_t i = 0; i < buf.size(); i += 3) {
            unsigned int v = buf[i] << 16;
            if (i + 1 < buf.size()) v |= buf[i + 1] << 8;
            if (i + 2 < buf.size()) v |= buf[i + 2];
            out += B64[(v >> 18) & 63];
            out += B64[(v >> 12) & 63];
            out += (i + 1 < buf.size()) ? B64[(v >> 6) & 63] : '=';
            out += (i + 2 < buf.size()) ? B64[v & 63] : '=';
        }
        return out;
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ══════════════════════════════════════════════════════════════════════════════

map<string, shared_ptr<CameraStream>> cameras;
mutex camerasMtx;

atomic<bool>       isBroadcasting{ false };
unique_ptr<thread> broadcasterThread;
mutex              broadcasterMtx;

// Indice webcam di default (-1 = auto-scan primo disponibile)
static int g_cameraIndex = -1;

static const set<string> CAM01_ALIASES = { "cam-01", "cam-1", "cam1" };
static string canonicalId(const string& id) {
    return CAM01_ALIASES.count(id) ? "cam-01" : id;
}

shared_ptr<CameraStream> getOrCreateCamera(const string& cameraId) {
    const string id = canonicalId(cameraId);
    lock_guard<mutex> lk(camerasMtx);
    auto it = cameras.find(id);
    if (it != cameras.end()) return it->second;
    auto cam = make_shared<CameraStream>(id, "Camera_" + id);
    cameras[id] = cam;
    con::info("Camera " + id + " registrata");
    return cam;
}

json parseJsonBody(const string& body) {
    try { return json::parse(body); }
    catch (...) { return json::object(); }
}

// ══════════════════════════════════════════════════════════════════════════════
// BROADCASTER
// Acquisisce frame dalla webcam tramite VisionSystem e li distribuisce.
// ══════════════════════════════════════════════════════════════════════════════

void startBroadcaster(int cameraIndex) {
    lock_guard<mutex> initLk(broadcasterMtx);

    bool threadAlive = broadcasterThread && broadcasterThread->joinable();
    if (isBroadcasting.load() && threadAlive) return;

    if (threadAlive) {
        broadcasterThread->join();
        broadcasterThread.reset();
    }
    isBroadcasting = false;

    isBroadcasting = true;
    broadcasterThread = make_unique<thread>([cameraIndex]() {
        string idxStr = (cameraIndex < 0) ? "auto" : to_string(cameraIndex);
        con::info("Broadcaster avviato — webcam indice " + idxStr);

        VisionSystem vision;
        if (!vision.init(cameraIndex)) {
            con::err("Nessuna webcam trovata — stream di errore attivo");

            while (isBroadcasting) {
                bool anyStreaming = false;
                {
                    lock_guard<mutex> lk(camerasMtx);
                    for (auto& [id, cam] : cameras)
                        if (cam->isStreaming) { anyStreaming = true; break; }
                }
                if (!anyStreaming) { this_thread::sleep_for(chrono::milliseconds(100)); continue; }

                cv::Mat errFrame(720, 1280, CV_8UC3, cv::Scalar(18, 18, 28));
                cv::putText(errFrame, "AQUIRA  —  NESSUNA CAMERA",
                    cv::Point(330, 310), cv::FONT_HERSHEY_SIMPLEX, 1.1, cv::Scalar(80, 80, 255), 2);
                cv::putText(errFrame, "Collegare webcam o iPhone (Camo) e riavviare",
                    cv::Point(260, 380), cv::FONT_HERSHEY_SIMPLEX, 0.75, cv::Scalar(140, 140, 140), 1);

                vector<uchar> jpeg;
                cv::imencode(".jpg", errFrame, jpeg, { cv::IMWRITE_JPEG_QUALITY, 60 });
                {
                    lock_guard<mutex> lk(camerasMtx);
                    for (auto& [id, cam] : cameras)
                        if (cam->isStreaming) cam->pushEncodedFrame(jpeg, 0);
                }
                this_thread::sleep_for(chrono::milliseconds(500));
            }
            isBroadcasting = false;
            return;
        }

        con::ok("Webcam indice " + to_string(vision.openedIndex()) + " pronta — streaming avviato");

        try {
            int   frameBatch  = 0;
            float measuredFps = 30.0f;
            int   lastFps     = 0;
            size_t lastKb     = 0;
            auto  t0          = chrono::steady_clock::now();
            auto  tLastFrame  = chrono::steady_clock::now();

            while (isBroadcasting) {
                bool anyStreaming = false;
                {
                    lock_guard<mutex> lk(camerasMtx);
                    for (auto& [id, cam] : cameras)
                        if (cam->isStreaming) { anyStreaming = true; break; }
                }
                if (!anyStreaming) {
                    this_thread::sleep_for(chrono::milliseconds(20));
                    continue;
                }

                auto now = chrono::steady_clock::now();
                auto elapsed = chrono::duration_cast<chrono::milliseconds>(now - tLastFrame).count();
                if (elapsed < 33)
                    this_thread::sleep_for(chrono::milliseconds(33 - elapsed));
                tLastFrame = chrono::steady_clock::now();

                int score = 100;
                cv::Mat raw;
                cv::Mat processed = vision.acquire(score, raw);
                if (processed.empty()) {
                    this_thread::sleep_for(chrono::milliseconds(10));
                    continue;
                }

                frameBatch++;

                vector<uchar> jpeg;
                cv::imencode(".jpg", processed, jpeg, { cv::IMWRITE_JPEG_QUALITY, 65 });

                vector<shared_ptr<CameraStream>> active;
                {
                    lock_guard<mutex> lk(camerasMtx);
                    for (auto& [id, cam] : cameras)
                        if (cam->isStreaming) active.push_back(cam);
                }
                for (auto& cam : active)
                    cam->pushEncodedFrame(jpeg, score);

                if (frameBatch % 30 == 0) {
                    auto   t1  = chrono::steady_clock::now();
                    double sec = chrono::duration<double>(t1 - t0).count();
                    measuredFps = static_cast<float>(30.0 / max(sec, 0.001));
                    t0 = t1;

                    lastFps = static_cast<int>(measuredFps + 0.5f);
                    lastKb  = jpeg.size() / 1024;
                    {
                        lock_guard<mutex> lk(camerasMtx);
                        for (auto& [id, cam] : cameras)
                            cam->fps.store(lastFps);
                    }

                    // Aggiorna la riga FPS in-place (sovrascrive la precedente)
                    cout << "\r" << con::GRAY << "       " << con::RESET
                         << con::CYAN << "[~~] " << con::RESET
                         << "streaming  "
                         << con::GREEN << lastFps << " fps" << con::RESET
                         << "  " << con::GRAY << lastKb << " KB/frame" << con::RESET
                         << "  score=" << score
                         << "   " << flush;

                    frameBatch = 0;
                }
            }
            cout << "\n";
        }
        catch (const exception& e) { con::err("Broadcaster: " + string(e.what())); }
        catch (...)                 { con::err("Broadcaster: eccezione sconosciuta"); }

        isBroadcasting = false;
        con::warn("Broadcaster fermato");
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL HANDLING
// ══════════════════════════════════════════════════════════════════════════════

Server* gSvr = nullptr;

BOOL WINAPI consoleHandler(DWORD signal) {
    if (signal == CTRL_C_EVENT || signal == CTRL_BREAK_EVENT || signal == CTRL_CLOSE_EVENT) {
        cout << "\n";
        con::warn("Shutdown richiesto — arresto in corso...");
        isBroadcasting = false;
        if (gSvr) gSvr->stop();
        return TRUE;
    }
    return FALSE;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

int main() {
    con::enableAnsi();
    SetConsoleOutputCP(CP_UTF8);

    cout << "\n"
         << con::CYAN << con::BOLD
         << "  ╔══════════════════════════════════════════════════╗\n"
         << "  ║                                                  ║\n"
         << "  ║   AQUIRA  INDUSTRIAL  VISION  —  v6  (OpenCV)   ║\n"
         << "  ║                                                  ║\n"
         << "  ╚══════════════════════════════════════════════════╝\n"
         << con::RESET << "\n";

    Server svr;
    gSvr = &svr;
    SetConsoleCtrlHandler(consoleHandler, TRUE);

    svr.new_task_queue = [] { return new ThreadPool(32); };
    svr.set_read_timeout(5, 0);
    svr.set_write_timeout(60, 0);
    svr.set_idle_interval(0, 500000);

    svr.set_default_headers({
        {"Access-Control-Allow-Origin",  "*"},
        {"Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"},
        {"Access-Control-Allow-Headers", "Content-Type, Authorization"},
    });

    svr.Options("/(.*)", [](const Request&, Response& res) { res.status = 204; });

    // ── GET /api/health ───────────────────────────────────────────────────────
    svr.Get("/api/health", [](const Request&, Response& res) {
        lock_guard<mutex> lk(camerasMtx);
        int activeStreams = 0;
        json camsArr = json::array();
        for (const auto& [id, cam] : cameras) {
            if (cam->isStreaming) activeStreams++;
            camsArr.push_back({
                {"cameraId",   id},
                {"id",         id},
                {"streaming",  cam->isStreaming.load()},
                {"frameCount", cam->frameCount.load()},
                {"fps",        cam->fps.load()},
                {"currentFps", cam->fps.load()},
            });
        }
        res.set_content(json{
            {"status",               "OK"},
            {"service",              "AQUIRA Broadcaster V6 (OpenCV)"},
            {"cameraIndex",          g_cameraIndex},
            {"activeCameras",        (int)cameras.size()},
            {"activeStreams",         activeStreams},
            {"hardwareBroadcasting", isBroadcasting.load()},
            {"cameras",              camsArr},
        }.dump(), "application/json");
    });

    // ── GET /api/cameras/enumerate ────────────────────────────────────────────
    // Scansiona i dispositivi video 0-9 e restituisce quelli attivi.
    // Utile per scoprire l'indice di iPhone (Camo/EpocCam) o cam virtuali.
    svr.Get("/api/cameras/enumerate", [](const Request&, Response& res) {
        auto list = VisionSystem::enumerate();
        json arr = json::array();
        for (const auto& c : list)
            arr.push_back({
                {"index",  c.index},
                {"width",  c.width},
                {"height", c.height},
            });
        res.set_content(json{ {"cameras", arr} }.dump(), "application/json");
    });

    // ── GET /api/cameras ──────────────────────────────────────────────────────
    svr.Get("/api/cameras", [](const Request&, Response& res) {
        lock_guard<mutex> lk(camerasMtx);
        json arr = json::array();
        for (const auto& [id, cam] : cameras)
            arr.push_back({
                {"id",         id},
                {"name",       cam->name},
                {"streaming",  cam->isStreaming.load()},
                {"frameCount", cam->frameCount.load()},
                {"fps",        cam->fps.load()},
            });
        res.set_content(json{ {"cameras", arr} }.dump(), "application/json");
    });

    // ── GET /api/frame ────────────────────────────────────────────────────────
    svr.Get("/api/frame", [](const Request& req, Response& res) {
        if (!req.has_param("cameraId")) {
            res.status = 400;
            res.set_content(R"({"error":"cameraId required"})", "application/json");
            return;
        }
        auto cam = getOrCreateCamera(req.get_param_value("cameraId"));
        if (!cam->isStreaming || cam->getFrameJpeg().empty()) {
            res.set_content(R"({"ready":false})", "application/json");
            return;
        }
        res.set_content(json{
            {"success",    true},
            {"cameraId",   cam->id},
            {"frameCount", cam->frameCount.load()},
            {"score",      cam->qualityScore},
            {"imageData",  cam->getFrameBase64()},
        }.dump(), "application/json");
    });

    // ── POST /api/camera/start ────────────────────────────────────────────────
    svr.Post("/api/camera/start", [](const Request& req, Response& res) {
        json body = parseJsonBody(req.body);
        string camId = body.value("cameraId", "default");
        int camIndex = body.value("cameraIndex", g_cameraIndex);
        g_cameraIndex = camIndex;

        auto cam = getOrCreateCamera(camId);
        startBroadcaster(camIndex);

        cam->start();
        res.set_content(
            json{ {"success", true}, {"cameraId", cam->id}, {"streaming", true}, {"cameraIndex", camIndex} }.dump(),
            "application/json");
    });

    // ── POST /api/camera/stop ─────────────────────────────────────────────────
    svr.Post("/api/camera/stop", [](const Request& req, Response& res) {
        json body = parseJsonBody(req.body);
        string camId = canonicalId(body.value("cameraId", "default"));
        {
            lock_guard<mutex> lk(camerasMtx);
            auto it = cameras.find(camId);
            if (it != cameras.end()) it->second->stop();
        }
        res.set_content(
            json{ {"success", true}, {"cameraId", camId}, {"streaming", false} }.dump(),
            "application/json");
    });

    // ── POST /api/camera/reset ────────────────────────────────────────────────
    svr.Post("/api/camera/reset", [](const Request&, Response& res) {
        con::info("Reset camera richiesto");
        isBroadcasting = false;
        {
            lock_guard<mutex> initLk(broadcasterMtx);
            if (broadcasterThread && broadcasterThread->joinable()) {
                broadcasterThread->join();
                broadcasterThread.reset();
            }
            lock_guard<mutex> lk(camerasMtx);
            for (auto& [id, cam] : cameras) cam->stop();
        }
        res.set_content(
            json{ {"success", true}, {"message", "Broadcaster fermato"} }.dump(),
            "application/json");
    });

    // ── GET /api/stream/mjpeg ─────────────────────────────────────────────────
    svr.Get("/api/stream/mjpeg", [](const Request& req, Response& res) {
        string camId = req.has_param("cameraId")
            ? req.get_param_value("cameraId") : "default";
        camId = canonicalId(camId);

        res.set_header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.set_header("Connection", "close");
        res.set_header("X-Accel-Buffering", "no");

        shared_ptr<CameraStream> cam;
        for (int i = 0; i < 30 && !cam; i++) {
            {
                lock_guard<mutex> lk(camerasMtx);
                auto it = cameras.find(camId);
                if (it != cameras.end() && it->second->isStreaming)
                    cam = it->second;
            }
            if (!cam) this_thread::sleep_for(chrono::milliseconds(100));
        }

        // Auto-start se la camera non è attiva
        if (!cam) {
            con::info("MJPEG: camera " + camId + " non attiva — auto-start");
            startBroadcaster(g_cameraIndex);
            if (isBroadcasting) {
                auto c = getOrCreateCamera(camId);
                c->start();
                for (int i = 0; i < 20 && !cam; i++) {
                    this_thread::sleep_for(chrono::milliseconds(100));
                    lock_guard<mutex> lk(camerasMtx);
                    auto it = cameras.find(camId);
                    if (it != cameras.end() && it->second->isStreaming)
                        cam = it->second;
                }
            }
        }

        if (!cam) {
            res.status = 503;
            res.set_content(
                R"({"error":"Webcam non disponibile. Collegare una webcam e riavviare."})",
                "application/json");
            return;
        }

        for (int i = 0; i < 300 && cam->isStreaming && cam->getFrameJpeg().empty(); i++)
            this_thread::sleep_for(chrono::milliseconds(10));

        uint32_t lastSent = UINT32_MAX;

        res.set_chunked_content_provider(
            "multipart/x-mixed-replace;boundary=frame",
            [cam, lastSent](size_t, DataSink& sink) mutable -> bool {
                if (!sink.is_writable() || !cam->isStreaming) return false;

                uint32_t cur = cam->frameCount.load();
                if (cur == lastSent) {
                    cam->waitFrame(lastSent, 200);
                    if (!sink.is_writable() || !cam->isStreaming) return false;
                    cur = cam->frameCount.load();
                    if (cur == lastSent) return true;
                }
                lastSent = cur;

                vector<uchar> jpeg = cam->getFrameJpeg();
                if (jpeg.empty()) return true;

                string hdr = "\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                    + to_string(jpeg.size()) + "\r\n\r\n";
                if (!sink.write(hdr.data(), hdr.size())) return false;
                if (!sink.write(reinterpret_cast<const char*>(jpeg.data()), jpeg.size())) return false;
                return sink.is_writable();
            });
    });

    // ── GET /api/stream/ws ────────────────────────────────────────────────────
    svr.Get("/api/stream/ws", [](const Request& req, Response& res) {
        string camId = req.has_param("cameraId")
            ? req.get_param_value("cameraId") : "default";
        camId = canonicalId(camId);

        shared_ptr<CameraStream> cam;
        {
            lock_guard<mutex> lk(camerasMtx);
            auto it = cameras.find(camId);
            if (it != cameras.end()) cam = it->second;
        }
        if (!cam || !cam->isStreaming) {
            res.status = 400;
            res.set_content(R"({"error":"Camera not streaming"})", "application/json");
            return;
        }

        res.set_header("Cache-Control", "no-cache");
        res.set_header("X-Accel-Buffering", "no");

        uint32_t lastSent = UINT32_MAX;
        res.set_chunked_content_provider(
            "application/octet-stream",
            [cam, lastSent](size_t, DataSink& sink) mutable -> bool {
                if (!sink.is_writable() || !cam->isStreaming) return false;

                uint32_t cur = cam->frameCount.load();
                if (cur == lastSent) {
                    cam->waitFrame(lastSent, 200);
                    if (!sink.is_writable() || !cam->isStreaming) return false;
                    cur = cam->frameCount.load();
                    if (cur == lastSent) return true;
                }
                lastSent = cur;

                vector<uchar> jpeg = cam->getFrameJpeg();
                if (jpeg.empty()) return true;

                uint32_t len = static_cast<uint32_t>(jpeg.size());
                if (!sink.write(reinterpret_cast<const char*>(&len), 4)) return false;
                if (!sink.write(reinterpret_cast<const char*>(jpeg.data()), jpeg.size())) return false;
                return sink.is_writable();
            });
    });

    // ── Startup ───────────────────────────────────────────────────────────────
    const int PORT = 8080;

    // Raccoglie IP locali e stampa gli URL di rete
    auto printNetworkUrls = [&]() {
        ULONG bufLen = 15000;
        vector<BYTE> buf(bufLen);
        auto* adapters = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data());
        DWORD flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;
        bool found = false;
        if (GetAdaptersAddresses(AF_INET, flags, nullptr, adapters, &bufLen) == NO_ERROR) {
            for (auto* a = adapters; a; a = a->Next) {
                if (a->OperStatus != IfOperStatusUp) continue;
                for (auto* u = a->FirstUnicastAddress; u; u = u->Next) {
                    auto* sa = reinterpret_cast<sockaddr_in*>(u->Address.lpSockaddr);
                    char ip[INET_ADDRSTRLEN];
                    inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip));
                    string s(ip);
                    if (s == "127.0.0.1") continue;
                    cout << "  " << con::GREEN << "  ► " << con::RESET
                         << con::WHITE << "http://" << s << ":" << PORT
                         << "/api/stream/mjpeg?cameraId=cam-01" << con::RESET << "\n";
                    found = true;
                }
            }
        }
        if (!found)
            con::warn("Nessun indirizzo di rete trovato — verifica la connessione");
    };

    con::ok("HTTP server in ascolto su porta " + to_string(PORT));
    cout << "\n  " << con::BOLD << con::CYAN
         << "URL stream (aprire sul browser o su Aquira):" << con::RESET << "\n";
    printNetworkUrls();

    cout << "\n  " << con::GRAY
         << "  Endpoints disponibili:\n"
         << "    GET  /api/health\n"
         << "    GET  /api/cameras/enumerate\n"
         << "    POST /api/camera/start   { cameraId, cameraIndex }  (-1=auto)\n"
         << "    POST /api/camera/stop    { cameraId }\n"
         << "    POST /api/camera/reset\n"
         << "    GET  /api/stream/mjpeg?cameraId=X\n"
         << "    GET  /api/frame?cameraId=X\n"
         << con::RESET << "\n"
         << "  " << con::GRAY << "  Ctrl+C per uscire\n" << con::RESET << "\n";

    svr.listen("0.0.0.0", PORT);

    // ── Clean shutdown ────────────────────────────────────────────────────────
    con::info("Arresto broadcaster...");
    isBroadcasting = false;
    if (broadcasterThread && broadcasterThread->joinable())
        broadcasterThread->join();

    {
        lock_guard<mutex> lk(camerasMtx);
        for (auto& [id, cam] : cameras) cam->stop();
    }

    con::ok("Shutdown completato");
    return 0;
}
