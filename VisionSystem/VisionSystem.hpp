#ifndef VISIONSYSTEM_HPP
#define VISIONSYSTEM_HPP

#include <string>
#include <vector>
#include <mutex>
#include <atomic>
#include <functional>
#include <iostream>
#include <chrono>
#include <thread>
#include <cctype>

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <dshow.h>
#pragma comment(lib, "mf.lib")
#pragma comment(lib, "mfplat.lib")
#pragma comment(lib, "mfuuid.lib")
#pragma comment(lib, "strmiids.lib")
#include <opencv2/opencv.hpp>
#include <opencv2/core/utils/logger.hpp>

// ─────────────────────────────────────────────────────────────────────────────
// Console helpers — ANSI colors + log con timestamp
// ─────────────────────────────────────────────────────────────────────────────
namespace con {
    inline void enableAnsi() {
        HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
        DWORD mode = 0;
        GetConsoleMode(h, &mode);
        SetConsoleMode(h, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
    }

    // Colori ANSI
    constexpr const char* RESET   = "\033[0m";
    constexpr const char* BOLD    = "\033[1m";
    constexpr const char* DIM     = "\033[2m";
    constexpr const char* GREEN   = "\033[92m";
    constexpr const char* YELLOW  = "\033[93m";
    constexpr const char* RED     = "\033[91m";
    constexpr const char* CYAN    = "\033[96m";
    constexpr const char* MAGENTA = "\033[95m";
    constexpr const char* WHITE   = "\033[97m";
    constexpr const char* GRAY    = "\033[90m";

    inline std::string timestamp() {
        auto now = std::chrono::system_clock::now();
        auto t   = std::chrono::system_clock::to_time_t(now);
        struct tm tm_buf;
        localtime_s(&tm_buf, &t);
        char buf[12];
        strftime(buf, sizeof(buf), "%H:%M:%S", &tm_buf);
        return std::string(GRAY) + buf + RESET;
    }

    inline void ok  (const std::string& msg) { std::cout << timestamp() << "  " << GREEN  << "[OK] " << RESET << msg << "\n"; }
    inline void info(const std::string& msg) { std::cout << timestamp() << "  " << CYAN   << "[~~] " << RESET << msg << "\n"; }
    inline void warn(const std::string& msg) { std::cout << timestamp() << "  " << YELLOW << "[!!] " << RESET << msg << "\n"; }
    inline void err (const std::string& msg) { std::cout << timestamp() << "  " << RED    << "[XX] " << RESET << msg << "\n"; }
    inline void dim (const std::string& msg) { std::cout << GRAY << "       " << msg << RESET << "\n"; }
}

// ─────────────────────────────────────────────────────────────────────────────
// VisionSystem — OpenCV webcam wrapper
//
// init(-1)  → auto-scan indici 0-9, usa il primo che risponde (default)
// init(N)   → forza indice N (es. Camo su indice 1)
// enumerate() → lista statica delle cam disponibili
// ─────────────────────────────────────────────────────────────────────────────
class VisionSystem {
public:
    struct CameraInfo {
        int index;
        int width;
        int height;
    };

    static std::vector<CameraInfo> enumerate(int maxIndex = 9) {
        cv::utils::logging::setLogLevel(cv::utils::logging::LOG_LEVEL_SILENT);
        std::vector<CameraInfo> result;
        for (int i = 0; i <= maxIndex; ++i) {
            cv::VideoCapture tmp;
            if (!tmp.open(i)) continue;
            cv::Mat probe;
            tmp >> probe;
            if (probe.empty()) { tmp.release(); continue; }
            result.push_back({ i, probe.cols, probe.rows });
            tmp.release();
        }
        return result;
    }

    VisionSystem() {
        cv::utils::logging::setLogLevel(cv::utils::logging::LOG_LEVEL_SILENT);
    }

    ~VisionSystem() {
        destroying = true;
        std::lock_guard<std::mutex> lk(hwMtx);
        destroyHW();
    }

    VisionSystem(const VisionSystem&)            = delete;
    VisionSystem& operator=(const VisionSystem&) = delete;

    void setStatusCallback(std::function<void(bool)> cb) { onStatus = std::move(cb); }

    // cameraIndex: -1 = auto-scan, N = indice specifico
    bool init(int cameraIndex = -1) {
        lastCameraIndex = cameraIndex;
        deviceLost      = false;
        std::lock_guard<std::mutex> lk(hwMtx);
        return initHW();
    }

    void setFilter(std::string f)    { filter = std::move(f); }
    void setMaster(const cv::Mat& m) { if (!m.empty()) { m.copyTo(master); calib = true; } }

    bool isReady()     const { return hwOk && !deviceLost; }
    bool isDeviceLost()const { return deviceLost.load(); }
    int  openedIndex() const { return lastCameraIndex; }

    cv::Mat acquire(int& score, cv::Mat& rawOut) {
        cv::Mat result;
        score = 100;
        if (destroying || deviceLost) return result;

        std::lock_guard<std::mutex> lk(hwMtx);
        if (!hwOk || !cap.isOpened()) return result;

        cv::Mat frame;
        cap >> frame;
        if (frame.empty()) {
            if (++seqTimeouts >= 10) {
                con::warn("Camera disconnessa — avvio reconnect...");
                destroyHW();
                deviceLost = true;
                spawnReconnect();
            }
            return result;
        }
        seqTimeouts = 0;
        frame.copyTo(rawOut);
        result = applyFilter(frame, score);
        return result;
    }

private:
    cv::VideoCapture cap;
    bool hwOk        = false;
    int  seqTimeouts = 0;
    int  lastCameraIndex = -1;
    std::mutex hwMtx;

    cv::Mat     master;
    bool        calib  = false;
    std::string filter = "RAW";

    std::atomic<bool> destroying  { false };
    std::atomic<bool> deviceLost  { false };
    std::atomic<bool> recoRunning { false };
    std::thread       recoThread;
    std::mutex        recoMtx;

    std::function<void(bool)> onStatus;

    void destroyHW() {
        if (cap.isOpened()) cap.release();
        hwOk        = false;
        seqTimeouts = 0;
    }

    // Enumera i dispositivi video tramite Media Foundation → lista di nomi friendly
    static std::vector<std::string> mfEnumerateNames() {
        std::vector<std::string> result;
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (FAILED(MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET))) return result;

        IMFAttributes* pAttr = nullptr;
        if (SUCCEEDED(MFCreateAttributes(&pAttr, 1))) {
            pAttr->SetGUID(MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
                           MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID);
            IMFActivate** ppDev = nullptr;
            UINT32 count = 0;
            if (SUCCEEDED(MFEnumDeviceSources(pAttr, &ppDev, &count))) {
                for (UINT32 i = 0; i < count; ++i) {
                    WCHAR* name = nullptr; UINT32 len = 0;
                    if (SUCCEEDED(ppDev[i]->GetAllocatedString(
                            MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, &name, &len)) && name) {
                        char buf[512] = {};
                        WideCharToMultiByte(CP_UTF8, 0, name, -1, buf, (int)sizeof(buf) - 1, nullptr, nullptr);
                        if (buf[0]) result.emplace_back(buf);
                        CoTaskMemFree(name);
                    }
                    ppDev[i]->Release();
                }
                CoTaskMemFree(ppDev);
            }
            pAttr->Release();
        }
        MFShutdown();
        return result;
    }

    // Enumera dispositivi video tramite DirectShow COM → cattura anche camera virtuali (Camo, EpocCam)
    static std::vector<std::string> dsEnumerateNames() {
        std::vector<std::string> result;
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        ICreateDevEnum* pDevEnum = nullptr;
        if (FAILED(CoCreateInstance(CLSID_SystemDeviceEnum, nullptr,
                CLSCTX_INPROC_SERVER, IID_ICreateDevEnum, (void**)&pDevEnum)))
            return result;
        IEnumMoniker* pEnum = nullptr;
        if (SUCCEEDED(pDevEnum->CreateClassEnumerator(
                CLSID_VideoInputDeviceCategory, &pEnum, 0)) && pEnum) {
            IMoniker* pMon = nullptr;
            while (pEnum->Next(1, &pMon, nullptr) == S_OK) {
                IPropertyBag* pBag = nullptr;
                if (SUCCEEDED(pMon->BindToStorage(nullptr, nullptr,
                        IID_IPropertyBag, (void**)&pBag))) {
                    VARIANT var; VariantInit(&var);
                    if (SUCCEEDED(pBag->Read(L"FriendlyName", &var, nullptr)) && var.bstrVal) {
                        char buf[512] = {};
                        WideCharToMultiByte(CP_UTF8, 0, var.bstrVal, -1,
                            buf, (int)sizeof(buf) - 1, nullptr, nullptr);
                        if (buf[0]) result.emplace_back(buf);
                    }
                    VariantClear(&var);
                    pBag->Release();
                }
                pMon->Release();
            }
            pEnum->Release();
        }
        pDevEnum->Release();
        return result;
    }

    // Apre una camera per nome friendly via DSHOW ("video=<nome>")
    // — funziona con Camo, EpocCam e qualsiasi camera virtuale
    bool tryOpenByName(const std::string& friendlyName) {
        if (destroying) return false;
        std::string src = "video=" + friendlyName;
        con::dim("  provo \"" + friendlyName + "\"...");
        if (cap.open(src, cv::CAP_DSHOW)) {
            cv::Mat probe;
            cap >> probe;
            if (!probe.empty()) {
                cap.set(cv::CAP_PROP_FRAME_WIDTH,  1280);
                cap.set(cv::CAP_PROP_FRAME_HEIGHT, 720);
                cap.set(cv::CAP_PROP_FPS,          30);
                int w = static_cast<int>(cap.get(cv::CAP_PROP_FRAME_WIDTH));
                int h = static_cast<int>(cap.get(cv::CAP_PROP_FRAME_HEIGHT));
                con::ok("Camera aperta: \"" + friendlyName + "\"  "
                        + std::to_string(w) + "x" + std::to_string(h));
                hwOk = true;
                return true;
            }
            con::warn("\"" + friendlyName + "\" aperta ma frame vuoto");
            cap.release();
        }
        return false;
    }

    // Fallback: apertura per indice (AUTO → DSHOW → MSMF)
    bool tryOpenByIndex(int idx) {
        static const char* bnames[] = { "AUTO", "DSHOW", "MSMF" };
        static const int   bapis[]  = { -1, cv::CAP_DSHOW, cv::CAP_MSMF };
        for (int b = 0; b < 3; ++b) {
            if (destroying) return false;
            con::dim("  provo " + std::string(bnames[b]) + " idx=" + std::to_string(idx) + "...");
            bool opened = (bapis[b] < 0) ? cap.open(idx) : cap.open(idx, bapis[b]);
            if (opened) {
                cv::Mat probe;
                cap >> probe;
                if (!probe.empty()) {
                    cap.set(cv::CAP_PROP_FRAME_WIDTH,  1280);
                    cap.set(cv::CAP_PROP_FRAME_HEIGHT, 720);
                    cap.set(cv::CAP_PROP_FPS,          30);
                    int w = static_cast<int>(cap.get(cv::CAP_PROP_FRAME_WIDTH));
                    int h = static_cast<int>(cap.get(cv::CAP_PROP_FRAME_HEIGHT));
                    con::ok("Camera aperta — " + std::string(bnames[b])
                            + " idx=" + std::to_string(idx)
                            + "  " + std::to_string(w) + "x" + std::to_string(h));
                    lastCameraIndex = idx;
                    hwOk = true;
                    return true;
                }
                cap.release();
            }
        }
        return false;
    }

    bool initHW() {
        destroyHW();

        // 1) Enumera tramite MF + DirectShow e unisci (DirectShow cattura anche camera virtuali)
        auto mfNames = mfEnumerateNames();
        auto dsNames = dsEnumerateNames();

        con::dim("  MF  trovate: " + std::to_string(mfNames.size()));
        con::dim("  DS  trovate: " + std::to_string(dsNames.size()));
        for (auto& n : mfNames) con::dim("    [MF] " + n);
        for (auto& n : dsNames) con::dim("    [DS] " + n);

        // Merge senza duplicati (DS primo: contiene Camo, EpocCam, ecc.)
        std::vector<std::string> devNames = dsNames;
        for (auto& n : mfNames) {
            bool found = false;
            for (auto& d : devNames) if (d == n) { found = true; break; }
            if (!found) devNames.push_back(n);
        }

        if (devNames.empty()) {
            con::warn("Nessun dispositivo video rilevato (MF + DS)");
            con::warn("→ Verifica: Impostazioni → Privacy → Fotocamera → abilita accesso");
            con::warn("→ Assicurati che Camo Studio sia aperto e il telefono connesso");
        } else {
            con::info(std::to_string(devNames.size()) + " camera/e rilevata/e:");
            for (auto& n : devNames) con::dim("    • " + n);

            // Cerca prima specificamente "Quira" (camera Camo iPhone)
            auto containsCI = [](const std::string& s, const std::string& sub) {
                if (s.size() < sub.size()) return false;
                for (size_t i = 0; i <= s.size() - sub.size(); ++i) {
                    bool ok = true;
                    for (size_t j = 0; j < sub.size(); ++j) {
                        if (std::tolower((unsigned char)s[i+j]) !=
                            std::tolower((unsigned char)sub[j])) { ok = false; break; }
                    }
                    if (ok) return true;
                }
                return false;
            };
            for (const auto& n : devNames) {
                if (containsCI(n, "quira")) {
                    con::info("Camera Quira (Camo iPhone) trovata: \"" + n + "\"");
                    if (!destroying && tryOpenByName(n)) return true;
                    con::warn("\"" + n + "\" trovata ma non apribile");
                }
            }

            if (lastCameraIndex >= 0 && lastCameraIndex < (int)devNames.size()) {
                if (tryOpenByName(devNames[lastCameraIndex])) return true;
            } else {
                for (auto& n : devNames)
                    if (!destroying && tryOpenByName(n)) return true;
            }
        }

        // 2) Fallback per indice con tutti i backend (AUTO, DSHOW, MSMF)
        con::info("Fallback: scan per indice (0-9)...");
        int maxIdx = (lastCameraIndex >= 0) ? lastCameraIndex : 9;
        int minIdx = (lastCameraIndex >= 0) ? lastCameraIndex : 0;
        for (int i = minIdx; i <= maxIdx && !destroying; ++i)
            if (tryOpenByIndex(i)) return true;

        con::err("Nessuna camera accessibile");
        con::err("→ Impostazioni → Privacy e sicurezza → Fotocamera → ON");
        return false;
    }

    // Riconnessione automatica con backoff esponenziale
    void spawnReconnect() {
        bool exp = false;
        if (!recoRunning.compare_exchange_strong(exp, true)) return;
        if (onStatus) onStatus(false);
        std::lock_guard<std::mutex> lk(recoMtx);
        if (recoThread.joinable()) recoThread.join();
        recoThread = std::thread([this]() {
            int attempt = 0;
            while (!destroying && deviceLost) {
                int delayMs = std::min(1000 * (1 << std::min(attempt, 5)), 30000);
                con::warn("Reconnect #" + std::to_string(attempt + 1)
                          + " tra " + std::to_string(delayMs / 1000) + "s...");
                for (int t = 0; t < delayMs && !destroying; t += 200)
                    std::this_thread::sleep_for(std::chrono::milliseconds(200));
                if (destroying) break;
                bool ok;
                {
                    std::lock_guard<std::mutex> lk2(hwMtx);
                    ok = initHW();
                }
                if (ok) {
                    deviceLost = false;
                    con::ok("Camera riconnessa!");
                    if (onStatus) onStatus(true);
                    break;
                }
                ++attempt;
            }
            recoRunning = false;
        });
    }

    cv::Mat applyFilter(const cv::Mat& frame, int& score) {
        cv::Mat gray;
        if (frame.channels() == 3) cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
        else                        gray = frame.clone();

        if (calib && !master.empty()) {
            cv::Mat mg;
            if (master.channels() == 3) cv::cvtColor(master, mg, cv::COLOR_BGR2GRAY);
            else                         mg = master;
            cv::Mat d;
            cv::absdiff(mg, gray, d);
            cv::threshold(d, d, 35, 255, cv::THRESH_BINARY);
            score = 100 - static_cast<int>(
                (cv::countNonZero(d) * 100.0) / (gray.rows * gray.cols));
        }

        cv::Mat result;
        if (filter == "CANNY") {
            cv::Canny(gray, gray, 50, 150);
            cv::cvtColor(gray, result, cv::COLOR_GRAY2BGR);
        } else if (filter == "THRESH") {
            cv::threshold(gray, gray, 128, 255, cv::THRESH_BINARY);
            cv::cvtColor(gray, result, cv::COLOR_GRAY2BGR);
        } else {
            if (frame.channels() == 1) cv::cvtColor(frame, result, cv::COLOR_GRAY2BGR);
            else                        result = frame.clone();
        }
        return result;
    }
};

#endif // VISIONSYSTEM_HPP
