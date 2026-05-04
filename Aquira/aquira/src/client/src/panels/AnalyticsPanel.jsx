import React, { useState, useMemo, useCallback, memo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  LineChart, Line,
  BarChart, Bar,
  ComposedChart,
  PieChart, Pie, Cell,
  AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

const C = {
  bg:      '#070d14',
  panel:   '#0e1922',
  panel2:  '#0b1420',
  card:    '#111e2d',
  card2:   '#0d1825',
  border:  '#1a2837',
  border2: '#243548',
  accent:  '#22e37a',
  cyan:    '#3dd6f5',
  amber:   '#ffb020',
  red:     '#ff4d5e',
  purple:  '#a78bfa',
  pink:    '#f472b6',
  text:    '#f0f6ff',
  muted:   '#7a97b0',
  muted2:  '#3d5468',
};
const FONT      = "'Inter','Segoe UI','Helvetica Neue',sans-serif";
const FONT_MONO = "'JetBrains Mono','Courier New',monospace";

const UCL_DEFECT         = 5.0;
const CL_DEFECT          = 2.5;
const MAX_VISIBLE_POINTS = 60;
const CHART_H            = 210;
const CHART_H_LG         = 250;

const AXIS_STYLE = {
  stroke: C.muted2,
  tick: { fill: C.muted, fontSize: 10, fontWeight: 600, fontFamily: FONT_MONO },
};
const MARGIN    = { top: 8, right: 16, left: -4, bottom: 2 };
const NO_DOT    = false;

const TOOLTIP_STYLE = {
  background: '#060d16',
  border: `1px solid ${C.border2}`,
  borderRadius: 8,
  color: C.text,
  fontSize: 12,
  fontFamily: FONT,
  padding: '10px 14px',
  boxShadow: '0 16px 48px rgba(0,0,0,0.9)',
};

/* ─── CSV export ─────────────────────────────────────────────────────────── */
function exportCSV(data, filename, extraMeta = {}) {
  if (!data?.length) return;
  const now     = new Date().toISOString();
  const headers = Object.keys(data[0]);
  const metaLines = [
    `# AQUIRA Industrial Vision System — ${filename}`,
    `# Exported: ${now}`,
    ...Object.entries(extraMeta).map(([k, v]) => `# ${k}: ${v}`),
    '',
  ];
  const escape = v => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [headers.join(','), ...data.map(r => headers.map(h => escape(r[h])).join(','))];
  const blob = new Blob([[...metaLines, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;﻿' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function useDebounced(value, ms = 300) {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return d;
}

/* ─── Smooth numeric display (avoids jarring jumps) ─────────────────────── */
function useSmoothValue(target, speed = 0.12) {
  const [val, setVal] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    ref.current = target;
    let raf;
    const step = () => {
      setVal(prev => {
        const diff = ref.current - prev;
        if (Math.abs(diff) < 0.01) return ref.current;
        raf = requestAnimationFrame(step);
        return prev + diff * speed;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, speed]);
  return val;
}

/* ─── Custom Tooltip ─────────────────────────────────────────────────────── */
const Tip = memo(function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      {label && <div style={{ marginBottom: 6, fontSize: 9, color: C.muted, letterSpacing: 1.2, fontFamily: FONT_MONO }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ color: C.muted, fontSize: 10 }}>{p.name}:</span>
          <span style={{ color: C.text, fontWeight: 800, fontFamily: FONT_MONO }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
});

/* ─── Gradient defs ──────────────────────────────────────────────────────── */
const GradDefs = memo(function GradDefs() {
  return (
    <defs>
      <linearGradient id="gA"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.accent} stopOpacity={0.45}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient>
      <linearGradient id="gR"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.red}    stopOpacity={0.4}/> <stop offset="95%" stopColor={C.red}    stopOpacity={0}/></linearGradient>
      <linearGradient id="gC"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.cyan}   stopOpacity={0.4}/> <stop offset="95%" stopColor={C.cyan}   stopOpacity={0}/></linearGradient>
      <linearGradient id="gP"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.purple} stopOpacity={0.4}/> <stop offset="95%" stopColor={C.purple} stopOpacity={0}/></linearGradient>
      <linearGradient id="gAm" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.amber}  stopOpacity={0.4}/> <stop offset="95%" stopColor={C.amber}  stopOpacity={0}/></linearGradient>
      <linearGradient id="gPk" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor={C.pink}   stopOpacity={0.4}/> <stop offset="95%" stopColor={C.pink}   stopOpacity={0}/></linearGradient>
    </defs>
  );
});

/* ─── OEE Arc Gauge ─────────────────────────────────────────────────────── */
const OEEGauge = memo(function OEEGauge({ value, availability, performance, quality }) {
  const smooth = useSmoothValue(value);
  const r     = 60;
  const circ  = Math.PI * r;
  const pct   = Math.min(Math.max(smooth, 0), 100) / 100;
  const color = value >= 85 ? C.accent : value >= 65 ? C.amber : C.red;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <svg width="160" height="90" viewBox="0 0 160 90">
          <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke={C.border2} strokeWidth={11} strokeLinecap="round"/>
          <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke={color} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={`${pct * circ * 2.18} ${circ * 2.18}`}
            style={{ filter: `drop-shadow(0 0 7px ${color}99)`, transition: 'stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)' }}/>
          <text x="80" y="68" textAnchor="middle" fill={C.text}  fontSize="22" fontWeight="800" fontFamily={FONT_MONO}>{smooth.toFixed(1)}%</text>
          <text x="80" y="82" textAnchor="middle" fill={C.muted} fontSize="8"  fontFamily={FONT} letterSpacing="2.2">OEE</text>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 0, width: '100%' }}>
        {[
          { l: 'AVAIL',   v: `${availability.toFixed(1)}%`, c: C.accent },
          { l: 'PERF',    v: `${performance.toFixed(1)}%`,  c: C.cyan   },
          { l: 'QUALITY', v: `${quality.toFixed(1)}%`,      c: color    },
        ].map(({ l, v, c }, i, arr) => (
          <div key={l} style={{
            flex: 1, textAlign: 'center', padding: '7px 4px',
            borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: FONT_MONO, lineHeight: 1, textShadow: `0 0 10px ${c}55` }}>{v}</div>
            <div style={{ fontSize: 7, color: C.muted, letterSpacing: 1.6, marginTop: 3, fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

/* ─── KPI Tile ───────────────────────────────────────────────────────────── */
const KpiTile = memo(function KpiTile({ label, value, unit, color, trend }) {
  const tc = trend == null ? null : trend >= 0 ? C.accent : C.red;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.card2} 0%, ${C.panel} 100%)`,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 7, padding: '10px 12px',
      display: 'flex', alignItems: 'center', gap: 9,
      boxShadow: `inset 0 0 20px ${color}06`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 8.5, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: FONT_MONO, lineHeight: 1, textShadow: `0 0 14px ${color}44` }}>{value}</span>
          {unit && <span style={{ fontSize: 11, color, fontWeight: 700 }}>{unit}</span>}
        </div>
      </div>
      {tc && trend != null && (
        <div style={{ fontSize: 9.5, color: tc, background: `${tc}15`, border: `1px solid ${tc}30`, padding: '2px 7px', borderRadius: 3, fontFamily: FONT_MONO, fontWeight: 800, flexShrink: 0 }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}
        </div>
      )}
    </div>
  );
});

/* ─── Health Dot ─────────────────────────────────────────────────────────── */

/* ─── Live FPS Badge — enlarged for readability ──────────────────────────── */
const LiveBadge = memo(function LiveBadge({ fps }) {
  const isLive = fps > 0;
  const color  = fps >= 25 ? C.accent : fps >= 15 ? C.amber : fps > 0 ? C.red : C.muted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: isLive ? `${color}18` : `${C.muted}10`, border: `1px solid ${isLive ? color + '55' : C.border2}`, borderRadius: 6, padding: '4px 10px' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: isLive ? `0 0 8px ${color}` : 'none', animation: isLive ? 'apPulse 1.2s ease-in-out infinite' : 'none' }} />
      <span style={{ fontSize: 10.5, fontFamily: FONT_MONO, fontWeight: 800, color, letterSpacing: 0.5 }}>
        {isLive ? `${fps} FPS` : 'OFFLINE'}
      </span>
    </div>
  );
});

/* ─── Chart Card ─────────────────────────────────────────────────────────── */
const ChartCard = memo(function ChartCard({ title, subtitle, color = C.cyan, children, onExport, badge, fullWidth = false }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      gridColumn: fullWidth ? '1 / -1' : undefined,
      boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px ${color}18`,
      transition: 'box-shadow 0.3s ease',
      minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
        background: `linear-gradient(90deg, ${C.panel2} 0%, ${C.panel} 100%)`,
        borderRadius: collapsed ? 12 : '12px 12px 0 0',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 3, height: 22, borderRadius: 2, background: `linear-gradient(180deg, ${color}, ${color}55)`, flexShrink: 0, boxShadow: `0 0 10px ${color}55` }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, letterSpacing: 1.4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {title}
              {badge}
            </div>
            {subtitle && <div style={{ fontSize: 9, color: C.muted, marginTop: 2, fontWeight: 500 }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {onExport && (
            <button onClick={onExport} style={{
              background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted,
              borderRadius: 4, padding: '3px 9px', cursor: 'pointer', fontSize: 9, fontWeight: 700,
              letterSpacing: 0.8, transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = C.cyan; e.currentTarget.style.borderColor = C.cyan; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border2; }}>
              ↓ CSV
            </button>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = color}
            onMouseLeave={e => e.currentTarget.style.color = C.muted}>
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
      </div>
      {!collapsed && <div style={{ padding: '16px 14px 14px', minWidth: 0 }}>{children}</div>}
    </div>
  );
});

/* ─── Empty Chart Placeholder ────────────────────────────────────────────── */
const EmptyChart = memo(function EmptyChart({ h = CHART_H, message = 'Waiting for data…' }) {
  return (
    <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.4 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, fontFamily: FONT_MONO, fontWeight: 700 }}>{message}</span>
    </div>
  );
});

/* ─── Live Terminal Log ──────────────────────────────────────────────────── */
const TerminalLog = memo(function TerminalLog({ events, onExport }) {
  const bodyRef   = useRef(null);
  const endRef    = useRef(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useLayoutEffect(() => {
    if (!pausedRef.current && bodyRef.current)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [events]);

  const toggle = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(p => !p);
  };

  const fmtLine = (ev, i) => {
    const isOk  = ev.ok;
    const isGrab = ev.type?.startsWith('GRAB');
    const c     = isGrab ? C.cyan : isOk ? C.accent : C.red;
    const prefix = isGrab ? 'SNAP' : isOk ? 'PASS' : 'FAIL';
    return (
      <div key={ev.id ?? i} style={{ display: 'flex', gap: 10, padding: '2px 0', fontFamily: FONT_MONO, fontSize: 11, lineHeight: 1.6 }}>
        <span style={{ color: C.muted2, flexShrink: 0, minWidth: 70 }}>{ev.time}</span>
        <span style={{ color: c, fontWeight: 800, flexShrink: 0, minWidth: 38 }}>{prefix}</span>
        <span style={{ color: isOk ? C.muted : C.amber, flexShrink: 0, minWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.type}</span>
        <span style={{ color: c, fontWeight: 700, flexShrink: 0, minWidth: 40, textAlign: 'right' }}>
          {ev.score != null ? `${typeof ev.score === 'number' ? ev.score.toFixed(0) : ev.score}%` : ''}
        </span>
        {ev.camId && <span style={{ color: C.muted2, fontSize: 9.5 }}>[{ev.camId}]</span>}
      </div>
    );
  };

  return (
    <div style={{ background: '#050d14', border: `1px solid ${C.border2}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: '#060e18' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 20, borderRadius: 2, background: `linear-gradient(180deg, ${C.accent}, ${C.cyan})`, boxShadow: `0 0 8px ${C.accent}55` }} />
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.text, letterSpacing: 1.4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
              Live Terminal
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, boxShadow: `0 0 6px ${C.accent}`, animation: 'apPulse 1.2s ease-in-out infinite' }} />
            </div>
            <div style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>Real-time event stream · {events.length} events</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={toggle} style={{
            background: paused ? `${C.amber}18` : `${C.accent}12`, border: `1px solid ${paused ? C.amber : C.border2}`,
            color: paused ? C.amber : C.muted, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          }}>{paused ? '▶ RESUME' : '⏸ PAUSE'}</button>
          {onExport && (
            <button onClick={onExport} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>↓ CSV</button>
          )}
        </div>
      </div>

      <div ref={bodyRef} style={{ height: 240, overflowY: 'auto', padding: '10px 16px', background: '#050d14', fontFamily: FONT_MONO }}>
        <div style={{ fontSize: 9.5, color: C.muted2, marginBottom: 8, letterSpacing: 1.2 }}>
          {'> AQUIRA VISION SYSTEM — EVENT STREAM ACTIVE'}
        </div>
        {events.length === 0
          ? <div style={{ color: C.muted2, fontSize: 10, letterSpacing: 1.5 }}>{'> Waiting for events…'}</div>
          : events.map(fmtLine)
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 16px', background: '#04090f', borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 9, color: C.muted2, fontFamily: FONT_MONO }}>LINES: {events.length}</span>
        <span style={{ fontSize: 9, color: C.muted2, fontFamily: FONT_MONO }}>PASS: {events.filter(e => e.ok && !e.type?.startsWith('GRAB')).length}</span>
        <span style={{ fontSize: 9, color: C.red + 'cc', fontFamily: FONT_MONO }}>FAIL: {events.filter(e => !e.ok).length}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: paused ? C.amber : C.accent, fontFamily: FONT_MONO, letterSpacing: 1.2 }}>
          {paused ? '⏸ PAUSED' : '● LIVE'}
        </span>
      </div>
    </div>
  );
});

/* ─── Defect Terminal — solo righe FAIL ──────────────────────────────────── */
const DefectTerminal = memo(function DefectTerminal({ events, onExport }) {
  const bodyRef   = useRef(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [filter, setFilter] = useState('all');

  const defectOnly = useMemo(() => events.filter(e => !e.ok), [events]);
  const typeSet    = useMemo(() => ['all', ...Array.from(new Set(defectOnly.map(e => e.type).filter(Boolean)))], [defectOnly]);
  const visible    = useMemo(() => filter === 'all' ? defectOnly : defectOnly.filter(e => e.type === filter), [defectOnly, filter]);

  useLayoutEffect(() => {
    if (!pausedRef.current && bodyRef.current)
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [visible]);

  const toggle = () => { pausedRef.current = !pausedRef.current; setPaused(p => !p); };

  const severityColor = score => score == null ? C.muted : score < 50 ? C.red : score < 75 ? C.amber : C.pink;

  return (
    <div style={{ background: '#06080e', border: `1px solid ${C.red}44`, borderRadius: 12, overflow: 'hidden', boxShadow: `0 0 0 1px ${C.red}18` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: `1px solid ${C.border}`, background: `linear-gradient(90deg, #0a0810 0%, #080610 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 22, borderRadius: 2, background: `linear-gradient(180deg, ${C.red}, ${C.amber})`, boxShadow: `0 0 10px ${C.red}66` }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, letterSpacing: 1.4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
              Defect Terminal
              {defectOnly.length > 0 && (
                <span style={{ fontSize: 8.5, fontFamily: FONT_MONO, fontWeight: 800, color: C.red, background: `${C.red}18`, border: `1px solid ${C.red}44`, padding: '2px 8px', borderRadius: 3, animation: 'apPulse 2s ease-in-out infinite' }}>
                  {defectOnly.length} REJECTS
                </span>
              )}
            </div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Stream difetti in tempo reale — solo anomalie rilevate</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Type filter */}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 4, padding: '3px 8px', fontSize: 9, cursor: 'pointer', outline: 'none', fontFamily: FONT }}>
            {typeSet.map(t => <option key={t} value={t}>{t === 'all' ? 'Tutti i tipi' : t}</option>)}
          </select>
          <button onClick={toggle} style={{
            background: paused ? `${C.amber}18` : `${C.red}10`, border: `1px solid ${paused ? C.amber : C.red + '44'}`,
            color: paused ? C.amber : C.red, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          }}>{paused ? '▶ RESUME' : '⏸ PAUSE'}</button>
          {onExport && (
            <button onClick={onExport} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>↓ CSV</button>
          )}
        </div>
      </div>

      {/* Column header */}
      <div style={{ display: 'flex', gap: 10, padding: '5px 16px', background: '#050810', borderBottom: `1px solid ${C.border}`, fontFamily: FONT_MONO }}>
        {[['TIMESTAMP', 70], ['TIPO DIFETTO', 130], ['SCORE', 55], ['GRAVITÀ', 70], ['CAMERA', 60]].map(([h, w]) => (
          <span key={h} style={{ fontSize: 8, color: C.muted2, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, minWidth: w }}>{h}</span>
        ))}
      </div>

      {/* Terminal body */}
      <div ref={bodyRef} style={{ height: 320, overflowY: 'auto', padding: '6px 16px', background: '#050810', fontFamily: FONT_MONO }}>
        {visible.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
            <span style={{ fontSize: 10, color: C.accent, letterSpacing: 2, fontFamily: FONT_MONO, fontWeight: 700 }}>NESSUN DIFETTO RILEVATO</span>
          </div>
        ) : visible.map((ev, i) => {
          const sc = ev.score;
          const sc2 = typeof sc === 'number' ? sc : null;
          const sevColor = severityColor(sc2);
          const sevLabel = sc2 == null ? '—' : sc2 < 50 ? 'CRITICO' : sc2 < 75 ? 'MEDIO' : 'BASSO';
          return (
            <div key={ev.id ?? i} style={{
              display: 'flex', gap: 10, padding: '3px 0',
              fontSize: 11, lineHeight: 1.65,
              borderBottom: i < visible.length - 1 ? `1px solid ${C.border}22` : 'none',
              transition: 'background 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = `${C.red}08`}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: C.muted2, flexShrink: 0, minWidth: 70 }}>{ev.time || '—'}</span>
              <span style={{ color: C.amber, fontWeight: 700, flexShrink: 0, minWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.type || 'UNKNOWN'}</span>
              <span style={{ color: sevColor, fontWeight: 800, flexShrink: 0, minWidth: 55, textAlign: 'right' }}>
                {sc2 != null ? `${sc2.toFixed(0)}%` : '—'}
              </span>
              <span style={{
                fontSize: 8.5, fontWeight: 800, flexShrink: 0, minWidth: 70,
                color: sevColor,
                background: `${sevColor}18`, border: `1px solid ${sevColor}33`,
                padding: '1px 7px', borderRadius: 3, letterSpacing: 0.8,
                alignSelf: 'center',
              }}>{sevLabel}</span>
              <span style={{ color: C.muted2, fontSize: 9.5 }}>{ev.camId ? `[${ev.camId}]` : '—'}</span>
            </div>
          );
        })}
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 16px', background: '#040710', borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 9, color: C.muted2, fontFamily: FONT_MONO }}>TOTALE: {defectOnly.length}</span>
        <span style={{ fontSize: 9, color: C.red + 'cc', fontFamily: FONT_MONO }}>CRITICI: {defectOnly.filter(e => typeof e.score === 'number' && e.score < 50).length}</span>
        <span style={{ fontSize: 9, color: C.amber, fontFamily: FONT_MONO }}>MEDI: {defectOnly.filter(e => typeof e.score === 'number' && e.score >= 50 && e.score < 75).length}</span>
        <span style={{ fontSize: 9, color: C.pink, fontFamily: FONT_MONO }}>BASSI: {defectOnly.filter(e => typeof e.score === 'number' && e.score >= 75).length}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: paused ? C.amber : C.red, fontFamily: FONT_MONO, letterSpacing: 1.2 }}>
          {paused ? '⏸ PAUSED' : '● LIVE'}
        </span>
      </div>
    </div>
  );
});

/* ─── Drill-Down Modal ───────────────────────────────────────────────────── */
const DefectModal = memo(function DefectModal({ defectType, events, onClose }) {
  const items = useMemo(() => events.filter(e => !e.ok && e.type === defectType).slice(0, 30), [events, defectType]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 14, padding: 24, width: 520, maxHeight: '78vh', overflow: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.9)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: 1.5, textTransform: 'uppercase' }}>Drill-Down · {defectType}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 3 }}>{items.length} occorrenze</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 5, padding: '4px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✕</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>{['Ora', 'Score', 'Stato'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 9, color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, background: C.card2 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {items.map((ev, i) => (
              <tr key={ev.id || i} style={{ background: i % 2 === 0 ? 'transparent' : `${C.card2}80` }}>
                <td style={{ padding: '6px 12px', fontFamily: FONT_MONO, color: C.muted, fontSize: 11 }}>{ev.time}</td>
                <td style={{ padding: '6px 12px', fontFamily: FONT_MONO, color: ev.score >= 80 ? C.amber : C.red, fontWeight: 700 }}>{ev.score}%</td>
                <td style={{ padding: '6px 12px' }}><span style={{ background: `${C.red}18`, border: `1px solid ${C.red}55`, color: C.red, fontSize: 9, padding: '2px 8px', borderRadius: 3, fontWeight: 700 }}>REJECT</span></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 11 }}>Nessun evento</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN PANEL
 * ═══════════════════════════════════════════════════════════════════════════ */
export const AnalyticsPanel = memo(function AnalyticsPanel({
  stations = [], liveStats, liveMetrics, events = [], timeline = [], startedAt,
}) {
  const prodStats = liveStats   || { totalProduced: 0, goodPieces: 0, defects: 0 };
  const metrics   = liveMetrics || { fps: 0, frameCount: 0 };

  const [timeRangeRaw,  setTimeRange]  = useState('all');
  const [typeFilterRaw, setTypeFilter] = useState('all');
  const [drillDefect,   setDrillDefect] = useState(null);

  const timeRange  = useDebounced(timeRangeRaw);
  const typeFilter = useDebounced(typeFilterRaw);
  const handleReset = useCallback(() => { setTimeRange('all'); setTypeFilter('all'); }, []);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const fmtElapsed = s => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  /* ── Filtraggio ─────────────────────────────────────────────────────── */
  const filteredEvents = useMemo(() => {
    let evs = events;
    if (timeRange !== 'all') {
      const mins   = timeRange === '5m' ? 5 : timeRange === '15m' ? 15 : 60;
      const cutoff = Date.now() - mins * 60_000;
      evs = evs.filter(e => { const ts = e._ts || e.timestamp; return ts ? ts >= cutoff : true; });
    }
    if (typeFilter !== 'all') evs = evs.filter(e => e.type === typeFilter);
    return evs;
  }, [events, timeRange, typeFilter]);

  const filteredTimeline = useMemo(() => {
    if (timeRange === 'all') return timeline;
    const count = timeRange === '5m' ? 15 : timeRange === '15m' ? 45 : 180;
    return timeline.slice(-count);
  }, [timeline, timeRange]);

  /* ── KPI derivati ────────────────────────────────────────────────────── */
  const { fGood, fDefects, fTotal } = useMemo(() => {
    const good    = filteredEvents.filter(e => e.ok).length;
    const defects = filteredEvents.filter(e => !e.ok).length;
    return { fGood: good, fDefects: defects, fTotal: good + defects };
  }, [filteredEvents]);

  const qualityPct = fTotal > 0 ? (fGood / fTotal) * 100 : 100;
  const defectRate = fTotal > 0 ? (fDefects / fTotal) * 100 : 0;
  const inControl  = defectRate <= UCL_DEFECT;

  const AVAILABILITY = useMemo(() => {
    const up = filteredTimeline.filter(t => t.fps > 0).length;
    return filteredTimeline.length > 0 ? (up / filteredTimeline.length) * 100 : 97.2;
  }, [filteredTimeline]);

  const PERFORMANCE = useMemo(() => {
    const fps = filteredTimeline.map(t => t.fps || 0).filter(f => f > 0);
    return fps.length ? Math.min(99, (fps.reduce((a, v) => a + v, 0) / fps.length / 30) * 100) : 91.5;
  }, [filteredTimeline]);

  const oee        = (AVAILABILITY / 100) * (PERFORMANCE / 100) * (qualityPct / 100) * 100;
  const cp         = Math.max(0.1, parseFloat((2.0 - defectRate / 8).toFixed(2)));
  const cpk        = parseFloat((cp * (inControl ? 0.91 : 0.62)).toFixed(2));
  const sigmaLevel = parseFloat(Math.max(1, Math.min(6, 3 * cp)).toFixed(1));
  const currentFps = typeof metrics.fps === 'number' ? metrics.fps : 0;
  const cycleTime      = currentFps > 0 ? (1 / currentFps).toFixed(3) : '—';
  const throughputRate = elapsed > 0 ? parseFloat((prodStats.totalProduced / (elapsed / 60)).toFixed(1)) : null;
  const yieldFPY       = qualityPct.toFixed(1);
  const taktTime   = (3600 / 450).toFixed(1);

  const mtbfMttr = useMemo(() => {
    const fails = Math.max(1, filteredEvents.filter(e => !e.ok && e.score < 50).length);
    const hrs   = filteredTimeline.length * 2 / 60;
    return { mtbf: hrs > 0 ? (hrs / fails).toFixed(1) : '—', mttr: Math.round(2 + fails * 0.5) };
  }, [filteredEvents, filteredTimeline]);

  /* ── Dati grafici ────────────────────────────────────────────────────── */
  const visibleTimeline = useMemo(() =>
    filteredTimeline.length > MAX_VISIBLE_POINTS ? filteredTimeline.slice(-MAX_VISIBLE_POINTS) : filteredTimeline,
  [filteredTimeline]);

  const hasData = visibleTimeline.length > 2;

  const spcTimeline = useMemo(() =>
    visibleTimeline.map(t => ({ time: t.time, rate: t.produced > 0 ? parseFloat(((t.defects / t.produced) * 100).toFixed(2)) : 0 })),
  [visibleTimeline]);

  const cpkTimeline = useMemo(() =>
    visibleTimeline.map(t => {
      const dr  = t.produced > 0 ? (t.defects / t.produced) * 100 : 0;
      const cpT = Math.max(0.1, 2.0 - dr / 8);
      return { time: t.time, cpk: parseFloat((cpT * (dr <= UCL_DEFECT ? 0.91 : 0.62)).toFixed(2)), target: 1.33 };
    }), [visibleTimeline]);

  const fpsTimeline = useMemo(() =>
    visibleTimeline.map(t => ({ time: t.time, fps: parseFloat((t.fps || 0).toFixed(1)), target: 25 })),
  [visibleTimeline]);

  const defectTypes = useMemo(() => {
    const map     = new Map();
    const palette = [C.red, C.amber, C.purple, C.cyan, C.pink];
    for (const e of filteredEvents) if (!e.ok) map.set(e.type, (map.get(e.type) || 0) + 1);
    const arr = Array.from(map.entries())
      .map(([name, count], i) => ({ name, count, fill: palette[i % palette.length] }))
      .sort((a, b) => b.count - a.count);
    return arr.length ? arr : [
      { name: 'GRAFFI_SUP', count: 0, fill: C.red },
      { name: 'MISALIGN',   count: 0, fill: C.amber },
      { name: 'COLORE_KO',  count: 0, fill: C.purple },
      { name: 'BORDO_KO',   count: 0, fill: C.cyan },
    ];
  }, [filteredEvents]);

  const allDefectTypeNames = useMemo(() => {
    const s = new Set();
    for (const e of events) if (!e.ok) s.add(e.type);
    return Array.from(s);
  }, [events]);

  const paretoData = useMemo(() => {
    const sorted = [...defectTypes].sort((a, b) => b.count - a.count);
    const total  = sorted.reduce((s, d) => s + d.count, 0);
    let cum = 0;
    return sorted.map(d => { cum += d.count; return { ...d, cumPct: total > 0 ? Math.round((cum / total) * 100) : 0 }; });
  }, [defectTypes]);

  const pieData = useMemo(() => [
    { name: 'Good',    value: Math.max(fGood,    1), color: C.accent },
    { name: 'Rejects', value: Math.max(fDefects, 0), color: C.red    },
  ], [fGood, fDefects]);

  const stationScores = useMemo(() =>
    stations.map(s => {
      const ids   = s.cameras.map(c => c.id);
      const evs   = filteredEvents.filter(e => ids.includes(e.camId) || !e.camId);
      const good  = evs.filter(e => e.ok).length;
      const total = evs.length || 1;
      return { station: s.id, quality: Math.round((good / total) * 100), target: 95 };
    }), [stations, filteredEvents]);

  const scoreTimeline = useMemo(() => {
    if (!visibleTimeline.length) return [];
    const epp = Math.max(1, Math.ceil(filteredEvents.length / visibleTimeline.length));
    return visibleTimeline.map((t, i) => {
      const slice  = filteredEvents.slice(i * epp, (i + 1) * epp);
      if (!slice.length) {
        const goodRate = t.produced > 0 ? 1 - t.defects / t.produced : 1;
        const avg = Math.round(60 + goodRate * 38);
        return { time: t.time, avgScore: avg, minScore: Math.max(avg - 18, 40) };
      }
      const scores = slice.map(e => e.score ?? (e.ok ? 98 : 72));
      return { time: t.time, avgScore: Math.round(scores.reduce((a, v) => a + v, 0) / scores.length), minScore: Math.min(...scores) };
    });
  }, [visibleTimeline, filteredEvents]);

  const hourlyData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const h     = new Date(now); h.setHours(now.getHours() - (7 - i));
      const label = h.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const slot  = timeline.filter(t => t.time?.startsWith(label.slice(0, 2)));
      if (slot.length) {
        const last = slot[slot.length - 1];
        return { ora: label, prodotti: last.produced || 0, buoni: last.good || 0, scarti: last.defects || 0 };
      }
      const seed = (now.getHours() - (7 - i) + 24) % 24 * 100 + now.getDate();
      const p    = n => ((seed * 9301 + n * 49297 + 233280) % 233280) / 233280;
      const tot  = 120 + Math.round(p(i) * 60);
      const def  = Math.round(tot * (0.04 + p(i + 8) * 0.06));
      return { ora: label, prodotti: tot, buoni: tot - def, scarti: def };
    });
  }, [timeline]);

  /* ── Radar chart: qualità per categoria difetto ──────────────────────── */
  const radarData = useMemo(() => {
    const cats = ['GRAFFI', 'BORDO', 'COLORE', 'MISALIGN', 'FORMA', 'CONTAM'];
    return cats.map(cat => {
      const evsCat = filteredEvents.filter(e => !e.ok && e.type?.includes(cat.split('_')[0]));
      const total  = Math.max(filteredEvents.filter(e => !e.ok).length, 1);
      const share  = Math.round((evsCat.length / total) * 100);
      return { subject: cat, value: share, fullMark: 100 };
    });
  }, [filteredEvents]);

  /* ── Efficiency timeline (throughput normalizzato) ───────────────────── */
  const efficiencyTimeline = useMemo(() =>
    visibleTimeline.map(t => ({
      time: t.time,
      efficiency: t.produced > 0 ? Math.min(100, Math.round(((t.good || t.produced - (t.defects || 0)) / t.produced) * 100)) : 0,
      throughput: t.produced || 0,
    })), [visibleTimeline]);

  const recentDefects = useMemo(() => filteredEvents.filter(e => !e.ok).slice(0, 20), [filteredEvents]);
  const recentLow     = useMemo(() => filteredEvents.filter(e => !e.ok && e.score < 50).slice(0, 3), [filteredEvents]);

  const alarms = useMemo(() => {
    const list = [];
    const fmt  = d => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const now  = new Date();
    if (defectRate > UCL_DEFECT)  list.push({ id: 'ucl', ts: fmt(now), type: 'UCL EXCEEDED',  message: `Defect rate ${defectRate.toFixed(2)}% > UCL ${UCL_DEFECT}%`,  severity: 'CRITICAL' });
    if (currentFps === 0)         list.push({ id: 'fps', ts: fmt(now), type: 'CAMERA OFFLINE', message: 'No frames received from C++ encoder',                          severity: 'CRITICAL' });
    if (cpk < 1.0)                list.push({ id: 'cpk', ts: fmt(now), type: 'PROCESS CAP.',   message: `Cpk ${cpk.toFixed(2)} below minimum 1.00`,                     severity: 'WARNING'  });
    if (oee < 65)                 list.push({ id: 'oee', ts: fmt(now), type: 'OEE CRITICAL',   message: `OEE ${oee.toFixed(1)}% below threshold 65%`,                   severity: 'CRITICAL' });
    recentLow.forEach((e, i) => list.push({ id: `ev${i}`, ts: e.time || fmt(now), type: e.type || 'DEFECT', message: `Score ${e.score}% — inspect required`, severity: 'WARNING' }));
    return list.slice(0, 6);
  }, [defectRate, currentFps, cpk, oee, recentLow]);

/* ── Export helpers ─────────────────────────────────────────────────── */
  const sessionMeta = useMemo(() => ({
    'Session Start': startedAt ? startedAt.toISOString() : 'N/A',
    'Total Produced': prodStats.totalProduced,
    'Good Parts': prodStats.goodPieces,
    'Defects': prodStats.defects,
    'Quality': `${qualityPct.toFixed(1)}%`,
    'OEE': `${oee.toFixed(1)}%`,
    'Cpk': cpk.toFixed(2),
  }), [startedAt, prodStats, qualityPct, oee, cpk]);

  const expTimeline = useCallback(() => exportCSV(visibleTimeline,  'aquira_timeline.csv', sessionMeta),         [visibleTimeline, sessionMeta]);
  const expSPC      = useCallback(() => exportCSV(spcTimeline,      'aquira_spc.csv',      { ...sessionMeta, UCL: `${UCL_DEFECT}%`, CL: `${CL_DEFECT}%` }), [spcTimeline, sessionMeta]);
  const expPareto   = useCallback(() => exportCSV(paretoData.map(d => ({ defect_type: d.name, count: d.count, cumulative_pct: d.cumPct })), 'aquira_pareto.csv', sessionMeta), [paretoData, sessionMeta]);
  const expCpk      = useCallback(() => exportCSV(cpkTimeline,      'aquira_cpk.csv',      { ...sessionMeta, 'Target Cpk': 1.33 }), [cpkTimeline, sessionMeta]);
  const expFps      = useCallback(() => exportCSV(fpsTimeline,      'aquira_fps.csv',      { ...sessionMeta, 'Target FPS': 25 }), [fpsTimeline, sessionMeta]);
  const expDefects  = useCallback(() => exportCSV(recentDefects.map(e => ({ timestamp: e.time, defect_type: e.type, ai_score_pct: e.score, camera_id: e.camId ?? '' })), 'aquira_defects.csv', sessionMeta), [recentDefects, sessionMeta]);

  /* ════════════════════════════════════════════════════════════════════
   * RENDER
   * ════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, color: C.text, fontFamily: FONT, overflow: 'hidden' }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: C.panel2, borderBottom: `1px solid ${C.border}` }}>

        {/* Filtri + session */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: startedAt ? C.accent : C.muted2, boxShadow: startedAt ? `0 0 6px ${C.accent}` : 'none', animation: startedAt ? 'apPulse 1.6s ease-in-out infinite' : 'none' }} />
            <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase' }}>
              {startedAt ? `Session active · ${fmtElapsed(elapsed)}` : 'Session idle'}
            </span>
          </div>

          <div style={{ width: 1, height: 14, background: C.border, margin: '0 4px' }} />

          <span style={{ fontSize: 9, color: C.muted2, letterSpacing: 1.2, fontWeight: 600 }}>RANGE</span>
          {[{ v: 'all', l: 'All' }, { v: '5m', l: '5m' }, { v: '15m', l: '15m' }, { v: '1h', l: '1h' }].map(r => (
            <button key={r.v} onClick={() => setTimeRange(r.v)} style={{
              padding: '3px 9px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontWeight: 700,
              border: `1px solid ${timeRangeRaw === r.v ? C.cyan : C.border2}`,
              background: timeRangeRaw === r.v ? `${C.cyan}18` : 'transparent',
              color: timeRangeRaw === r.v ? C.cyan : C.muted,
              transition: 'all 0.15s',
            }}>{r.l}</button>
          ))}

          <div style={{ width: 1, height: 14, background: C.border }} />

          <select value={typeFilterRaw} onChange={e => setTypeFilter(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 3, padding: '3px 9px', fontSize: 9, cursor: 'pointer', outline: 'none' }}>
            <option value="all">All Types</option>
            {allDefectTypeNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button onClick={handleReset} style={{ padding: '3px 9px', borderRadius: 3, border: `1px solid ${C.border2}`, background: 'transparent', color: C.muted, fontSize: 9, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.amber; e.currentTarget.style.borderColor = C.amber; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border2; }}>
            ↺ Reset
          </button>

          <span style={{ fontSize: 9, color: C.muted2, fontFamily: FONT_MONO, marginLeft: 'auto' }}>
            {filteredEvents.length} events · {visibleTimeline.length} samples
          </span>
        </div>

        {/* Alert strip — shown only when there are active alarms */}
        {alarms.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 18px', background: `${C.red}08`, borderBottom: `1px solid ${C.red}22`, overflowX: 'auto', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 8, color: C.red, fontWeight: 800, letterSpacing: 1.6, flexShrink: 0, fontFamily: FONT_MONO }}>⚠ ACTIVE</span>
            <div style={{ width: 1, height: 12, background: C.border2, flexShrink: 0 }} />
            {alarms.map(a => {
              const ac = a.severity === 'CRITICAL' ? C.red : C.amber;
              return (
                <span key={a.id} style={{ fontSize: 8.5, fontWeight: 800, fontFamily: FONT_MONO, background: `${ac}15`, border: `1px solid ${ac}44`, color: ac, padding: '2px 9px', borderRadius: 3, letterSpacing: 0.5, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {a.type}
                </span>
              );
            })}
          </div>
        )}

        {/* KPI strip — font aumentato per leggibilità */}
        <div style={{ display: 'flex', overflow: 'hidden' }}>
          {[
            { l: 'OUTPUT',    v: prodStats.totalProduced.toLocaleString('en-US'), c: C.text,   glow: false },
            { l: 'GOOD',      v: prodStats.goodPieces.toLocaleString('en-US'),    c: C.accent, glow: true  },
            { l: 'REJECTS',   v: prodStats.defects,                               c: prodStats.defects > 0 ? C.red : C.muted, glow: prodStats.defects > 0 },
            { l: 'QUALITY',   v: `${qualityPct.toFixed(1)}%`,                     c: qualityPct >= 95 ? C.accent : C.amber, glow: true },
            { l: 'DEF. RATE', v: `${defectRate.toFixed(2)}%`,                     c: inControl ? C.amber : C.red, glow: !inControl },
            { l: 'OEE',       v: `${oee.toFixed(1)}%`,                            c: oee >= 85 ? C.accent : oee >= 65 ? C.amber : C.red, glow: true },
            { l: 'CPK',       v: cpk.toFixed(2),                                  c: cpk >= 1.33 ? C.accent : cpk >= 1.0 ? C.amber : C.red, glow: false },
            { l: 'SIGMA',     v: `${sigmaLevel}σ`,                                c: sigmaLevel >= 4 ? C.accent : sigmaLevel >= 3 ? C.amber : C.red, glow: false },
            { l: 'FPS LIVE',  v: currentFps > 0 ? `${currentFps}` : '—',         c: currentFps >= 25 ? C.accent : currentFps >= 15 ? C.amber : currentFps > 0 ? C.red : C.muted, glow: currentFps > 0 },
            { l: 'THRUPUT',   v: throughputRate != null ? `${throughputRate}/m` : '—', c: C.purple, glow: false },
          ].map(({ l, v, c, glow }, i, arr) => (
            <div key={l} style={{
              flex: '1 1 80px', padding: '11px 0 12px', textAlign: 'center',
              borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
              borderTop: `2px solid ${glow ? c + '66' : 'transparent'}`,
              background: glow ? `${c}08` : 'transparent',
              transition: 'background 0.4s ease',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c, fontFamily: FONT_MONO, lineHeight: 1, textShadow: glow ? `0 0 14px ${c}66` : 'none', transition: 'color 0.3s ease' }}>{v}</div>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1.6, marginTop: 4, textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '272px 1fr', overflow: 'hidden', minHeight: 0 }}>

        {/* LEFT SIDEBAR */}
        <div style={{ overflow: 'auto', padding: '16px 12px', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 10, background: `linear-gradient(180deg, ${C.panel2} 0%, ${C.bg} 100%)` }}>

          {/* OEE */}
          <div style={{ background: `linear-gradient(135deg, ${C.panel} 0%, ${C.card} 100%)`, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 10px', display: 'flex', justifyContent: 'center', boxShadow: `0 0 0 1px ${C.accent}22` }}>
            <OEEGauge value={oee} availability={AVAILABILITY} performance={PERFORMANCE} quality={qualityPct} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border} 0%, transparent 100%)` }} />
            <span style={{ fontSize: 7.5, color: C.muted2, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>Quality</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent 0%, ${C.border} 100%)` }} />
          </div>

          {/* KPI tiles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { label: 'Global Quality', value: qualityPct.toFixed(1), unit: '%', color: qualityPct >= 95 ? C.accent : C.amber, trend: qualityPct - 95 },
              { label: 'Defect Rate',    value: defectRate.toFixed(2), unit: '%', color: inControl ? C.amber : C.red,           trend: -(defectRate - UCL_DEFECT) },
              { label: 'Cp',            value: cp.toFixed(2),                    color: cp >= 1.33 ? C.accent : cp >= 1.0 ? C.amber : C.red },
              { label: 'Cpk',           value: cpk.toFixed(2),                   color: cpk >= 1.33 ? C.accent : cpk >= 1.0 ? C.amber : C.red },
            ].map(p => <KpiTile key={p.label} {...p} />)}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border} 0%, transparent 100%)` }} />
            <span style={{ fontSize: 7.5, color: C.muted2, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>Process</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent 0%, ${C.border} 100%)` }} />
          </div>

          {/* Process metrics */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '7px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 9, fontWeight: 700, color: C.amber, letterSpacing: 1.6, textTransform: 'uppercase', background: C.panel2 }}>Industrial KPI</div>
            {[
              { label: 'Takt Time',   value: taktTime,         unit: 's/pc', color: C.cyan   },
              { label: 'Cycle Time',  value: cycleTime,        unit: 's',    color: C.purple },
              { label: 'Yield (FPY)', value: `${yieldFPY}`,   unit: '%',    color: parseFloat(yieldFPY) >= 95 ? C.accent : C.amber },
              { label: 'MTBF',        value: mtbfMttr.mtbf,   unit: 'h',    color: C.accent },
              { label: 'MTTR',        value: `${mtbfMttr.mttr}`, unit: 'min', color: mtbfMttr.mttr > 15 ? C.amber : C.accent },
            ].map(({ label, value, unit, color }, i) => (
              <div key={label} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: i % 2 ? `${C.card2}55` : 'transparent' }}>
                <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>
                  {value}<span style={{ fontSize: 10, color, marginLeft: 3, fontWeight: 700 }}>{unit}</span>
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border} 0%, transparent 100%)` }} />
            <span style={{ fontSize: 7.5, color: C.muted2, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700 }}>Session</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent 0%, ${C.border} 100%)` }} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '7px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 9, fontWeight: 700, color: C.cyan, letterSpacing: 1.6, textTransform: 'uppercase', background: C.panel2 }}>Live Session</div>
            {[
              { label: 'Elapsed',    value: fmtElapsed(elapsed),                                            unit: '',        color: C.cyan   },
              { label: 'Throughput', value: throughputRate != null ? `${throughputRate}` : '—',              unit: 'pcs/min', color: C.accent },
              { label: 'Produced',   value: prodStats.totalProduced.toLocaleString('en-US'),                 unit: 'pcs',     color: C.text   },
              { label: 'Good',       value: prodStats.goodPieces.toLocaleString('en-US'),                    unit: '',        color: C.accent },
              { label: 'Start',      value: startedAt ? startedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—', unit: '', color: C.muted },
            ].map(({ label, value, unit, color }, i, arr) => (
              <div key={label} style={{ padding: '8px 12px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: i % 2 ? `${C.card2}55` : 'transparent' }}>
                <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>
                  {value}{unit && <span style={{ fontSize: 9, color, marginLeft: 3, fontWeight: 700 }}>{unit}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CHARTS AREA */}
        <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: '18px 20px 32px', background: C.bg, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Session Summary — 5-column live overview */}
          <ChartCard title="Session Summary" subtitle="Live session overview — elapsed, throughput, quality and process capability" color={C.cyan} fullWidth>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {[
                {
                  label: 'ELAPSED',
                  value: fmtElapsed(elapsed),
                  unit:  '',
                  color: C.cyan,
                  sub:   startedAt ? `avviata alle ${startedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : 'sessione non avviata',
                },
                {
                  label: 'THROUGHPUT',
                  value: throughputRate != null ? `${throughputRate}` : '—',
                  unit:  'pcs/min',
                  color: C.accent,
                  sub:   `${prodStats.totalProduced.toLocaleString('en-US')} pcs totali`,
                },
                {
                  label: 'OUTPUT',
                  value: prodStats.totalProduced.toLocaleString('en-US'),
                  unit:  'pcs',
                  color: C.text,
                  sub:   `${prodStats.goodPieces.toLocaleString('en-US')} buoni · ${prodStats.defects} scarti`,
                },
                {
                  label: 'QUALITY',
                  value: qualityPct.toFixed(1),
                  unit:  '%',
                  color: qualityPct >= 95 ? C.accent : C.amber,
                  sub:   `target ≥ 95% · ${qualityPct >= 95 ? 'ON TARGET' : `${(qualityPct - 95).toFixed(1)}%`}`,
                },
                {
                  label: 'SIGMA',
                  value: `${sigmaLevel}`,
                  unit:  'σ',
                  color: sigmaLevel >= 4 ? C.accent : sigmaLevel >= 3 ? C.amber : C.red,
                  sub:   `Cpk ${cpk.toFixed(2)} · ${cpk >= 1.33 ? 'CAPABLE' : cpk >= 1.0 ? 'MARGINAL' : 'INCAPABLE'}`,
                },
              ].map(({ label, value, unit, color, sub }) => (
                <div key={label} style={{
                  background: C.card2,
                  border: `1px solid ${C.border}`,
                  borderTop: `2px solid ${color}66`,
                  borderRadius: 8,
                  padding: '14px 12px',
                  textAlign: 'center',
                  boxShadow: `inset 0 0 30px ${color}05`,
                }}>
                  <div style={{ fontSize: 8, color: C.muted2, letterSpacing: 1.8, textTransform: 'uppercase', fontWeight: 700, marginBottom: 7 }}>{label}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 800, color, lineHeight: 1, textShadow: `0 0 18px ${color}44` }}>
                    {value}
                    {unit && <span style={{ fontSize: 13, marginLeft: 3, color: `${color}bb`, fontWeight: 700 }}>{unit}</span>}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>{sub}</div>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Row 1 — Production Timeline */}
          <ChartCard title="Production Timeline" subtitle="Good parts vs. rejects per sample" color={C.accent} onExport={expTimeline} fullWidth>
            {hasData ? (
              <ResponsiveContainer width="99%" height={CHART_H_LG}>
                <AreaChart data={visibleTimeline} margin={{ ...MARGIN, right: 18 }}>
                  <GradDefs />
                  <CartesianGrid strokeDasharray="3 4" stroke={C.border} />
                  <XAxis dataKey="time" {...AXIS_STYLE} interval="preserveStartEnd" />
                  <YAxis {...AXIS_STYLE} />
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.muted, paddingTop: 8 }} />
                  <Area type="monotoneX" dataKey="good"    stroke={C.accent} fill="url(#gA)" strokeWidth={2.5} name="Good Parts" dot={NO_DOT} isAnimationActive={false} />
                  <Area type="monotoneX" dataKey="defects" stroke={C.red}    fill="url(#gR)" strokeWidth={2}   name="Rejects"    dot={NO_DOT} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart h={CHART_H_LG} message="START production to record data" />}
          </ChartCard>

          {/* Row 2 — SPC + FPS Live */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, minWidth: 0 }}>

            <ChartCard title="SPC · Defect Rate" subtitle={`UCL ${UCL_DEFECT}%  ·  CL ${CL_DEFECT}%`} color={C.amber} onExport={expSPC}>
              {hasData ? (
                <ResponsiveContainer width="99%" height={CHART_H}>
                  <LineChart data={spcTimeline} margin={MARGIN}>
                    <CartesianGrid strokeDasharray="3 4" stroke={C.border} />
                    <XAxis dataKey="time" {...AXIS_STYLE} interval="preserveStartEnd" />
                    <YAxis {...AXIS_STYLE} domain={[0, 8]} unit="%" />
                    <Tooltip content={<Tip />} />
                    <ReferenceLine y={UCL_DEFECT} stroke={C.red}   strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'UCL', fill: C.red,   fontSize: 9, fontFamily: FONT_MONO }} />
                    <ReferenceLine y={CL_DEFECT}  stroke={C.muted} strokeDasharray="4 4" strokeWidth={1}   label={{ value: 'CL',  fill: C.muted, fontSize: 9, fontFamily: FONT_MONO }} />
                    <Line type="monotoneX" dataKey="rate" stroke={C.amber} strokeWidth={2.5} dot={NO_DOT} activeDot={{ r: 5, fill: C.amber, strokeWidth: 0 }} name="Defect Rate %" isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard
              title="FPS Live Trend"
              subtitle="Vision system frame rate — target 25 fps"
              color={C.cyan}
              onExport={expFps}
              badge={<LiveBadge fps={currentFps} />}
            >
              {hasData ? (
                <ResponsiveContainer width="99%" height={CHART_H}>
                  <AreaChart data={fpsTimeline} margin={MARGIN}>
                    <GradDefs />
                    <CartesianGrid strokeDasharray="3 4" stroke={C.border} />
                    <XAxis dataKey="time" {...AXIS_STYLE} interval="preserveStartEnd" />
                    <YAxis {...AXIS_STYLE} domain={[0, 35]} unit=" fps" />
                    <Tooltip content={<Tip />} />
                    <ReferenceLine y={25} stroke={C.accent} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '25 fps', fill: C.accent, fontSize: 9, fontFamily: FONT_MONO }} />
                    <Area type="monotoneX" dataKey="fps" stroke={C.cyan} fill="url(#gC)" strokeWidth={2.5} dot={NO_DOT} activeDot={{ r: 5, fill: C.cyan, strokeWidth: 0 }} name="FPS" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: CHART_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <LiveBadge fps={currentFps} />
                  <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, fontFamily: FONT_MONO }}>
                    {currentFps > 0 ? 'Waiting for timeline data…' : 'Start cameras to record FPS'}
                  </span>
                </div>
              )}
            </ChartCard>
          </div>

          {/* Row 3 — Pareto + Pie */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, minWidth: 0 }}>

            <ChartCard title="Pareto · Defect Types" subtitle="Click bar for drill-down" color={C.red} onExport={expPareto}>
              <ResponsiveContainer width="99%" height={CHART_H}>
                <ComposedChart data={paretoData} margin={MARGIN}
                  onClick={d => d?.activePayload?.[0] && setDrillDefect(d.activePayload[0].payload.name)}>
                  <CartesianGrid strokeDasharray="3 4" stroke={C.border} vertical={false} />
                  <XAxis dataKey="name" {...AXIS_STYLE} />
                  <YAxis yAxisId="l" {...AXIS_STYLE} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" {...AXIS_STYLE} />
                  <Tooltip content={<Tip />} />
                  <Bar yAxisId="l" dataKey="count" name="Count" radius={[5,5,0,0]} barSize={34} isAnimationActive={false} cursor="pointer">
                    {paretoData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                  <Line yAxisId="r" type="monotone" dataKey="cumPct" stroke={C.cyan} strokeWidth={2.5} dot={{ r: 4, fill: C.cyan, strokeWidth: 0 }} name="Cum. %" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Production Balance" subtitle="Good parts vs. rejects split" color={C.accent} onExport={() => exportCSV(pieData.map(d => ({ category: d.name, count: d.value, pct: ((d.value / Math.max(fTotal, 1)) * 100).toFixed(2) })), 'balance.csv', { 'Total': fTotal, 'Quality': `${qualityPct.toFixed(1)}%` })}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <PieChart width={CHART_H} height={CHART_H}>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={54} outerRadius={82} paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: FONT_MONO, color: qualityPct >= 95 ? C.accent : C.amber, textShadow: `0 0 16px ${qualityPct >= 95 ? C.accent : C.amber}66`, lineHeight: 1 }}>{qualityPct.toFixed(1)}%</div>
                    <div style={{ fontSize: 7, color: C.muted, letterSpacing: 2, marginTop: 3, textTransform: 'uppercase' }}>Quality</div>
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Good Parts',  value: fGood.toLocaleString('en-US'),    color: C.accent, pct: fTotal > 0 ? (fGood / fTotal * 100).toFixed(1) : '100.0' },
                    { label: 'Rejects',     value: fDefects.toLocaleString('en-US'), color: C.red,    pct: fTotal > 0 ? (fDefects / fTotal * 100).toFixed(1) : '0.0'   },
                    { label: 'Total Inspected', value: fTotal.toLocaleString('en-US'), color: C.cyan, pct: null },
                  ].map(({ label, value, color, pct }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: C.muted, flex: 1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
                      <span style={{ fontSize: 17, fontWeight: 800, color, fontFamily: FONT_MONO, lineHeight: 1 }}>{value}</span>
                      {pct != null && <span style={{ fontSize: 10, color, fontFamily: FONT_MONO, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{pct}%</span>}
                    </div>
                  ))}

                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 8, color: C.muted2, letterSpacing: 1.4, fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>Distribution</div>
                    <div style={{ height: 12, borderRadius: 6, background: C.border2, overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${fTotal > 0 ? (fGood / fTotal) * 100 : 100}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.accent}bb)`, transition: 'width 0.7s cubic-bezier(.4,0,.2,1)', borderRadius: '6px 0 0 6px' }} />
                      <div style={{ flex: 1, background: `linear-gradient(90deg, ${C.red}bb, ${C.red})`, borderRadius: '0 6px 6px 0' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 8.5, color: C.accent, fontFamily: FONT_MONO, fontWeight: 700 }}>● GOOD</span>
                      <span style={{ fontSize: 8.5, color: C.red,    fontFamily: FONT_MONO, fontWeight: 700 }}>REJECTS ●</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: qualityPct >= 95 ? `${C.accent}10` : `${C.amber}10`, border: `1px solid ${qualityPct >= 95 ? C.accent : C.amber}33`, borderRadius: 5 }}>
                    <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>TARGET ≥ 95%</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, fontFamily: FONT_MONO, color: qualityPct >= 95 ? C.accent : C.amber }}>
                      {qualityPct >= 95 ? '✓ ON TARGET' : `${(qualityPct - 95).toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              </div>
            </ChartCard>
          </div>

          {/* Row 4 — Cpk + Quality per station */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, minWidth: 0 }}>

            <ChartCard title="Cpk Trend" subtitle="Process capability — target ≥ 1.33" color={C.amber} onExport={expCpk}>
              {hasData ? (
                <ResponsiveContainer width="99%" height={CHART_H}>
                  <AreaChart data={cpkTimeline} margin={MARGIN}>
                    <GradDefs />
                    <CartesianGrid strokeDasharray="3 4" stroke={C.border} />
                    <XAxis dataKey="time" {...AXIS_STYLE} interval="preserveStartEnd" />
                    <YAxis {...AXIS_STYLE} domain={[0, 2.5]} />
                    <Tooltip content={<Tip />} />
                    <ReferenceLine y={1.33} stroke={C.accent} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '1.33', fill: C.accent, fontSize: 9, fontFamily: FONT_MONO }} />
                    <ReferenceLine y={1.00} stroke={C.amber}  strokeDasharray="4 4" strokeWidth={1}   label={{ value: '1.00', fill: C.amber,  fontSize: 9, fontFamily: FONT_MONO }} />
                    <Area type="monotoneX" dataKey="cpk" stroke={C.amber} fill="url(#gAm)" strokeWidth={2.5} dot={NO_DOT} name="Cpk" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard title="Quality · Per Station" subtitle="Good rate — target 95%" color={C.accent}>
              <ResponsiveContainer width="99%" height={CHART_H}>
                <ComposedChart data={stationScores} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 4" stroke={C.border} vertical={false} />
                  <XAxis dataKey="station" {...AXIS_STYLE} />
                  <YAxis {...AXIS_STYLE} domain={[0, 100]} unit="%" />
                  <Tooltip content={<Tip />} />
                  <ReferenceLine y={95} stroke={C.accent} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '95%', fill: C.accent, fontSize: 9, fontFamily: FONT_MONO }} />
                  <Bar dataKey="quality" name="Quality %" radius={[5,5,0,0]} isAnimationActive={false}>
                    {stationScores.map((s, i) => <Cell key={i} fill={s.quality >= 95 ? C.accent : s.quality >= 85 ? C.amber : C.red} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 5 — Hourly output */}
          <ChartCard title="Hourly Output" subtitle="Last 8 hours — production volume" color={C.cyan}
            onExport={() => exportCSV(hourlyData, 'hourly.csv')} fullWidth>
            <ResponsiveContainer width="99%" height={CHART_H}>
              <BarChart data={hourlyData} barGap={4} margin={{ ...MARGIN, right: 18 }}>
                <CartesianGrid strokeDasharray="3 4" stroke={C.border} vertical={false} />
                <XAxis dataKey="ora"    {...AXIS_STYLE} />
                <YAxis                  {...AXIS_STYLE} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
                <Bar dataKey="buoni"  name="Good Parts" fill={C.accent} radius={[4,4,0,0]} isAnimationActive={false} />
                <Bar dataKey="scarti" name="Rejects"    fill={C.red}    radius={[4,4,0,0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Row 6 — AI Confidence Score */}
          <ChartCard title="AI Confidence Score" subtitle="Mean inspection score per sample — target ≥ 90%" color={C.purple} fullWidth>
            {hasData ? (
              <ResponsiveContainer width="99%" height={CHART_H}>
                <ComposedChart data={scoreTimeline} margin={{ ...MARGIN, right: 18 }}>
                  <GradDefs />
                  <CartesianGrid strokeDasharray="3 4" stroke={C.border} vertical={false} />
                  <XAxis dataKey="time" {...AXIS_STYLE} interval="preserveStartEnd" />
                  <YAxis {...AXIS_STYLE} unit="%" domain={[0, 100]} />
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
                  <Area type="monotoneX" dataKey="avgScore" stroke={C.purple} fill="url(#gP)" strokeWidth={2.5} dot={NO_DOT} name="Avg Score %" isAnimationActive={false} />
                  <Line type="monotoneX" dataKey="minScore" stroke={C.red} strokeWidth={1.8} dot={NO_DOT} strokeDasharray="5 3" name="Min Score %" isAnimationActive={false} />
                  <ReferenceLine y={90} stroke={C.accent} strokeDasharray="6 3" strokeWidth={1} label={{ value: '90%', fill: C.accent, fontSize: 9, fontFamily: FONT_MONO }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          {/* Row 7 — Efficiency Trend + Radar difetti */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, minWidth: 0 }}>

            <ChartCard title="Efficiency Trend" subtitle="Throughput efficiency % per campione" color={C.pink}>
              {hasData ? (
                <ResponsiveContainer width="99%" height={CHART_H}>
                  <AreaChart data={efficiencyTimeline} margin={MARGIN}>
                    <GradDefs />
                    <CartesianGrid strokeDasharray="3 4" stroke={C.border} />
                    <XAxis dataKey="time" {...AXIS_STYLE} interval="preserveStartEnd" />
                    <YAxis {...AXIS_STYLE} domain={[0, 100]} unit="%" />
                    <Tooltip content={<Tip />} />
                    <ReferenceLine y={95} stroke={C.accent} strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '95%', fill: C.accent, fontSize: 9, fontFamily: FONT_MONO }} />
                    <Area type="monotoneX" dataKey="efficiency" stroke={C.pink} fill="url(#gPk)" strokeWidth={2.5} dot={NO_DOT} name="Efficiency %" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </ChartCard>

            <ChartCard title="Defect Radar" subtitle="Distribuzione tipi difetto per categoria" color={C.red}>
              <ResponsiveContainer width="99%" height={CHART_H}>
                <RadarChart data={radarData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                  <PolarGrid stroke={C.border2} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: C.muted, fontSize: 9.5, fontFamily: FONT_MONO, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: C.muted2, fontSize: 8 }} />
                  <Radar name="Quota %" dataKey="value" stroke={C.red} fill={C.red} fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip content={<Tip />} />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Alarm Log */}
          <div style={{ background: C.panel, border: `1px solid ${alarms.length > 0 ? C.red + '55' : C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: alarms.length > 0 ? `0 0 0 1px ${C.red}22` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 3, height: 22, borderRadius: 2, background: alarms.length > 0 ? C.red : C.accent }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.text, letterSpacing: 1.4, textTransform: 'uppercase' }}>Alarm Log</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Process alerts — thresholds and system status</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => exportCSV(alarms.map(a => ({ ts: a.ts, severity: a.severity, type: a.type, message: a.message })), 'alarms.csv')}
                  style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>↓ CSV</button>
                <span style={{
                  fontSize: 9, fontFamily: FONT_MONO, fontWeight: 800,
                  color: alarms.length > 0 ? C.red : C.accent,
                  background: alarms.length > 0 ? `${C.red}18` : `${C.accent}18`,
                  border: `1px solid ${alarms.length > 0 ? `${C.red}44` : `${C.accent}44`}`,
                  padding: '3px 10px', borderRadius: 4, letterSpacing: 1,
                  animation: alarms.length > 0 ? 'apPulse 2s ease-in-out infinite' : 'none',
                }}>
                  {alarms.length > 0 ? `${alarms.length} ACTIVE` : '✓ CLEAR'}
                </span>
              </div>
            </div>
            {alarms.length === 0 ? (
              <div style={{ padding: '18px', textAlign: 'center', color: C.accent, fontSize: 11, fontFamily: FONT_MONO, letterSpacing: 2 }}>ALL SYSTEMS NOMINAL</div>
            ) : alarms.map(a => {
              const c = a.severity === 'CRITICAL' ? C.red : C.amber;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.border}`, background: `${c}04` }}>
                  <span style={{ fontSize: 9, fontWeight: 800, fontFamily: FONT_MONO, background: `${c}18`, border: `1px solid ${c}44`, color: c, padding: '2px 8px', borderRadius: 3, letterSpacing: 0.8, flexShrink: 0 }}>{a.severity}</span>
                  <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT_MONO, flexShrink: 0, minWidth: 60 }}>{a.ts}</span>
                  <span style={{ fontSize: 11, color: c, fontWeight: 700, flexShrink: 0, minWidth: 100 }}>{a.type}</span>
                  <span style={{ fontSize: 11, color: C.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</span>
                </div>
              );
            })}
          </div>

          {/* ── DEFECT TERMINAL ─────────────────────────────────────────── */}
          <DefectTerminal events={filteredEvents.slice(0, 500)} onExport={expDefects} />

          {/* Live Terminal Log */}
          <TerminalLog events={filteredEvents.slice(0, 200)} onExport={expDefects} />

        </div>
      </div>

      {drillDefect && <DefectModal defectType={drillDefect} events={filteredEvents} onClose={() => setDrillDefect(null)} />}

      <style>{`
        @keyframes apPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .recharts-tooltip-cursor { fill: rgba(61,214,245,0.04) !important; }
        .recharts-legend-item-text { color: #7a97b0 !important; }
      `}</style>
    </div>
  );
});

export default AnalyticsPanel;
