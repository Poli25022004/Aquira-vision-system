import React, { useState, useEffect, useRef, useCallback } from 'react';

const C = {
  panel:  '#111a25', border:  '#1d2b3c', border2: '#27384d',
  accent: '#22e37a', cyan:    '#3dd6f5', amber:   '#ffb020',
  red:    '#ff4d5e', text:    '#ffffff', muted:   '#8aa0b4',
};
const FONT_MONO = "'JetBrains Mono','Courier New',monospace";
const CPP_BASE  = 'http://localhost:8080';

export const CameraView = React.memo(function CameraView({
  cameraId,
  cameraName,
  cameraLabel,
  compact,
  onStats,
  onExpand,
  onSnapshot,
  quality = 'high',
  width   = 1280,
  height  = 720,
}) {
  const [imgKey, setImgKey] = useState(() => Date.now());
  const [fps, setFps]       = useState(0);
  const [grabStatus, setGrabStatus] = useState(null);
  const fpsTimerRef = useRef(null);

  // Avvia C++ broadcaster + polling FPS
  useEffect(() => {
    // Fire-and-forget start
    fetch(`${CPP_BASE}/api/camera/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId }),
    }).catch(() => {});

    // Poll FPS from backend
    fpsTimerRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${CPP_BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
        const h = await r.json();
        const cam = h.cameras?.find(c => c.id === cameraId || c.cameraId === cameraId);
        if (cam) {
          const f = cam.fps || 0;
          setFps(f);
          if (onStats) onStats({ camId: cameraId, fps: f, frameCount: cam.frameCount });
        }
      } catch {}
    }, 1000);

    return () => clearInterval(fpsTimerRef.current);
  }, [cameraId, onStats]);

  // Reload img se la connessione MJPEG si rompe
  const handleError = useCallback(() => {
    setTimeout(() => setImgKey(Date.now()), 2000);
  }, []);

  const handleGrab = useCallback(async () => {
    setGrabStatus('saving');
    try {
      const r = await fetch(`${CPP_BASE}/api/frame?cameraId=${cameraId}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await r.json();
      if (data.imageData) {
        setGrabStatus('ok');
        if (onSnapshot) onSnapshot({ cameraName, filename: `${cameraId}_grab.jpg` });
      } else {
        setGrabStatus('error');
      }
    } catch {
      setGrabStatus('error');
    } finally {
      setTimeout(() => setGrabStatus(null), 2500);
    }
  }, [cameraId, cameraName, onSnapshot]);

  const qualityColor = quality === 'ultra' ? C.amber : quality === 'high' ? C.cyan : quality === 'low' ? C.muted : C.accent;
  const grabLabel = grabStatus === 'saving' ? '⏳ SAVING…' : grabStatus === 'ok' ? '✓ SAVED' : grabStatus === 'error' ? '✗ ERROR' : '◉ GRAB';
  const grabColor = grabStatus === 'ok' ? C.accent : grabStatus === 'error' ? C.red : C.cyan;
  const fpsColor  = fps >= 25 ? C.accent : fps >= 15 ? C.amber : C.red;
  const isLive    = fps > 0;

  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: compact ? 240 : 280,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: isLive ? C.accent : '#253040',
            boxShadow: isLive ? `0 0 8px ${C.accent}` : 'none',
          }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{cameraName}</div>
            <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.2 }}>{cameraLabel}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 8, fontWeight: 700, color: qualityColor, letterSpacing: 1,
            fontFamily: FONT_MONO, border: `1px solid ${qualityColor}55`, padding: '1px 5px', borderRadius: 3,
          }}>{quality.toUpperCase()}</span>

          {isLive && (
            <span style={{
              fontSize: 10, fontFamily: FONT_MONO, fontWeight: 800,
              color: fpsColor, background: `${fpsColor}18`,
              border: `1px solid ${fpsColor}44`,
              padding: '2px 6px', borderRadius: 3, minWidth: 48, textAlign: 'center',
            }}>{fps} fps</span>
          )}

          <button
            onClick={() => onExpand?.({ cameraId, cameraName, cameraLabel })}
            title="Fullscreen"
            style={{ background: 'transparent', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 15, padding: 2 }}
          >⤢</button>
        </div>
      </div>

      {/* Video area — IMG MJPEG NATIVO */}
      <div style={{ flex: 1, background: '#000', position: 'relative', minHeight: 0, overflow: 'hidden' }}>
        <img
          key={imgKey}
          src={`${CPP_BASE}/api/stream/mjpeg?cameraId=${cameraId}&_t=${imgKey}`}
          alt={cameraName}
          onError={handleError}
          style={{
            width: '100%', height: '100%', objectFit: 'contain',
            display: 'block', background: '#000',
          }}
        />

        {/* FPS overlay */}
        {isLive && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(0,0,0,0.72)',
            border: `1px solid ${fpsColor}55`,
            borderRadius: 4, padding: '2px 7px',
            fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
            color: fpsColor, letterSpacing: 0.8, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: fpsColor, boxShadow: `0 0 6px ${fpsColor}`,
              animation: 'aqPulse 1.2s ease-in-out infinite',
            }} />
            {fps} fps
          </div>
        )}

        {/* Badge MJPEG */}
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(0,0,0,0.60)',
          border: `1px solid ${C.border2}`,
          borderRadius: 4, padding: '2px 6px',
          fontFamily: FONT_MONO, fontSize: 8, color: C.muted,
          pointerEvents: 'none', letterSpacing: 0.5,
        }}>MJPEG</div>
      </div>

      {/* Controls */}
      <div style={{
        padding: '8px 12px', borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0,
      }}>
        <button
          onClick={() => setImgKey(Date.now())}
          title="Ricarica stream"
          style={{
            padding: '5px 11px', borderRadius: 4, cursor: 'pointer',
            fontSize: 10, fontWeight: 700,
            background: 'rgba(34,227,122,0.15)',
            border: `1px solid ${C.accent}`,
            color: C.accent,
          }}
        >↻ RELOAD</button>

        <button
          onClick={handleGrab}
          disabled={grabStatus === 'saving'}
          style={{
            padding: '5px 11px', borderRadius: 4, cursor: 'pointer',
            fontSize: 10, fontWeight: 700,
            background: grabStatus === 'ok' ? 'rgba(34,227,122,0.15)' : grabStatus === 'error' ? 'rgba(255,77,94,0.15)' : 'transparent',
            border: `1px solid ${grabColor}`,
            color: grabColor,
          }}
        >{grabLabel}</button>

        <div style={{ marginLeft: 'auto', fontSize: 8, color: C.muted, fontFamily: FONT_MONO, letterSpacing: 0.5 }}>
          {width}×{height}
        </div>
      </div>
    </div>
  );
});

export default CameraView;
