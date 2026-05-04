import React, { useState, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
 *  SETUP PANEL — STATION & CAMERA MANAGEMENT
 *  Features: add / remove / rename stations and cameras
 * ═══════════════════════════════════════════════════════════════════════════ */

const C = {
  bg:      '#0a0e14',
  panel:   '#111a25',
  panel2:  '#0e1620',
  card:    '#14202e',
  border:  '#1d2b3c',
  border2: '#27384d',
  accent:  '#22e37a',
  cyan:    '#3dd6f5',
  amber:   '#ffb020',
  red:     '#ff4d5e',
  text:    '#ffffff',
  textDim: '#e6edf5',
  muted:   '#8aa0b4',
};
const FONT      = "'Inter','Segoe UI','Helvetica Neue',sans-serif";
const FONT_MONO = "'JetBrains Mono','Courier New',monospace";

/* ─── Utilities ─────────────────────────────────────────────────────────── */
function genId(prefix) {
  return `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function Separator() {
  return <div style={{ height: 1, background: `linear-gradient(90deg, ${C.border} 0%, transparent 100%)`, margin: '16px 0' }} />;
}

const RES_OPTIONS = [
  { value: '320x240',   label: '320×240  (QVGA)'  },
  { value: '640x480',   label: '640×480  (VGA)'   },
  { value: '1280x720',  label: '1280×720 (HD)'    },
  { value: '1920x1080', label: '1920×1080 (FHD)'  },
  { value: '2560x1440', label: '2560×1440 (QHD)'  },
  { value: '3840x2160', label: '3840×2160 (4K)'   },
];

/* ─── Shared button ─────────────────────────────────────────────────────── */
function Btn({ children, onClick, color = C.accent, variant = 'outline', size = 'sm', disabled = false, style: extraStyle }) {
  const col = variant === 'danger' ? C.red : color;
  const isPrimary = variant === 'primary';

  const baseStyle = {
    background: isPrimary ? `linear-gradient(145deg, ${col}, ${col}cc)` : `${col}12`,
    border: `1px solid ${disabled ? C.border : col + (isPrimary ? 'dd' : 'aa')}`,
    color: isPrimary ? '#0a0e14' : C.text,
    fontSize: size === 'xs' ? 10 : size === 'sm' ? 11 : 12,
    padding: size === 'xs' ? '3px 9px' : size === 'sm' ? '6px 14px' : '8px 20px',
    borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, letterSpacing: 0.6, fontFamily: FONT,
    opacity: disabled ? 0.38 : 1, transition: 'all 0.15s',
    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
    whiteSpace: 'nowrap', boxShadow: isPrimary ? `0 0 12px ${col}44` : 'none',
    ...extraStyle,
  };

  return (
    <button
      style={baseStyle}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={e => {
        if (disabled) return;
        e.currentTarget.style.background = isPrimary ? `linear-gradient(145deg, ${col}, ${col}dd)` : `${col}22`;
        e.currentTarget.style.boxShadow = `0 0 16px ${col}66`;
      }}
      onMouseLeave={e => {
        if (disabled) return;
        e.currentTarget.style.background = isPrimary ? `linear-gradient(145deg, ${col}, ${col}cc)` : `${col}12`;
        e.currentTarget.style.boxShadow = isPrimary ? `0 0 12px ${col}44` : 'none';
      }}
    >
      {children}
    </button>
  );
}

/* ─── Text input / select ────────────────────────────────────────────────── */
function Field({ label, value, onChange, type = 'text', options, placeholder = '' }) {
  const inputStyle = {
    width: '100%', padding: '7px 10px',
    background: C.bg, color: C.text,
    border: `1px solid ${C.border2}`, borderRadius: 4,
    fontSize: 12, fontFamily: FONT_MONO,
    outline: 'none', transition: 'border-color 0.12s',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{
        fontSize: 9, color: C.muted, letterSpacing: 1.3,
        fontWeight: 700, textTransform: 'uppercase',
      }}>{label}</label>
      {options ? (
        <select
          style={inputStyle}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={e => { e.target.style.borderColor = C.accent; }}
          onBlur={e =>  { e.target.style.borderColor = C.border2; }}
        >
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ background: C.panel }}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          style={inputStyle}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={e => { e.target.style.borderColor = C.accent; }}
          onBlur={e =>  { e.target.style.borderColor = C.border2; }}
        />
      )}
    </div>
  );
}

/* ─── Panel section header ───────────────────────────────────────────────── */
function PanelHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      paddingBottom: 14, marginBottom: 16,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.text,
          letterSpacing: 2, textTransform: 'uppercase',
        }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{subtitle}</div>
        )}
      </div>
      {action}
    </div>
  );
}

/* ─── Inline form box ────────────────────────────────────────────────────── */
function FormBox({ children }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border2}`,
      borderRadius: 8, padding: 16, marginBottom: 14,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {children}
    </div>
  );
}

/* ─── Section divider label ─────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 1.8, textTransform: 'uppercase', padding: '4px 0 6px', borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */
export function SetupPanel({ stations, onStationsChange }) {
  const [selectedId,       setSelectedId]       = useState(stations[0]?.id ?? null);
  const [editStationId,    setEditStationId]    = useState(null);
  const [editCameraId,     setEditCameraId]     = useState(null);
  const [addingStation,    setAddingStation]    = useState(false);
  const [addingCamera,     setAddingCamera]     = useState(false);

  /* Support panel state */
  const [supportForm, setSupportForm] = useState({
    name: '', email: '', priority: 'medium', subject: '', message: '',
  });
  const [supportSent,    setSupportSent]    = useState(false);
  const [supportSending, setSupportSending] = useState(false);
  const [supportError,   setSupportError]   = useState(null);

  /* Form state */
  const [newStation,    setNewStation]    = useState({ name: '', line: '' });
  const [newCamera,     setNewCamera]     = useState({ name: '', label: '', id: '', fps: 30, resolution: '1920x1080' });
  const [editStData,    setEditStData]    = useState({ name: '', line: '' });
  const [editCamData,   setEditCamData]   = useState({ name: '', label: '', fps: 30, resolution: '1920x1080' });

  const selectedStation = stations.find(s => s.id === selectedId);

  /* ─── STATION CRUD ──────────────────────────────────────────────────── */
  const handleAddStation = () => {
    if (!newStation.name.trim()) return;
    const id = genId('ST');
    onStationsChange([
      ...stations,
      { id, name: newStation.name.trim(), line: newStation.line.trim() || 'Linea N/A', cameras: [] },
    ]);
    setSelectedId(id);
    setNewStation({ name: '', line: '' });
    setAddingStation(false);
  };

  const handleDeleteStation = (stId) => {
    if (stations.length <= 1) return;
    const next = stations.filter(s => s.id !== stId);
    onStationsChange(next);
    if (selectedId === stId) setSelectedId(next[0]?.id ?? null);
  };

  const handleStartEditStation = (s) => {
    setEditStationId(s.id);
    setEditStData({ name: s.name, line: s.line });
    setEditCameraId(null);
    setAddingCamera(false);
  };

  const handleSaveStation = () => {
    onStationsChange(stations.map(s =>
      s.id === editStationId
        ? { ...s, name: editStData.name.trim() || s.name, line: editStData.line.trim() || s.line }
        : s
    ));
    setEditStationId(null);
  };

  /* ─── CAMERA CRUD ───────────────────────────────────────────────────── */
  const handleAddCamera = () => {
    if (!newCamera.name.trim() || !selectedStation) return;
    if (selectedStation.cameras.length >= 10) return;
    const camId = newCamera.id.trim() || genId('cam');
    onStationsChange(stations.map(s =>
      s.id === selectedId
        ? {
            ...s,
            cameras: [
              ...s.cameras,
              {
                id: camId,
                name: newCamera.name.trim(),
                label: newCamera.label.trim(),
                fps: Number(newCamera.fps) || 30,
                resolution: newCamera.resolution,
              },
            ],
          }
        : s
    ));
    setNewCamera({ name: '', label: '', id: '', fps: 30, resolution: '1920x1080' });
    setAddingCamera(false);
  };

  const handleDeleteCamera = (camId) => {
    onStationsChange(stations.map(s =>
      s.id === selectedId
        ? { ...s, cameras: s.cameras.filter(c => c.id !== camId) }
        : s
    ));
    if (editCameraId === camId) setEditCameraId(null);
  };

  const handleStartEditCamera = (cam) => {
    setEditCameraId(cam.id);
    setEditCamData({ name: cam.name, label: cam.label || '', fps: cam.fps || 30, resolution: cam.resolution || '1920x1080' });
    setAddingCamera(false);
  };

  const handleSaveCamera = () => {
    onStationsChange(stations.map(s =>
      s.id === selectedId
        ? {
            ...s,
            cameras: s.cameras.map(c =>
              c.id === editCameraId
                ? { ...c, ...editCamData, name: editCamData.name.trim() || c.name, fps: Number(editCamData.fps) || 30 }
                : c
            ),
          }
        : s
    ));
    setEditCameraId(null);
  };

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div style={{
      padding: 0,
      background: C.bg,
      height: '100%',
      display: 'flex',
      gap: 0,
      fontFamily: FONT,
      color: C.text,
      overflow: 'hidden',
    }}>

      {/* ── STATION SIDEBAR (nav panel) ───────────────────────────────────── */}
      <div style={{
        width: 260, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: C.panel2,
        borderRight: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}>

        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.text, letterSpacing: 2, textTransform: 'uppercase' }}>Stations</div>
            <div style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>{stations.length} configured</div>
          </div>
          <Btn
            size="xs" color={C.accent}
            onClick={() => { setAddingStation(v => !v); setEditStationId(null); }}
          >
            {addingStation ? '✕' : '+ New'}
          </Btn>
        </div>

        {/* Add station form */}
        {addingStation && (
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, background: `${C.accent}06`, flexShrink: 0 }}>
            <div style={{ fontSize: 8.5, color: C.accent, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 }}>New Station</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field
                label="Station Name"
                value={newStation.name}
                placeholder="e.g. Welding Station"
                onChange={v => setNewStation(p => ({ ...p, name: v }))}
              />
              <Field
                label="Line / Department"
                value={newStation.line}
                placeholder="e.g. Line C · Dept. 4"
                onChange={v => setNewStation(p => ({ ...p, line: v }))}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <Btn
                  onClick={handleAddStation}
                  color={C.accent} variant="primary" size="sm"
                  disabled={!newStation.name.trim()}
                >✓ Add</Btn>
                <Btn onClick={() => setAddingStation(false)} variant="outline" color={C.muted} size="sm">
                  Cancel
                </Btn>
              </div>
            </div>
          </div>
        )}

        {/* Station nav list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {stations.map(s => {
            const isActive = selectedId === s.id;
            return (
              <div
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setEditCameraId(null);
                  setAddingCamera(false);
                  setEditStationId(null);
                }}
                style={{
                  padding: '10px 16px',
                  background: isActive ? `${C.accent}0e` : 'transparent',
                  borderLeft: `3px solid ${isActive ? C.accent : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'all 0.13s',
                  borderBottom: `1px solid ${C.border}`,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${C.border}55`; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: isActive ? C.accent : C.textDim,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{s.name}</div>
                    <div style={{ fontSize: 8.5, color: C.muted, marginTop: 3, display: 'flex', gap: 8 }}>
                      <span style={{ fontFamily: FONT_MONO, color: isActive ? `${C.accent}99` : C.muted }}>{s.id}</span>
                      <span>· {s.cameras.length} CAM</span>
                    </div>
                  </div>
                  {isActive && (
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                      <path d="M1 1l4 4-4 4" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Station count summary */}
        <div style={{
          flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${C.border}`,
          background: C.panel, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {[
            { l: 'Stations', v: stations.length, c: C.cyan },
            { l: 'Cameras',  v: stations.reduce((a, s) => a + s.cameras.length, 0), c: C.accent },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>{l}</span>
              <span style={{ fontSize: 14, color: c, fontFamily: FONT_MONO, fontWeight: 800 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── STATION DETAIL (main area) ───────────────────────────────────── */}
      {selectedStation ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto', padding: '20px 20px' }}>

          {/* Station info card */}
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 20, marginBottom: 16,
          }}>
            {editStationId === selectedStation.id ? (
              /* Edit mode */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  fontSize: 9, color: C.cyan, fontWeight: 700,
                  letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 2,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: C.cyan }} />
                  Edit Station
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Station Name" value={editStData.name}
                    onChange={v => setEditStData(p => ({ ...p, name: v }))} />
                  <Field label="Line / Department" value={editStData.line}
                    onChange={v => setEditStData(p => ({ ...p, line: v }))} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={handleSaveStation} color={C.accent} variant="primary">✓ Save Changes</Btn>
                  <Btn onClick={() => setEditStationId(null)} color={C.muted} variant="outline">Cancel</Btn>
                </div>
              </div>
            ) : (
              /* Display mode */
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                  {/* ID badge */}
                  <div style={{
                    padding: '8px 14px', flexShrink: 0,
                    background: `${C.accent}14`, border: `1px solid ${C.accent}66`,
                    borderRadius: 6, fontSize: 12, color: C.accent,
                    fontWeight: 700, letterSpacing: 1.6, fontFamily: FONT_MONO,
                  }}>{selectedStation.id}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                      {selectedStation.name}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                      {selectedStation.line}
                    </div>
                    <div style={{ fontSize: 9.5, color: C.muted, marginTop: 6, display: 'flex', gap: 14 }}>
                      <span>{selectedStation.cameras.length} Cameras Configured</span>
                      <span style={{ color: selectedStation.cameras.length >= 10 ? C.amber : C.muted }}>
                        max 10
                      </span>
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <Btn onClick={() => handleStartEditStation(selectedStation)} size="sm" color={C.cyan}>
                    ✎ Rename
                  </Btn>
                  {stations.length > 1 && (
                    <Btn
                      onClick={() => handleDeleteStation(selectedStation.id)}
                      size="sm" variant="danger"
                    >
                      ✕ Remove
                    </Btn>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Camera management card */}
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 20, flex: 1,
          }}>
            <PanelHeader
              title={`Cameras (${selectedStation.cameras.length} / 10)`}
              subtitle="Add, rename or remove cameras for this station. Max 10 cameras per station."
              action={
                selectedStation.cameras.length < 10 && (
                  <Btn
                    onClick={() => { setAddingCamera(v => !v); setEditCameraId(null); }}
                    size="sm" color={C.accent}
                  >
                    {addingCamera ? '✕ Cancel' : '+ Add Camera'}
                  </Btn>
                )
              }
            />

            {/* Add camera form */}
            {addingCamera && (
              <FormBox>
                <div style={{
                  fontSize: 9, color: C.accent, fontWeight: 700,
                  letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 2,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ width: 3, height: 12, borderRadius: 2, background: C.accent }} />
                  New Camera
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field
                    label="Name"
                    value={newCamera.name}
                    placeholder="e.g. CAM-04"
                    onChange={v => setNewCamera(p => ({ ...p, name: v }))}
                  />
                  <Field
                    label="Label"
                    value={newCamera.label}
                    placeholder="e.g. Front Inspection"
                    onChange={v => setNewCamera(p => ({ ...p, label: v }))}
                  />
                  <Field
                    label="Camera ID (optional)"
                    value={newCamera.id}
                    placeholder="auto-generated if empty"
                    onChange={v => setNewCamera(p => ({ ...p, id: v }))}
                  />
                  <Field
                    label="FPS"
                    value={String(newCamera.fps)}
                    type="number"
                    placeholder="30"
                    onChange={v => setNewCamera(p => ({ ...p, fps: parseInt(v) || 30 }))}
                  />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field
                      label="Resolution"
                      value={newCamera.resolution}
                      onChange={v => setNewCamera(p => ({ ...p, resolution: v }))}
                      options={RES_OPTIONS}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                  <Btn
                    onClick={handleAddCamera}
                    color={C.accent} variant="primary"
                    disabled={!newCamera.name.trim()}
                  >
                    ✓ Add Camera
                  </Btn>
                  <Btn onClick={() => setAddingCamera(false)} color={C.muted} variant="outline">Cancel</Btn>
                </div>
              </FormBox>
            )}

            {/* Camera list */}
            {selectedStation.cameras.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 0',
                border: `1px dashed ${C.border2}`, borderRadius: 8,
                color: C.muted, fontSize: 12,
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.muted2} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: 0.5 }}>
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M20.188 10.934A2 2 0 0 0 18.3 9H17l-1-2H8L7 9H5.7a2 2 0 0 0-1.888 1.934l-.3 5A2 2 0 0 0 5.4 18h13.2a2 2 0 0 0 1.888-2.066z"/>
                </svg>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No cameras configured</div>
                <span style={{ fontSize: 11, opacity: 0.7 }}>Use the "Add Camera" button to get started.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedStation.cameras.map((cam, idx) => (
                  <div
                    key={cam.id}
                    style={{
                      background: C.card,
                      border: `1px solid ${editCameraId === cam.id ? C.accent + '66' : C.border}`,
                      borderRadius: 8, overflow: 'hidden',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {editCameraId === cam.id ? (
                      /* Camera edit mode */
                      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{
                          fontSize: 9, color: C.cyan, fontWeight: 700,
                          letterSpacing: 1.4, textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <div style={{ width: 3, height: 12, borderRadius: 2, background: C.cyan }} />
                          Edit Camera · {cam.id}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <Field
                            label="Name"
                            value={editCamData.name}
                            onChange={v => setEditCamData(p => ({ ...p, name: v }))}
                          />
                          <Field
                            label="Label"
                            value={editCamData.label}
                            onChange={v => setEditCamData(p => ({ ...p, label: v }))}
                          />
                          <Field
                            label="FPS"
                            value={String(editCamData.fps)}
                            type="number"
                            onChange={v => setEditCamData(p => ({ ...p, fps: parseInt(v) || 30 }))}
                          />
                          <Field
                            label="Resolution"
                            value={editCamData.resolution}
                            onChange={v => setEditCamData(p => ({ ...p, resolution: v }))}
                            options={RES_OPTIONS}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
                          <Btn onClick={handleSaveCamera} color={C.accent} variant="primary">✓ Save</Btn>
                          <Btn onClick={() => setEditCameraId(null)} color={C.muted} variant="outline">Cancel</Btn>
                        </div>
                      </div>
                    ) : (
                      /* Camera display mode */
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                      }}>
                        {/* Index badge */}
                        <div style={{
                          width: 34, height: 34, borderRadius: 6, flexShrink: 0,
                          background: `${C.cyan}14`, border: `1px solid ${C.cyan}33`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, color: C.cyan, fontWeight: 700, fontFamily: FONT_MONO,
                        }}>
                          {String(idx + 1).padStart(2, '0')}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 700, color: C.text,
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            {cam.name}
                            {cam.label && (
                              <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>
                                — {cam.label}
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontSize: 9.5, color: C.muted, marginTop: 4,
                            display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
                          }}>
                            <span style={{ fontFamily: FONT_MONO, color: C.cyan }}>{cam.id}</span>
                            <span style={{ color: C.border2 }}>|</span>
                            <span>{cam.fps || 30} fps</span>
                            <span style={{ color: C.border2 }}>|</span>
                            <span>{cam.resolution || '—'}</span>
                          </div>
                        </div>

                        {/* Status badge */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '3px 9px',
                          background: `${C.accent}10`, border: `1px solid ${C.accent}33`,
                          borderRadius: 4, flexShrink: 0,
                        }}>
                          <div style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: C.accent, boxShadow: `0 0 5px ${C.accent}`,
                          }} />
                          <span style={{ fontSize: 8.5, color: C.accent, fontWeight: 700, letterSpacing: 1 }}>
                            ACTIVE
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <Btn onClick={() => handleStartEditCamera(cam)} size="xs" color={C.cyan}>
                            ✎ Edit
                          </Btn>
                          <Btn onClick={() => handleDeleteCamera(cam.id)} size="xs" variant="danger">
                            ✕
                          </Btn>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Capacity bar */}
            {selectedStation.cameras.length > 0 && (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: C.muted }}>
                  <span style={{ letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Capacity</span>
                  <span style={{ fontFamily: FONT_MONO, color: selectedStation.cameras.length >= 8 ? C.amber : C.muted }}>
                    {selectedStation.cameras.length} / 10
                  </span>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${(selectedStation.cameras.length / 10) * 100}%`,
                    background: selectedStation.cameras.length >= 8 ? C.amber : C.accent,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.muted, fontSize: 13, gap: 10, flexDirection: 'column',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.muted2} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Select a station to view details and manage its cameras.
        </div>
      )}

      {/* ── SUPPORT / ASSISTANCE PANEL ───────────────────────────────────── */}
      <div style={{
        width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: C.panel, borderLeft: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
          background: C.panel2, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 7, flexShrink: 0,
            background: `${C.cyan}14`, border: `1px solid ${C.cyan}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke={C.cyan} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11a9 9 0 0 1 18 0"/>
              <rect x="2" y="11" width="4" height="6" rx="2"/>
              <rect x="18" y="11" width="4" height="6" rx="2"/>
              <path d="M22 17v1a4 4 0 0 1-4 4h-3"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, letterSpacing: 1.4, textTransform: 'uppercase' }}>
             AQUIRA Support
            </div>
            <div style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>
              Technical assistance · AQUIRA
            </div>
          </div>
        </div>

        {supportSent ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{
              background: `${C.accent}0c`, border: `1px solid ${C.accent}44`,
              borderRadius: 10, padding: '28px 20px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              width: '100%',
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: '50%',
                background: `${C.accent}1a`, border: `2px solid ${C.accent}66`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: C.accent,
              }}>✓</div>
              <div>
                <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase' }}>
                  Request Sent
                </div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7, maxWidth: 240, marginTop: 8 }}>
                  Request sent to{' '}
                  <span style={{ color: C.cyan, fontFamily: FONT_MONO }}>pdimatteo@itsmeccanicabruzzo.eu</span>
                </div>
              </div>
              <Btn
                size="sm" color={C.cyan}
                onClick={() => setSupportSent(false)}
              >
                ↩ New Request
              </Btn>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Section: Contact */}
            <SectionLabel>Contact</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <Field
                label="Company / Name"
                value={supportForm.name}
                placeholder="e.g. ITS Meccanica Bruzzo"
                onChange={v => setSupportForm(p => ({ ...p, name: v }))}
              />
              <Field
                label="Your E-mail"
                value={supportForm.email}
                placeholder="name@company.com"
                onChange={v => setSupportForm(p => ({ ...p, email: v }))}
              />
            </div>

            {/* Section: Issue */}
            <SectionLabel>Issue</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10, marginBottom: 10 }}>
              <Field
                label="Priority"
                value={supportForm.priority}
                options={[
                  { value: 'low',      label: '   Low'      },
                  { value: 'medium',   label: '   Medium'   },
                  { value: 'high',     label: '   High'     },
                  { value: 'critical', label: '   Critical' },
                ]}
                onChange={v => setSupportForm(p => ({ ...p, priority: v }))}
              />
              <Field
                label="Subject"
                value={supportForm.subject}
                placeholder="Brief description of the issue"
                onChange={v => setSupportForm(p => ({ ...p, subject: v }))}
              />
            </div>

            {/* Message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
              <label style={{ fontSize: 9, color: C.muted, letterSpacing: 1.3, fontWeight: 700, textTransform: 'uppercase' }}>
                Message
              </label>
              <textarea
                rows={5}
                value={supportForm.message}
                placeholder="Describe the issue in detail: steps to reproduce, error messages, software version..."
                onChange={e => setSupportForm(p => ({ ...p, message: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                  background: C.bg, color: C.text,
                  border: `1px solid ${C.border2}`, borderRadius: 4,
                  fontSize: 11, fontFamily: FONT_MONO, resize: 'vertical',
                  outline: 'none', lineHeight: 1.6,
                }}
                onFocus={e  => { e.target.style.borderColor = C.accent; }}
                onBlur={e   => { e.target.style.borderColor = C.border2; }}
              />
            </div>

            {/* Critical warning */}
            {supportForm.priority === 'critical' && (
              <div style={{
                background: `${C.red}12`, border: `1px solid ${C.red}44`,
                borderRadius: 4, padding: '8px 12px', marginBottom: 10,
                fontSize: 10, color: C.red, fontWeight: 600, lineHeight: 1.5,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                CRITICAL PRIORITY — response within 4 business hours.
              </div>
            )}

            {/* Error */}
            {supportError && (
              <div style={{
                padding: '7px 11px', background: 'rgba(255,77,94,0.1)',
                border: `1px solid ${C.red}44`, borderRadius: 5, marginBottom: 10,
                fontSize: 10, color: C.red,
              }}>
                ✗ Send error: {supportError}
              </div>
            )}

            {/* Send button */}
            <Btn
              size="md" variant="primary" color={C.accent}
              disabled={supportSending || !supportForm.name.trim() || !supportForm.email.trim() || !supportForm.subject.trim() || !supportForm.message.trim()}
              onClick={async () => {
                setSupportSending(true);
                setSupportError(null);
                try {
                  const r = await fetch('http://localhost:3000/api/support', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      azienda:  supportForm.name,
                      email:    supportForm.email,
                      priority: supportForm.priority,
                      subject:  supportForm.subject,
                      message:  supportForm.message,
                    }),
                  });
                  const data = await r.json();
                  if (data.success) {
                    setSupportSent(true);
                  } else {
                    setSupportError(data.error || 'Unknown error');
                  }
                } catch (e) {
                  setSupportError('Unable to reach server. Please try again.');
                } finally {
                  setSupportSending(false);
                }
              }}
              style={{ width: '100%', justifyContent: 'center', padding: '9px 16px' }}
            >
              {supportSending ? 'Sending...' : '✉ Send Request'}
            </Btn>

            {/* Direct contacts */}
            <div style={{
              marginTop: 14, padding: '12px 14px',
              background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6,
            }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1.6, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                Direct Contact
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <a href="mailto:pdimatteo@itsmeccanicabruzzo.eu" style={{
                    fontSize: 10, color: C.cyan, fontFamily: FONT_MONO, textDecoration: 'none',
                  }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                  >pdimatteo@itsmeccanicabruzzo.eu</a>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT_MONO }}>Mon–Fri  9:00–18:00</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        select option { background: #111a25; color: #ffffff; }
        input::placeholder { color: #4a6070; }
        textarea::placeholder { color: #4a6070; }
      `}</style>
    </div>
  );
}

export default SetupPanel;
 
