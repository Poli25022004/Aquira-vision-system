import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, useTransition } from 'react';
import CameraView from './components/CameraVIew';
import { useBus } from './hooks/useBus';
import eagleLogo from './assets/icons8-aquila-96.png';


const AnalyticsPanel = lazy(() =>
  import('./panels/AnalyticsPanel.jsx').then(m => ({ default: m.AnalyticsPanel }))
);
const SetupPanel = lazy(() =>
  import('./panels/SetupPanel.jsx').then(m => ({ default: m.SetupPanel }))
);


/* ─── Palette industriale Aquira ────────────────────────────────────────── */
const C = {
  bg:        '#0a0e14',
  bg2:       '#0c121a',
  panel:     '#111a25',
  panel2:    '#0e1620',
  card:      '#14202e',
  border:    '#1d2b3c',
  border2:   '#27384d',
  accent:    '#22e37a',
  accentDim: '#1aa85a',
  cyan:      '#3dd6f5',
  amber:     '#ffb020',
  red:       '#ff4d5e',
  purple:    '#a78bfa',
  text:      '#ffffff',
  textDim:   '#e6edf5',
  muted:     '#8aa0b4',
};
const FONT         = "'Inter','Segoe UI','Helvetica Neue',sans-serif";
const FONT_DISPLAY = "'Barlow Condensed','Rajdhani','Inter',sans-serif";
const FONT_HEAD    = "'Rajdhani','Barlow Condensed','Inter',sans-serif";
const FONT_MONO    = "'JetBrains Mono','Courier New',monospace";

/* ─── Default stations ───────────────────────────────────────────────────── */
const INITIAL_STATIONS = [
  {
    id: '01',
    name: 'Station 01',
    line: 'Line A · Dept. 1',
    cameras: [
      { id: 'cam-01', name: 'CAM-01', label: 'Top Inspection (Genie Nano-M1920)', fps: 30, resolution: '1920x1080' },
    ],
  },
];

/* ─── LED indicator ─────────────────────────────────────────────────────── */
const Led = ({ on, color = C.accent, size = 9, pulse = false }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: on ? color : '#253040',
    boxShadow: on ? `0 0 ${size + 2}px ${color}99` : 'none',
    animation: pulse && on ? 'aqPulse 1.4s ease-in-out infinite' : 'none',
  }} />
);

/* ─── KPI strip chip ────────────────────────────────────────────────────── */
function KpiChip({ label, value, color, sub }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{
        fontSize: 18, color, fontWeight: 800,
        fontFamily: FONT_MONO, lineHeight: 1,
        textShadow: color !== C.text ? `0 0 14px ${color}66` : 'none',
        letterSpacing: 0.5,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color, fontFamily: FONT_MONO, opacity: 0.7, marginTop: 1 }}>{sub}</div>}
      <div style={{
        fontSize: 8, color: C.muted, letterSpacing: 1.6,
        marginTop: 3, fontWeight: 700, textTransform: 'uppercase',
      }}>{label}</div>
    </div>
  );
}

/* ─── Stat card (sidebar) ───────────────────────────────────────────────── */
function StatCard({ label, value, unit, color = C.text, accent, icon }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.card} 0%, #0f1c2a 100%)`,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${accent || C.border2}`,
      borderRadius: 8, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 3,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* glow sfondo */}
      {accent && accent !== C.border2 && (
        <div style={{
          position: 'absolute', top: -10, right: -10,
          width: 40, height: 40, borderRadius: '50%',
          background: accent, opacity: 0.05, pointerEvents: 'none',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 8.5, color: C.muted, letterSpacing: 1.5,
          fontWeight: 700, textTransform: 'uppercase',
        }}>{label}</span>
        {icon && <span style={{ fontSize: 11, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <span style={{
          fontSize: 20, color, fontWeight: 800,
          fontFamily: FONT_MONO, letterSpacing: 0.5,
          textShadow: color !== C.text ? `0 0 12px ${color}44` : 'none',
        }}>{value}</span>
        {unit && <span style={{ fontSize: 10, color: accent || C.muted, fontWeight: 600 }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ─── Section header (sidebar) ──────────────────────────────────────────── */
function SectionHeader({ title, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 9, borderBottom: `1px solid ${C.border}`, marginBottom: 11,
    }}>
      <div style={{
        fontSize: 10, color: C.muted, fontWeight: 700,
        letterSpacing: 2.2, textTransform: 'uppercase',
      }}>{title}</div>
      {right}
    </div>
  );
}

/* ─── TABS definition ───────────────────────────────────────────────────── */
const TABS = [
  { id: 'live',      label: 'LIVE',      dot: true  },
  { id: 'analytics', label: 'ANALYTICS', dot: false },
  { id: 'settings',     label: 'SETTINGS',     dot: false },
];

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function AquiraMainDashboard() {
  const bus = useBus();
  const { reconnecting: busReconnecting } = bus;
  const [, startTransition] = useTransition();

  const [stations,      setStations]      = useState(() => {
    // Reset: al momento supportiamo UNA Genie Nano fisica (cam-01).
    // localStorage ignorato per evitare conflitti con vecchie config.
    try { localStorage.removeItem('aquira_stations'); } catch {}
    return INITIAL_STATIONS;
  });
  const [busStatus,     setBusStatus]     = useState({ connected: false, activeStreams: 0, cppOnline: false });
  const [liveMetrics,   setLiveMetrics]   = useState({ fps: 0, frameCount: 0 });
  const [prodStats,     setProdStats]     = useState({ totalProduced: 0, goodPieces: 0, defects: 0 });
  const [events,        setEvents]        = useState([]);
  const [clock,         setClock]         = useState(new Date());
  const [fullscreenCam, setFullscreenCam] = useState(null);
  const [activeTab,     setActiveTab]     = useState('live');
  const [liveFrames,    setLiveFrames]    = useState({});
  const [startSignal,   setStartSignal]   = useState(0);
  const [stopSignal,    setStopSignal]    = useState(0);
  const [isRunningAll,  setIsRunningAll]  = useState(false);
  const [analyticsTimeline, setAnalyticsTimeline] = useState([]);
  const [analyticsStartedAt, setAnalyticsStartedAt] = useState(null);
  const [stationView,   setStationView]   = useState('grid'); // 'grid' | 'row' | 'vertical'
  const [currentUser,   setCurrentUser]   = useState(null);
  const [loginOpen,     setLoginOpen]     = useState(false);
  const [loginCreds,    setLoginCreds]    = useState({ user: '', pass: '', err: '' });

  const DEMO_USERS = {
    admin:      { name: 'Paola Di Matteo',   role: 'ADMIN',       color: C.red    },
    supervisor: { name: 'Paola Di Matteo',       role: 'SUPERVISOR',  color: C.amber  },
    operatore:  { name: 'Paola Di Matteo',     role: 'OPERATOR',    color: C.accent },
    operator:   { name: 'Paola Di Matteo',     role: 'OPERATOR',    color: C.accent },
  };

  const handleLogin = useCallback((e) => {
    e.preventDefault();
    const u = DEMO_USERS[loginCreds.user.toLowerCase().trim()];
    if (u && loginCreds.pass === '1234') {
      setCurrentUser(u);
      setLoginOpen(false);
      setLoginCreds({ user: '', pass: '', err: '' });
    } else {
      setLoginCreds(p => ({ ...p, err: 'Credenziali non valide' }));
    }
  }, [loginCreds]);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setLoginOpen(false);
  }, []);

  /* Refs for analytics interval (avoid stale closures) */
  const prodStatsRef   = useRef(prodStats);
  const liveMetricsRef = useRef(liveMetrics);
  // Accumula fps per-camera senza setState — flush a 1Hz
  const fpsAccRef      = useRef({});
  useEffect(() => { prodStatsRef.current   = prodStats;   }, [prodStats]);
  useEffect(() => { liveMetricsRef.current = liveMetrics; }, [liveMetrics]);

  // Flush liveMetrics max 1 volta al secondo
  useEffect(() => {
    const iv = setInterval(() => {
      const acc = fpsAccRef.current;
      const ids = Object.keys(acc);
      if (ids.length === 0) return;
      const maxFps = Math.max(...ids.map(k => acc[k].fps || 0));
      const totalFrames = ids.reduce((s, k) => s + (acc[k].frameCount || 0), 0);
      setLiveMetrics(m => {
        if (m.fps === maxFps && m.frameCount === totalFrames) return m;
        return { fps: maxFps, frameCount: totalFrames };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  /* Analytics timeline — campiona ogni 5s (non 2s) per ridurre re-render dei grafici */
  useEffect(() => {
    if (!isRunningAll) return;
    const iv = setInterval(() => {
      const s = prodStatsRef.current;
      const m = liveMetricsRef.current;
      const entry = {
        time:     new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        produced: s.totalProduced,
        good:     s.goodPieces,
        defects:  s.defects,
        fps:      typeof m.fps === 'number' ? parseFloat(m.fps.toFixed(1)) : 0,
      };
      startTransition(() => {
        setAnalyticsTimeline(prev => {
          const next = prev.length >= 40 ? [...prev.slice(1), entry] : [...prev, entry];
          return next;
        });
      });
    }, 5000);
    return () => clearInterval(iv);
  }, [isRunningAll]);

  const anyLive      = useMemo(() => liveMetrics.fps > 0 || busStatus.activeStreams > 0, [liveMetrics.fps, busStatus.activeStreams]);
  const totalCameras = useMemo(() => stations.reduce((a, s) => a + s.cameras.length, 0), [stations]);

  /* Clock */
  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  /* Persist stations to localStorage */
  useEffect(() => {
    try { localStorage.setItem('aquira_stations', JSON.stringify(stations)); } catch { /* quota */ }
  }, [stations]);

  /* Bus connectivity — driven by useBus hook */
  useEffect(() => {
    setBusStatus(s => ({ ...s, connected: bus.connected }));
  }, [bus.connected]);

  /* C++ health check diretto su porta 8080 — ogni 5s */
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
        const online = r.ok;
        setBusStatus(prev => prev.cppOnline === online ? prev : { ...prev, cppOnline: online });
      } catch {
        setBusStatus(prev => prev.cppOnline === false ? prev : { ...prev, cppOnline: false });
      }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  /* system.health topic → activeStreams + FPS reale per stream C++ */
  useEffect(() => {
    return bus.subscribe('system.health', (payload) => {
      setBusStatus(prev => {
        const next = { ...prev, connected: true, activeStreams: payload.activeStreams ?? 0 };
        if (payload.cppServer === 'online') next.cppOnline = true;
        if (prev.connected === next.connected && prev.activeStreams === next.activeStreams && prev.cppOnline === next.cppOnline) return prev;
        return next;
      });
      // Aggiorna FPS per ogni camera attiva riportata dal backend
      if (Array.isArray(payload.streams)) {
        payload.streams.forEach(s => {
          if (s.fps > 0 || s.running) {
            fpsAccRef.current[s.cameraId] = {
              fps:        parseFloat((s.fps || 0).toFixed(1)),
              frameCount: s.frameCount || (fpsAccRef.current[s.cameraId]?.frameCount || 0),
            };
          }
        });
      }
    });
  }, [bus.subscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  /* camera.fps topic → aggiorna FPS per-camera in real-time */
  useEffect(() => {
    return bus.subscribe('camera.fps', (payload) => {
      if (!payload?.camId) return;
      fpsAccRef.current[payload.camId] = {
        fps:        parseFloat((payload.fps || 0).toFixed(1)),
        frameCount: payload.frameCount || (fpsAccRef.current[payload.camId]?.frameCount || 0),
      };
    });
  }, [bus.subscribe]);

  /* production.event topic → update production log */
  useEffect(() => {
    return bus.subscribe('production.event', (payload) => {
      setEvents(prev => [payload, ...prev].slice(0, 50));
      setProdStats(p => ({
        totalProduced: p.totalProduced + 1,
        goodPieces:    p.goodPieces + (payload.ok ? 1 : 0),
        defects:       p.defects + (payload.ok ? 0 : 1),
      }));
    });
  }, [bus.subscribe]);

  /* Production simulation — accumula in ref, flush ogni 3s (riduce re-render) */
  const simAccRef = useRef({ good: 0, bad: 0, entries: [] });
  useEffect(() => {
    const defectTypes = ['GRAFFI_SUP', 'MISALIGN', 'COLORE_KO', 'BORDO_KO', 'DIMENSIONE'];
    // Genera eventi frequentemente ma non aggiorna lo stato ogni volta
    const genIv = setInterval(() => {
      const isDefect = Math.random() < 0.07;
      const entry = {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString('it-IT'),
        type: isDefect ? defectTypes[Math.floor(Math.random() * defectTypes.length)] : 'PASS',
        ok: !isDefect,
        score: isDefect ? Math.round(65 + Math.random() * 25) : 98 + Math.round(Math.random() * 2),
      };
      const acc = simAccRef.current;
      acc.entries.unshift(entry);
      if (acc.entries.length > 50) acc.entries.length = 50;
      if (isDefect) acc.bad++; else acc.good++;
    }, 1600);

    // Flush stato React a 3s — un solo re-render ogni 3s invece di due ogni 1.6s
    const flushIv = setInterval(() => {
      const acc = simAccRef.current;
      if (acc.good === 0 && acc.bad === 0) return;
      const { good, bad, entries } = acc;
      simAccRef.current = { good: 0, bad: 0, entries: [] };
      startTransition(() => {
        setEvents([...entries]);
        setProdStats(p => ({
          totalProduced: p.totalProduced + good + bad,
          goodPieces:    p.goodPieces + good,
          defects:       p.defects + bad,
        }));
      });
    }, 3000);

    return () => { clearInterval(genIv); clearInterval(flushIv); };
  }, []);

  // Scrive nel ref — il flush a 1Hz aggiorna lo stato senza re-render per-frame
  const handleCameraStats = useCallback((stats) => {
    fpsAccRef.current[stats.camId] = {
      fps:        stats.fps ?? (fpsAccRef.current[stats.camId]?.fps || 0),
      frameCount: stats.frameCount ?? (fpsAccRef.current[stats.camId]?.frameCount || 0),
    };
  }, []);

  const handleFrame = useCallback((camId, frame) => {
    setLiveFrames(p => ({ ...p, [camId]: frame }));
  }, []);

  const handleExpand   = useCallback((camObj) => setFullscreenCam(camObj), []);
  const handleSnapshot = useCallback(({ cameraName }) => {
    setEvents(prev => [{
      id: Date.now(), time: new Date().toLocaleTimeString('it-IT'),
      type: `GRAB · ${cameraName}`, ok: true, score: 100,
    }, ...prev].slice(0, 50));
  }, []);

  const defectRate = useMemo(() =>
    prodStats.totalProduced > 0
      ? ((prodStats.defects / prodStats.totalProduced) * 100).toFixed(1) : '0.0',
  [prodStats]);
  const qualityPct = useMemo(() =>
    prodStats.totalProduced > 0
      ? ((prodStats.goodPieces / prodStats.totalProduced) * 100).toFixed(1) : '100.0',
  [prodStats]);

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      width: '100vw', height: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: FONT, color: C.text, overflow: 'hidden',
    }}>

      {/* ══ HEADER ═══════════════════════════════════════════════════════ */}
      <header style={{
        background: `linear-gradient(180deg, #0f1e30 0%, #0c1520 100%)`,
        borderBottom: `1px solid ${C.border}`,
        boxShadow: `0 1px 0 ${C.accent}18, 0 4px 24px rgba(0,0,0,0.5)`,
        height: 64,
        display: 'flex', alignItems: 'stretch',
        flexShrink: 0,
        position: 'relative',
      }}>
      {/* Accent line top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${C.accent} 0%, ${C.cyan} 50%, transparent 100%)`,
        opacity: 0.6,
      }} />

        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '0 24px', borderRight: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          {/* Icon box — Eagle Logo */}
          <div style={{
            width: 48, height: 48, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(150deg, #081c2e 0%, #040d17 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 0 1px #22e37a44, 0 0 20px #22e37a2a, 0 4px 14px rgba(0,0,0,0.7)`,
            overflow: 'hidden',
          }}>
            <img
              src={eagleLogo}
              alt="Aquira Eagle"
              style={{ width: 32, height: 32, objectFit: 'contain' }}
            />
          </div>

          {/* Testo AQUIRA + sottotitolo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{
              fontSize: 22, fontWeight: 800, color: '#ffffff',
              letterSpacing: 6, lineHeight: 1,
              fontFamily: "'Barlow Condensed','Rajdhani',sans-serif",
              textShadow: '0 0 24px rgba(34,227,122,0.22)',
            }}>AQUIRA</div>
            {/* Sottotitolo */}
            <div style={{
              fontSize: 9.5, fontWeight: 500,
              color: C.muted,
              letterSpacing: 1.5,
              fontFamily: "'Inter','Segoe UI',sans-serif",
              textTransform: 'uppercase',
              lineHeight: 1,
            }}>Eagle Eye of Quality Control</div>
          </div>
        </div>

        {/* Nessun indicatore bus visibile — stato monitorato in background */}

        {/* Tab navigation — centered */}
        <nav style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', flex: 1, gap: 0 }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  height: '100%', padding: '0 32px',
                  background: isActive ? `${C.accent}12` : 'transparent',
                  border: 'none',
                  borderBottom: `3px solid ${isActive ? C.accent : 'transparent'}`,
                  borderTop: '3px solid transparent',
                  color: isActive ? C.accent : C.muted,
                  fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  cursor: 'pointer', fontFamily: FONT,
                  display: 'flex', alignItems: 'center', gap: 9,
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = C.textDim;
                    e.currentTarget.style.background = `${C.accent}08`;
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = C.muted;
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {tab.dot && activeTab === 'live' && (
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: C.red, boxShadow: `0 0 7px ${C.red}`,
                    animation: 'aqPulse 1s ease-in-out infinite',
                    flexShrink: 0,
                  }} />
                )}
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* KPI strip */}
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center',
          gap: 0, padding: '0', borderLeft: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          {[
            { label: 'OUTPUT',  value: prodStats.totalProduced.toLocaleString('en-US'), color: C.text },
            { label: 'GOOD',    value: prodStats.goodPieces.toLocaleString('en-US'),    color: C.accent },
            { label: 'REJECTS', value: prodStats.defects,   color: prodStats.defects > 0 ? C.red : C.muted },
            { label: 'QUALITY', value: `${qualityPct}%`,    color: parseFloat(qualityPct) >= 95 ? C.accent : C.amber },
            { label: 'FPS',     value: liveMetrics.fps > 0 ? liveMetrics.fps : '—',
              color: liveMetrics.fps >= 25 ? C.accent : liveMetrics.fps >= 10 ? C.amber : C.muted,
              sub: liveMetrics.fps > 0 ? 'LIVE' : null },
          ].map(({ label, value, color, sub }, i, arr) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center',
              padding: '0 18px', height: '100%',
              borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <KpiChip label={label} value={value} color={color} sub={sub} />
            </div>
          ))}
        </div>

        {/* START / STOP ALL button */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px', borderLeft: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <button
            onClick={() => {
              if (isRunningAll) {
                setIsRunningAll(false);
                setStopSignal(s => s + 1);
              } else {
                setIsRunningAll(true);
                setStartSignal(s => s + 1);
                setAnalyticsTimeline([]);
                setAnalyticsStartedAt(new Date());
              }
            }}
            style={{
              background: isRunningAll
                ? `linear-gradient(145deg, ${C.red} 0%, #cc3040 100%)`
                : `linear-gradient(145deg, ${C.accent} 0%, ${C.accentDim} 100%)`,
              border: 'none',
              color: '#0a0e14',
              fontSize: 11, fontWeight: 800, letterSpacing: 1.6,
              padding: '9px 20px', borderRadius: 5,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: isRunningAll
                ? `0 0 18px ${C.red}55, inset 0 1px 0 rgba(255,255,255,0.2)`
                : `0 0 18px ${C.accent}55, inset 0 1px 0 rgba(255,255,255,0.2)`,
              fontFamily: FONT,
              transition: 'background 0.2s, box-shadow 0.2s',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{isRunningAll ? '■' : '▶'}</span>
            {isRunningAll ? 'STOP ALL' : 'START ALL'}
          </button>
        </div>

        {/* Clock */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 20px', borderLeft: `1px solid ${C.border}`,
          flexShrink: 0, textAlign: 'right',
        }}>
          <div>
            <div style={{
              fontSize: 22, color: C.text, letterSpacing: 2.5,
              fontFamily: FONT_MONO, fontWeight: 600, lineHeight: 1,
            }}>{clock.toLocaleTimeString('it-IT')}</div>
            <div style={{
              fontSize: 9, color: C.muted, letterSpacing: 1.2,
              marginTop: 3, fontWeight: 500,
            }}>
              {clock.toLocaleDateString('it-IT', {
                day: '2-digit', month: 'short', year: 'numeric',
              }).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* ══ BODY ══════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── LIVE TAB — sempre montato per mantenere il WebSocket attivo ─ */}
        <div style={{
          flex: activeTab === 'live' ? 1 : undefined,
          display: activeTab === 'live' ? 'grid' : 'none',
          gridTemplateColumns: '1fr 310px',
          overflow: 'hidden', minHeight: 0,
        }}>

            {/* Camera grid */}
            <main style={{ overflow: 'auto', padding: '16px 20px', background: C.bg }}>
              {/* Page header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 16, paddingBottom: 14,
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 7,
                    background: `linear-gradient(135deg, ${C.accent}22, ${C.cyan}11)`,
                    border: `1px solid ${C.accent}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M16.95 7.05l2.83-2.83M4.22 19.78l2.83-2.83"/>
                    </svg>
                  </div>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: 0.5 }}>
                      Live Acquisition
                    </h1>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: C.muted, fontWeight: 500 }}>
                      {stations.length} station{stations.length !== 1 ? 's' : ''}&nbsp;·&nbsp;{totalCameras} camera{totalCameras !== 1 ? 's' : ''}
                      {liveMetrics.fps > 0 && <span style={{ color: C.accent, marginLeft: 8, fontWeight: 700 }}>● {liveMetrics.fps} fps</span>}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* View toggle: Grid / Orizzontale / Verticale */}
                  {[
                    { v: 'grid', label: 'Grid', icon: (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                        <rect x="0" y="0" width="5.5" height="5.5" rx="1"/>
                        <rect x="7.5" y="0" width="5.5" height="5.5" rx="1"/>
                        <rect x="0" y="7.5" width="5.5" height="5.5" rx="1"/>
                        <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1"/>
                      </svg>
                    )},
                    { v: 'row', label: 'Orizzontale', icon: (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                        <rect x="0" y="0" width="5.5" height="13" rx="1"/>
                        <rect x="7.5" y="0" width="5.5" height="13" rx="1"/>
                      </svg>
                    )},
                    { v: 'vertical', label: 'Verticale', icon: (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                        <rect x="0" y="0" width="13" height="5.5" rx="1"/>
                        <rect x="0" y="7.5" width="13" height="5.5" rx="1"/>
                      </svg>
                    )},
                  ].map(({ v, label, icon }) => (
                    <button
                      key={v}
                      onClick={() => setStationView(v)}
                      title={label}
                      style={{
                        width: 30, height: 30, borderRadius: 5,
                        background: stationView === v ? `${C.cyan}18` : 'transparent',
                        border: `1px solid ${stationView === v ? C.cyan : C.border2}`,
                        color: stationView === v ? C.cyan : C.muted,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.12s',
                      }}
                    >{icon}</button>
                  ))}
                  <div style={{ width: 1, height: 20, background: C.border }} />
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 14px', background: C.panel,
                    border: `1px solid ${C.border}`, borderRadius: 6,
                  }}>
                    <Led on color={C.accent} size={7} pulse />
                    <span style={{ fontSize: 10, color: C.text, fontWeight: 700, letterSpacing: 1.2 }}>
                      SYSTEM ACTIVE
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Griglia telecamere flat ── */}
              {stations.every(s => s.cameras.length === 0) ? (
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  height: 260, gap: 12,
                  color: C.muted, fontSize: 11,
                  border: `1px dashed ${C.border2}`, borderRadius: 10,
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                       stroke={C.muted} strokeWidth="1.2" style={{ opacity: 0.4 }}>
                    <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                  </svg>
                  <span style={{ letterSpacing: 2, fontWeight: 600, opacity: 0.5 }}>
                    NESSUNA TELECAMERA — CONFIGURA NEL PANNELLO SETUP
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {stations.filter(s => s.cameras.length > 0).map(station => {
                    const n = station.cameras.length;

                    // Colonne per layout:
                    // grid:     auto-fit ottimale
                    // row:      tutte affiancate orizzontalmente (scroll)
                    // vertical: 1 colonna sola
                    const gridCols = stationView === 'row'
                      ? `repeat(${n}, minmax(260px, 1fr))`
                      : stationView === 'vertical'
                        ? '1fr'
                        : n === 1 ? '1fr'
                          : n <= 2 ? 'repeat(2, 1fr)'
                          : n <= 4 ? 'repeat(2, 1fr)'
                          : n <= 6 ? 'repeat(3, 1fr)'
                          : 'repeat(4, 1fr)';

                    // Altezza tile per layout orizzontale e verticale
                    const tileHeight = stationView === 'row'
                      ? 220
                      : stationView === 'vertical'
                        ? 320
                        : undefined; // grid usa paddingTop 56.25%

                    return (
                      <section key={station.id}>
                        {/* Station label */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          marginBottom: 10, padding: '8px 12px',
                          background: `linear-gradient(90deg, ${C.accent}0a 0%, transparent 100%)`,
                          border: `1px solid ${C.border}`,
                          borderLeft: `3px solid ${C.accent}`,
                          borderRadius: 6,
                        }}>
                          <div style={{
                            padding: '2px 8px',
                            background: `${C.accent}1a`,
                            border: `1px solid ${C.accent}44`,
                            borderRadius: 3, fontSize: 9, color: C.accent,
                            fontWeight: 800, letterSpacing: 2, fontFamily: FONT_MONO,
                          }}>{station.id}</div>
                          <span style={{ fontSize: 12, color: C.text, fontWeight: 700, letterSpacing: 0.3 }}>
                            {station.name}
                          </span>
                          <span style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>
                            {station.line}
                          </span>
                          <div style={{
                            marginLeft: 4, padding: '1px 7px',
                            background: C.panel, border: `1px solid ${C.border2}`,
                            borderRadius: 3, fontSize: 9, color: C.muted,
                            fontFamily: FONT_MONO, fontWeight: 600,
                          }}>{n} cam</div>
                          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border} 0%, transparent 100%)` }} />
                          <Led on color={C.accent} size={6} pulse />
                        </div>

                        {/* Griglia tile */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: gridCols,
                          gap: 10,
                          overflowX: stationView === 'row' ? 'auto' : 'visible',
                          paddingBottom: stationView === 'row' ? 4 : 0,
                        }}>
                          {station.cameras.map(cam => {
                            const [w, h] = (cam.resolution || '1280x720').split('x').map(Number);
                            const useAspect = stationView === 'grid';
                            return (
                              <div key={cam.id} style={{
                                position: 'relative',
                                paddingTop: useAspect ? '56.25%' : 0,
                                height: useAspect ? undefined : tileHeight,
                                minHeight: useAspect ? 180 : undefined,
                              }}>
                                <div style={{
                                  position: useAspect ? 'absolute' : 'relative',
                                  inset: useAspect ? 0 : undefined,
                                  height: useAspect ? '100%' : tileHeight,
                                }}>
                                  <CameraView
                                    cameraId={cam.id}
                                    cameraName={cam.name}
                                    cameraLabel={cam.label}
                                    compact
                                    startSignal={startSignal}
                                    stopSignal={stopSignal}
                                    onStats={handleCameraStats}
                                    onExpand={handleExpand}
                                    onSnapshot={handleSnapshot}
                                    onFrame={handleFrame}
                                    fps={cam.fps || 25}
                                    width={w || 1280}
                                    height={h || 720}
                                    quality={cam.quality || 'high'}
                                    source={cam.source || 'cpp'}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </main>

            {/* Right sidebar */}
            <aside style={{
              background: `linear-gradient(180deg, #0d1824 0%, ${C.panel2} 100%)`,
              borderLeft: `1px solid ${C.border}`,
              overflow: 'auto', padding: '16px 14px',
              display: 'flex', flexDirection: 'column', gap: 16,
              width: 310, flexShrink: 0,
            }}>

              {/* Production stats */}
              <div>
                <SectionHeader title="Production" right={
                  <span style={{ fontSize: 8, color: C.accent, fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: 1.2 }}>
                    LIVE
                  </span>
                } />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <StatCard label="Total Output" value={prodStats.totalProduced.toLocaleString('en-US')}
                    accent={C.cyan} icon="▣" />
                  <StatCard label="Good Parts"   value={prodStats.goodPieces.toLocaleString('en-US')}
                    color={C.accent} accent={C.accent} icon="◆" />
                  <StatCard label="Rejects"      value={prodStats.defects}
                    color={prodStats.defects > 0 ? C.red : C.muted}
                    accent={prodStats.defects > 0 ? C.red : C.border2} icon="△" />
                  <StatCard label="Defect Rate"  value={defectRate} unit="%"
                    color={parseFloat(defectRate) < 2 ? C.accent : parseFloat(defectRate) < 5 ? C.amber : C.red}
                    accent={parseFloat(defectRate) < 2 ? C.accent : C.amber} icon="%" />
                </div>
                <div style={{ marginTop: 7 }}>
                  <StatCard label="Global Quality" value={qualityPct} unit="%"
                    color={parseFloat(qualityPct) >= 95 ? C.accent : C.amber}
                    accent={C.accent} icon="◈" />
                </div>
              </div>

              {/* Stream / FPS */}
              <div>
                <SectionHeader title="Vision Stream" right={
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: liveMetrics.fps > 0 ? `${C.accent}14` : `${C.muted}14`,
                    border: `1px solid ${liveMetrics.fps > 0 ? C.accent : C.border2}44`,
                    borderRadius: 3, padding: '2px 7px',
                  }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: liveMetrics.fps > 0 ? C.accent : C.muted,
                      boxShadow: liveMetrics.fps > 0 ? `0 0 6px ${C.accent}` : 'none',
                      animation: liveMetrics.fps > 0 ? 'aqPulse 1.2s ease-in-out infinite' : 'none',
                    }} />
                    <span style={{ fontSize: 8, color: liveMetrics.fps > 0 ? C.accent : C.muted, fontWeight: 700, letterSpacing: 1, fontFamily: FONT_MONO }}>
                      {liveMetrics.fps > 0 ? `${liveMetrics.fps} FPS` : 'IDLE'}
                    </span>
                  </div>
                } />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <StatCard label="Frame Rate" value={liveMetrics.fps || '—'} unit={liveMetrics.fps > 0 ? 'fps' : ''}
                    color={liveMetrics.fps >= 25 ? C.accent : liveMetrics.fps >= 10 ? C.amber : C.muted}
                    accent={C.cyan} icon="◎" />
                  <StatCard label="Frames Tot." value={liveMetrics.frameCount?.toLocaleString?.('en-US') ?? '0'}
                    accent={C.cyan} icon="▦" />
                </div>
              </div>

              {/* Event log */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 200 }}>
                <SectionHeader
                  title="Event Log"
                  right={
                    <span style={{
                      fontSize: 10, color: C.muted, letterSpacing: 1,
                      fontWeight: 600, fontFamily: FONT_MONO,
                    }}>{events.length}</span>
                  }
                />
                <div style={{
                  flex: 1, maxHeight: 360, overflow: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  {events.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: '24px 0',
                      color: C.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: 500,
                    }}>WAITING FOR EVENTS...</div>
                  ) : events.map(ev => (
                    <div key={ev.id} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '6px 9px',
                      background: ev.ok ? C.card : 'rgba(255,77,94,0.07)',
                      border: `1px solid ${ev.ok ? C.border : 'rgba(255,77,94,0.28)'}`,
                      borderLeft: `3px solid ${ev.ok ? C.accent : C.red}`,
                      borderRadius: 4,
                    }}>
                      <Led on size={5} color={ev.ok ? C.accent : C.red} />
                      <span style={{
                        fontSize: 9, color: C.muted, fontFamily: FONT_MONO,
                        flexShrink: 0, fontWeight: 500, letterSpacing: 0.5,
                      }}>{ev.time}</span>
                      <span style={{
                        fontSize: 10, color: C.text, flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: 600, letterSpacing: 0.3,
                      }}>{ev.type}</span>
                      <span style={{
                        fontSize: 9, color: ev.ok ? C.accent : C.amber,
                        flexShrink: 0, fontWeight: 700, fontFamily: FONT_MONO,
                      }}>{ev.score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

        {/* ── ANALYTICS TAB ────────────────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8aa0b4', fontSize: 13, letterSpacing: 2 }}>
                CARICAMENTO ANALYTICS...
              </div>
            }>
              <AnalyticsPanel
                stations={stations}
                liveStats={prodStats}
                liveMetrics={liveMetrics}
                events={events}
                timeline={analyticsTimeline}
                startedAt={analyticsStartedAt}
              />
            </Suspense>
          </div>
        )}

        {/* ── SETTINGS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8aa0b4', fontSize: 13, letterSpacing: 2 }}>
                CARICAMENTO SETUP...
              </div>
            }>
              <SetupPanel stations={stations} onStationsChange={setStations} />
            </Suspense>
          </div>
        )}
      </div>

      {/* ══ LOGIN FORM (espandibile) ══════════════════════════════════════ */}
      {loginOpen && !currentUser && (
        <div style={{
          background: C.panel, borderTop: `1px solid ${C.border2}`,
          padding: '14px 24px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 18,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.35)',
        }}>
          {/* Icona lucchetto */}
          <svg width="18" height="20" viewBox="0 0 18 20" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
            <rect x="1" y="8" width="16" height="11" rx="2" stroke={C.muted} strokeWidth="1.5"/>
            <path d="M5 8V6a4 4 0 018 0v2" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="9" cy="14" r="1.5" fill={C.muted}/>
          </svg>

          <form onSubmit={handleLogin} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              placeholder="Utente"
              value={loginCreds.user}
              onChange={e => setLoginCreds(p => ({ ...p, user: e.target.value, err: '' }))}
              autoFocus
              style={{
                background: C.card, border: `1px solid ${C.border2}`,
                borderRadius: 4, color: C.text, fontSize: 11,
                padding: '6px 12px', width: 130, outline: 'none',
                fontFamily: FONT, letterSpacing: 0.5,
              }}
              onFocus={e => { e.target.style.borderColor = C.cyan; }}
              onBlur={e  => { e.target.style.borderColor = C.border2; }}
            />
            <input
              type="password"
              placeholder="Password (1234)"
              value={loginCreds.pass}
              onChange={e => setLoginCreds(p => ({ ...p, pass: e.target.value, err: '' }))}
              style={{
                background: C.card, border: `1px solid ${C.border2}`,
                borderRadius: 4, color: C.text, fontSize: 11,
                padding: '6px 12px', width: 120, outline: 'none',
                fontFamily: FONT, letterSpacing: 1,
              }}
              onFocus={e => { e.target.style.borderColor = C.cyan; }}
              onBlur={e  => { e.target.style.borderColor = C.border2; }}
            />
            <button
              type="submit"
              style={{
                background: `linear-gradient(145deg, ${C.accent}, ${C.accentDim})`,
                border: 'none', color: '#0a0e14', fontSize: 10,
                fontWeight: 800, letterSpacing: 1.4, padding: '7px 16px',
                borderRadius: 4, cursor: 'pointer', fontFamily: FONT,
              }}
            >LOGIN</button>
          </form>

          {loginCreds.err && (
            <span style={{
              fontSize: 10, color: C.red, fontWeight: 600, letterSpacing: 0.5,
              background: `${C.red}15`, border: `1px solid ${C.red}44`,
              padding: '4px 10px', borderRadius: 3,
            }}>! {loginCreds.err}</span>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 9, color: C.muted, letterSpacing: 0.8, lineHeight: 1.6 }}>
            <div>operator / 1234</div>
            <div>supervisor / 1234</div>
            <div>admin / 1234</div>
          </div>
        </div>
      )}

      {/* ══ USER BAR ═════════════════════════════════════════════════════ */}
      <div style={{
        background: C.panel2, borderTop: `1px solid ${C.border}`,
        height: 34, display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 14, flexShrink: 0,
      }}>
        {currentUser ? (
          <>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: currentUser.color,
              boxShadow: `0 0 8px ${currentUser.color}`,
              animation: 'aqPulse 1.4s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 1.8,
              color: currentUser.color,
            }}>{currentUser.role}</span>
            <div style={{ width: 1, height: 14, background: C.border }} />
            <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>{currentUser.name}</span>
            <div style={{ width: 1, height: 14, background: C.border }} />
            <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT_MONO }}>
              {clock.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={handleLogout}
              style={{
                marginLeft: 'auto', background: 'transparent',
                border: `1px solid ${C.border2}`, color: C.muted,
                fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                padding: '3px 12px', borderRadius: 3, cursor: 'pointer',
                fontFamily: FONT, transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.red; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border2; }}
            >LOGOUT</button>
          </>
        ) : (
          <>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.muted, opacity: 0.5 }} />
            <span style={{ fontSize: 9, color: C.muted, letterSpacing: 1.4, fontWeight: 600 }}>
              NOT AUTHENTICATED
            </span>
            <button
              onClick={() => setLoginOpen(p => !p)}
              style={{
                marginLeft: 'auto',
                background: loginOpen ? `${C.cyan}14` : 'transparent',
                border: `1px solid ${loginOpen ? C.cyan : C.border2}`,
                color: loginOpen ? C.cyan : C.muted,
                fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                padding: '3px 14px', borderRadius: 3, cursor: 'pointer',
                fontFamily: FONT, transition: 'all 0.12s',
              }}
            >{loginOpen ? '▼ CLOSE' : '▶ LOGIN'}</button>
          </>
        )}
      </div>

      {/* ══ STATUS BAR ═══════════════════════════════════════════════════ */}
      <footer style={{
        background: `linear-gradient(90deg, #090d14 0%, #0b1119 100%)`,
        borderTop: `1px solid ${C.border}`,
        height: 28, display: 'flex', alignItems: 'center',
        padding: '0 18px', gap: 0, flexShrink: 0,
      }}>
        {[
          { l: 'C++',       v: busStatus.cppOnline  ? 'ONLINE'  : 'OFFLINE', c: busStatus.cppOnline  ? C.accent : C.muted, dot: true },
          { l: 'NODE',      v: busStatus.connected  ? 'ONLINE'  : 'OFFLINE', c: busStatus.connected  ? C.accent : C.red,   dot: true },
          { l: 'BUS',       v: bus.connected        ? 'ONLINE'  : bus.reconnecting ? 'RECONNECTING' : 'OFFLINE',
            c: bus.connected ? C.accent : bus.reconnecting ? C.amber : C.red, dot: true },
          { l: 'MPEG RELAY',v: 'ws:8082', c: C.muted, dot: false },
          { l: 'FRAMES',    v: liveMetrics.frameCount?.toLocaleString?.('en-US') ?? '0', c: C.text, dot: false },
          { l: 'STATIONS',  v: `${stations.length} / ${totalCameras} cam`, c: C.text, dot: false },
        ].map(({ l, v, c, dot }, i) => (
          <div key={l} style={{
            display: 'flex', gap: 5, alignItems: 'center',
            padding: '0 14px',
            borderRight: `1px solid ${C.border}`,
          }}>
            {dot && <div style={{ width: 5, height: 5, borderRadius: '50%', background: c, boxShadow: c !== C.muted ? `0 0 5px ${c}` : 'none', flexShrink: 0 }} />}
            <span style={{ fontSize: 8.5, color: C.muted, letterSpacing: 1, fontWeight: 600 }}>{l}</span>
            <span style={{ fontSize: 8.5, color: c, letterSpacing: 0.8, fontWeight: 700, fontFamily: FONT_MONO }}>{v}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 8.5, color: '#3a4f63', letterSpacing: 1, fontWeight: 600, fontFamily: FONT_MONO }}>
          AQUIRA v4.0 · SAPERA LT · &copy; {new Date().getFullYear()}
        </div>
      </footer>

      {/* ══ FULLSCREEN CAMERA MODAL ═══════════════════════════════════════ */}
      {fullscreenCam && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(4,8,14,0.97)',
            zIndex: 200,
            display: 'flex', flexDirection: 'column', padding: 16,
          }}
          onClick={() => setFullscreenCam(null)}
        >
          <div
            style={{
              background: C.panel, border: `1px solid ${C.border2}`,
              borderRadius: 12, flex: 1,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px ${C.accent}11`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderBottom: `1px solid ${C.border}`,
              background: C.panel2,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Led on color={C.accent} size={9} pulse />
                <div>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: 700 }}>
                    {fullscreenCam.cameraName}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                    {fullscreenCam.cameraLabel}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setFullscreenCam(null)}
                style={{
                  background: 'transparent', border: `1px solid ${C.border2}`,
                  color: C.text, padding: '7px 16px', borderRadius: 4,
                  fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  letterSpacing: 1, fontFamily: FONT,
                }}
              >✕ CHIUDI</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <CameraView
                cameraId={fullscreenCam.cameraId}
                cameraName={fullscreenCam.cameraName}
                cameraLabel={fullscreenCam.cameraLabel}
                compact={false}
                startSignal={1}
                stopSignal={0}
                onStats={handleCameraStats}
                onSnapshot={handleSnapshot}
              />
            </div>
          </div>
        </div>
      )}

      {/* Global styles */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root {
          width: 100%; height: 100%; overflow: hidden;
          background: ${C.bg}; color: ${C.text};
        }
        body {
          font-family: ${FONT};
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.muted}; }
        @keyframes aqPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes aqBlink { 0%,100%{opacity:1} 50%{opacity:0.15} }
        button, input, select, textarea { font-family: ${FONT}; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { opacity: 0.4; }
      `}</style>
    </div>
  );
}