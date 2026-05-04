/**
 * AQUIRA Web Dashboard — Backend Server
 * Multi-camera MPEG relay + WebSocket event bus
 * Optimized for 6-10 cameras @ 30fps
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import nodemailer from 'nodemailer';
import { EMAIL_CONFIG } from './emailConfig.js';

const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.pass },
});

const PORT = process.env.PORT || 3000;
const MPEG_PORT = process.env.MPEG_PORT || 8082;

// ═══════════════════════════════════════════════════════════════════════════
// EVENT BUS — pub/sub for production, analytics, system events
// ═══════════════════════════════════════════════════════════════════════════
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  broadcast(topic, payload) {
    this.emit(topic, payload);
  }
}

const eventBus = new EventBus();

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-CAMERA MPEG RELAY — Connection pooling + frame buffering
// ═══════════════════════════════════════════════════════════════════════════
class MPEGRelay {
  constructor() {
    this.streams = new Map(); // camId -> stream state
    // Measure real FPS every second from actual frame arrivals
    setInterval(() => this._tickFps(), 1000);
  }

  _tickFps() {
    const now = Date.now();
    for (const [, stream] of this.streams) {
      const secs = (now - stream._fpsWindowStart) / 1000;
      stream.fps = secs > 0 ? parseFloat((stream._framesSinceLastTick / secs).toFixed(1)) : 0;
      stream._framesSinceLastTick = 0;
      stream._fpsWindowStart = now;
    }
  }

  registerStream(camId) {
    if (!this.streams.has(camId)) {
      this.streams.set(camId, {
        clients: new Set(),
        fps: 0,
        lastFrameTime: 0,
        frameCount: 0,
        _framesSinceLastTick: 0,
        _fpsWindowStart: Date.now(),
      });
    }
  }

  pushFrame(camId, chunk) {
    if (!this.streams.has(camId)) this.registerStream(camId);
    const stream = this.streams.get(camId);

    stream.frameCount++;
    stream.lastFrameTime = Date.now();
    stream._framesSinceLastTick++;

    for (const client of stream.clients) {
      if (client.readyState === 1) {
        client.send(chunk, { binary: true }, (err) => {
          if (err) stream.clients.delete(client);
        });
      }
    }
  }

  subscribe(camId, client) {
    if (!this.streams.has(camId)) this.registerStream(camId);
    const stream = this.streams.get(camId);
    stream.clients.add(client);
    client.once('close', () => stream.clients.delete(client));
  }

  getStats(camId) {
    const stream = this.streams.get(camId);
    if (!stream) return null;
    return {
      fps: stream.fps,
      frameCount: stream.frameCount,
      activeClients: stream.clients.size,
      active: stream.lastFrameTime > 0 && (Date.now() - stream.lastFrameTime) < 3000,
    };
  }
}

const mpegRelay = new MPEGRelay();

// ═══════════════════════════════════════════════════════════════════════════
// HTTP SERVER — Handles MPEG push from C++, WebSocket upgrades
// ═══════════════════════════════════════════════════════════════════════════
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // MPEG frame push from C++ encoder: POST /video/:camId
  if (req.method === 'POST' && pathname.startsWith('/video/')) {
    const camId = pathname.split('/')[2];
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const data = Buffer.concat(chunks);
      mpegRelay.pushFrame(camId, data);
      res.writeHead(200);
      res.end();
    });
    return;
  }

  // System health check
  if (pathname === '/health') {
    const stats = Array.from(mpegRelay.streams.entries()).map(([camId, stream]) => ({
      camId,
      fps: stream.fps,
      frameCount: stream.frameCount,
      clients: stream.clients.size,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', wsClients: wss.clients.size, cameras: stats }));
    return;
  }

  // Debug endpoint
  if (pathname === '/debug') {
    const debug = {
      server: 'running',
      port: PORT,
      wsClients: wss.clients.size,
      streams: Array.from(mpegRelay.streams.keys()),
      timestamp: new Date().toISOString(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(debug, null, 2));
    return;
  }

  // Support form submission
  if (req.method === 'POST' && pathname === '/api/support') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const d = JSON.parse(Buffer.concat(chunks).toString());
        const priority = (d.priority || 'medium').toUpperCase();
        await mailer.sendMail({
          from:    `"AQUIRA Support" <${EMAIL_CONFIG.user}>`,
          to:      EMAIL_CONFIG.to,
          subject: `[AQUIRA Support] [${priority}] ${d.subject}`,
          text:
            `Company / Name: ${d.azienda}\n` +
            `Reply-to: ${d.email}\n` +
            `Priority: ${priority}\n` +
            `\n${d.message}`,
        });
        console.log('[SUPPORT] email sent —', d.subject);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error('[SUPPORT] send failed:', e.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Diagnostics endpoint — stato completo del sistema
  if (pathname === '/api/diag') {
    const now2 = Date.now();
    const streams = Array.from(mpegRelay.streams.entries()).map(([camId, stream]) => ({
      camId,
      fps:        stream.fps,
      frameCount: stream.frameCount,
      clients:    stream.clients.size,
      active:     stream.lastFrameTime > 0 && (now2 - stream.lastFrameTime) < 3000,
      lastFrameAgo: stream.lastFrameTime > 0 ? now2 - stream.lastFrameTime : null,
    }));
    const body = JSON.stringify({
      ts:          new Date().toISOString(),
      uptime:      process.uptime(),
      wsClients:   wss.clients.size,
      busClients:  busClients.size,
      streams,
      activeStreams: streams.filter(s => s.active).length,
      totalFrames:  streams.reduce((a, s) => a + s.frameCount, 0),
      mem:         process.memoryUsage(),
    }, null, 2);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
    return;
  }

  // Default 404
  res.writeHead(404);
  res.end('Not found');
});

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET SERVER — Real-time events + stream subscription + bus protocol
// ═══════════════════════════════════════════════════════════════════════════
const wss = new WebSocketServer({ server });
const busClients = new Set(); // clients connected via /bus

console.log('[WSS] WebSocket server initialized on same HTTP server');

function busSend(ws, type, payload) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify({ type, payload })); } catch {}
  }
}

function busBroadcast(type, payload) {
  busClients.forEach(ws => busSend(ws, type, payload));
}

wss.on('connection', (ws, req) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const camId = urlObj.searchParams.get('cam');

  // ── MPEG stream mode: JSMpeg player per-camera ──────────────────────────
  if (camId) {
    mpegRelay.registerStream(camId);
    mpegRelay.subscribe(camId, ws);
    console.log(`[STREAM] Client connected to camera: ${camId}`);
    ws.on('error', (err) => console.error('[WS Stream Error]', err.message));
    return;
  }

  // ── Bus mode: /bus path or no cam param ─────────────────────────────────
  busClients.add(ws);

  // Subscribe to internal event topics and forward with `type` field
  const topics = ['system.health', 'production.event', 'camera.fps', 'analytics.timeline'];
  const handlers = {};
  topics.forEach((topic) => {
    handlers[topic] = (payload) => busSend(ws, topic, payload);
    eventBus.on(topic, handlers[topic]);
  });

  // Handle incoming messages from dashboard clients
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join':
        busSend(ws, 'bus.welcome', { peers: [] });
        console.log(`[BUS] Dashboard joined: ${msg.id || 'unknown'}`);
        break;

      case 'ping':
        busSend(ws, 'pong', null);
        break;

      case 'camera.command': {
        const { action, cameraId } = msg.payload || {};
        if (action === 'start' && cameraId) {
          mpegRelay.registerStream(cameraId);
          // Confirm streaming started
          busSend(ws, 'camera.status', { cameraId, streaming: true });
          console.log(`[BUS] Camera start: ${cameraId}`);
        } else if (action === 'stop' && cameraId) {
          busSend(ws, 'camera.status', { cameraId, streaming: false });
          console.log(`[BUS] Camera stop: ${cameraId}`);
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    busClients.delete(ws);
    topics.forEach((topic) => eventBus.off(topic, handlers[topic]));
  });

  ws.on('error', (err) => console.error('[WS Bus Error]', err.message));
  console.log('[BUS] Client connected');
});

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION — Fake production events + system health
// ═══════════════════════════════════════════════════════════════════════════
setInterval(() => {
  const defectRate = Math.random() < 0.07;
  eventBus.broadcast('production.event', {
    id: Date.now(),
    time: new Date().toLocaleTimeString('it-IT'),
    type: defectRate ? ['GRAFFI_SUP', 'MISALIGN', 'COLORE_KO'][Math.floor(Math.random() * 3)] : 'PASS',
    ok: !defectRate,
    score: defectRate ? 65 + Math.random() * 25 : 98 + Math.random() * 2,
    camId: `cam-${Math.floor(Math.random() * 6) + 1}`,
  });
}, 1600);

setInterval(() => {
  const now = Date.now();
  const streams = Array.from(mpegRelay.streams.entries()).map(([cameraId, stream]) => ({
    cameraId,
    fps: stream.fps,
    frameCount: stream.frameCount,
    running: stream.lastFrameTime > 0 && (now - stream.lastFrameTime) < 3000,
    clients: stream.clients.size,
  }));

  const activeStreams = streams.filter(s => s.running).length;

  eventBus.broadcast('system.health', {
    timestamp: now,
    cppServer: activeStreams > 0 ? 'online' : 'offline',
    activeStreams,
    streams,
  });

  // Emit per-camera fps on the camera.fps topic so the dashboard picks it up
  streams.forEach(s => {
    if (s.fps > 0 || s.running) {
      eventBus.broadcast('camera.fps', {
        camId: s.cameraId,
        fps: s.fps,
        frameCount: s.frameCount,
      });
    }
  });
}, 2000);

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════
server.listen(PORT, () => {
  console.log(`\n🦅 AQUIRA Backend — Port ${PORT}`);
  console.log(`   ├─ WebSocket events: ws://localhost:${PORT}?type=events`);
  console.log(`   ├─ MPEG streams: ws://localhost:${PORT}?type=stream&cam=CAM-01`);
  console.log(`   ├─ Health check: http://localhost:${PORT}/health`);
  console.log(`   └─ Support API: POST http://localhost:${PORT}/api/support\n`);

  // Streams register automatically on first frame from C++ encoder
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.close();
  process.exit(0);
});
