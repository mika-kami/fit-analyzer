/**
 * Dashboard.jsx — Home screen showing workout history.
 * Primary entry point of the app. Replaces the upload-first flow.
 * Shows saved workouts, quick stats, and load options.
 */
import { useState, useRef } from 'react';
import { BulkUploadModal } from './BulkUploadModal.jsx';

const LOAD_COLOR = {
  high: '#ef4444', medium: '#f97316', low: '#4ade80', unknown: '#374151'
};

const SPORT_ICON = {
  cycling: '🚴', running: '🏃', swimming: '🏊', hiking: '🥾',
  road_cycling: '🚴', trail_running: '🏃',
};

function sportIcon(sport = '') {
  const s = sport.toLowerCase();
  for (const [k, v] of Object.entries(SPORT_ICON)) {
    if (s.includes(k)) return v;
  }
  return '🏅';
}

function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ── Period stats bar ──────────────────────────────────────────────────────────
function PeriodStats({ workouts }) {
  if (!workouts.length) return null;
  const totalKm  = workouts.reduce((s, w) => s + (w.distance ?? 0) / 1000, 0);
  const totalH   = workouts.reduce((s, w) => s + (w.duration?.active ?? 0), 0) / 3600;
  const totalAsc = workouts.reduce((s, w) => s + (w.elevation?.ascent ?? 0), 0);
  const avgTE    = workouts.reduce((s, w) => s + (w.trainingEffect?.aerobic ?? 0), 0) / workouts.length;

  const stats = [
    { label: 'Workouts', value: workouts.length, unit: '' },
    { label: 'Distance',  value: totalKm.toFixed(0), unit: 'km' },
    { label: 'Time',      value: fmtDur(totalH * 3600), unit: '' },
    { label: 'Ascent',      value: Math.round(totalAsc).toLocaleString(), unit: 'm' },
    { label: 'Avg TE',    value: avgTE.toFixed(1), unit: '/5' },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
      gap: 'var(--sp-2)',
      marginBottom: 'var(--sp-5)',
    }}>
      {stats.map(s => (
        <div key={s.label} style={{
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-3) var(--sp-3)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
            {s.value}<span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>{s.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Workout card ──────────────────────────────────────────────────────────────
function WorkoutCard({ w, onSelect, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const loadColor = LOAD_COLOR[w.load?.level ?? 'unknown'];

  return (
    <div
      onClick={() => onSelect(w)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(255,255,255,0.04)' : 'var(--bg-overlay)',
        border: `1px solid ${hovered ? 'var(--border-mid)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-4)',
        cursor: 'pointer',
        transition: 'all var(--t-base) var(--ease-snappy)',
        position: 'relative',
      }}
    >
      {/* Load bar on left edge */}
      <div style={{
        position: 'absolute', left: 0, top: 16, bottom: 16,
        width: 3, borderRadius: '0 2px 2px 0',
        background: loadColor, opacity: 0.8,
      }} />

      <div style={{ paddingLeft: 'var(--sp-3)' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <span style={{ fontSize: 18 }}>{sportIcon(w.sport)}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {w.sport}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {w.date} · {w.startTime}
              </div>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDelete(w.date); }}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-dim)', fontSize: 16,
              cursor: 'pointer', padding: '2px 6px',
              opacity: hovered ? 0.6 : 0,
              transition: 'opacity var(--t-base)',
            }}
          >×</button>
        </div>

        {/* Metrics row */}
        <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          {[
            { v: `${(w.distance / 1000).toFixed(1)} km` },
            { v: fmtDur(w.duration?.active ?? 0) },
            { v: `↑ ${w.elevation?.ascent ?? 0} m` },
            { v: `♥ ${w.heartRate?.avg ?? '—'} bpm` },
            { v: `TE ${w.trainingEffect?.aerobic?.toFixed(1) ?? '—'}`, accent: true },
          ].map((m, i) => (
            <span key={i} style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: m.accent ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: m.accent ? 600 : 400,
            }}>{m.v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Drop zone for file upload ─────────────────────────────────────────────────
function DropZone({ onFile, onBulk, isLoading, compact }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const onDrop = e => {
    e.preventDefault(); setDrag(false);
    const fitFiles = Array.from(e.dataTransfer.files).filter(
      f => f.name.toLowerCase().endsWith('.fit')
    );
    if (fitFiles.length === 1) onFile(fitFiles[0]);
    else if (fitFiles.length > 1) onBulk(fitFiles);
  };

  if (compact) {
    return (
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isLoading}
        style={{
          background: 'var(--bg-overlay)',
          border: '1px dashed var(--border-mid)',
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-3) var(--sp-4)',
          color: 'var(--text-secondary)',
          fontSize: 13, cursor: isLoading ? 'wait' : 'pointer',
          fontFamily: 'var(--font-body)',
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%',
          transition: 'all var(--t-base) var(--ease-snappy)',
        }}
      >
        {isLoading ? '⏳ Loading...' : '↑ Upload FIT (multiple files allowed)'}
        <input ref={inputRef} type="file" accept=".fit" multiple style={{ display: 'none' }}
          onChange={e => {
            const fitFiles = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.fit'));
            if (fitFiles.length === 1) onFile(fitFiles[0]);
            else if (fitFiles.length > 1) onBulk(fitFiles);
            e.target.value = '';
          }} />
      </button>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border-mid)'}`,
        borderRadius: 'var(--r-lg)',
        padding: 'var(--sp-10)',
        textAlign: 'center',
        cursor: isLoading ? 'wait' : 'pointer',
        transition: 'all var(--t-base) var(--ease-snappy)',
        background: drag ? 'rgba(232,168,50,0.04)' : 'transparent',
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 'var(--sp-3)' }}>📂</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 'var(--sp-2)' }}>
        {isLoading ? 'Loading...' : 'Drop a FIT file or click to choose'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
        Garmin · Wahoo · Polar · Suunto
      </div>
      <input ref={inputRef} type="file" accept=".fit" multiple style={{ display: 'none' }}
        onChange={e => {
          const fitFiles = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.fit'));
          if (fitFiles.length === 1) onFile(fitFiles[0]);
          else if (fitFiles.length > 1) onBulk(fitFiles);
          e.target.value = '';
        }} />
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function Dashboard({
  history,
  user,
  onFile,
  onSample,
  onPlans,
  onProfile,
  onGarmin,
  onStrava,
  stravaStatus,
  onSelectWorkout,
  onSignOut,
  isLoading,
  loadError,
}) {
  const [period, setPeriod] = useState(30);
  const [bulkFiles, setBulkFiles] = useState(null);

  const workouts = history.history ?? [];
  const now      = new Date();
  const cutoff   = new Date(now); cutoff.setDate(now.getDate() - period);
  const recent   = workouts.filter(w => new Date(w.date) >= cutoff);

  const isEmpty = workouts.length === 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 760, margin: '0 auto',
          padding: 'var(--sp-4) var(--sp-5)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>
              ◈ FIT ANALYZER
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              Training history
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            {onProfile && (
              <button onClick={onProfile} style={{
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
                color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>Profile</button>
            )}
            {onPlans && (
              <button onClick={onPlans} style={{
                background: 'rgba(232,168,50,0.08)',
                border: '1px solid rgba(232,168,50,0.25)',
                borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
                color: 'var(--accent)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>Plans</button>
            )}
            {onStrava && (
              <button onClick={onStrava} style={{
                background: stravaStatus === 'connected' ? 'rgba(252,76,2,0.1)' : 'var(--bg-overlay)',
                border: `1px solid ${stravaStatus === 'connected' ? 'rgba(252,76,2,0.35)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
                color: stravaStatus === 'connected' ? '#fc4c02' : 'var(--text-secondary)',
                fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>{stravaStatus === 'connected' ? '◈ Strava' : '⊕ Strava'}</button>
            )}
            {onGarmin && (
              <button onClick={onGarmin} style={{
                background: 'rgba(232,168,50,0.08)',
                border: '1px solid rgba(232,168,50,0.25)',
                borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
                color: 'var(--accent)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>⊕ Garmin</button>
            )}
            {onSignOut && (
              <button onClick={onSignOut} style={{
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
                color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>Log out</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5)' }}>

        {/* Error */}
        {loadError && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
            fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono)',
            marginBottom: 'var(--sp-4)',
          }}>
            ⚠ {loadError}
          </div>
        )}

        {isEmpty ? (
          /* ── Empty state ─────────────────────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div style={{ textAlign: 'center', padding: 'var(--sp-6) 0' }}>
              <div style={{ fontSize: 48, marginBottom: 'var(--sp-3)' }}>🚴</div>
              <div style={{ fontSize: 16, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
                No saved workouts
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Upload a FIT file from Garmin, Wahoo, Polar, or Suunto
              </div>
            </div>
            <DropZone onFile={onFile} onBulk={files => setBulkFiles(files)} isLoading={isLoading} compact={false} />
            <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            </div>
            <button onClick={onSample} style={{
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)', padding: 'var(--sp-3)',
              color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}>
              Open sample - 50 km, road cycling
            </button>
          </div>
        ) : (
          /* ── History view ────────────────────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

            {/* Period selector + stats */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {recent.length} workouts over {period} days
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[7, 14, 30, 90].map(d => (
                    <button key={d} onClick={() => setPeriod(d)} style={{
                      background: period === d ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
                      border: `1px solid ${period === d ? 'rgba(232,168,50,0.4)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--r-sm)', padding: '3px 10px',
                      color: period === d ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                    }}>{d}d</button>
                  ))}
                </div>
              </div>
              <PeriodStats workouts={recent} />
            </div>

            {/* Upload strip */}
            <DropZone onFile={onFile} onBulk={files => setBulkFiles(files)} isLoading={isLoading} compact={true} />

            {/* Workout list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {workouts.map(w => (
                <WorkoutCard
                  key={w.date}
                  w={w}
                  onSelect={onSelectWorkout}
                  onDelete={history.deleteWorkout}
                />
              ))}
            </div>

            {/* Sample link */}
            <div style={{ textAlign: 'center' }}>
              <button onClick={onSample} style={{
                background: 'none', border: 'none',
                color: 'var(--text-dim)', fontSize: 11,
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
                textDecoration: 'underline',
              }}>
                Open sample workout
              </button>
            </div>
          </div>
        )}
      </div>

      {bulkFiles && (
        <BulkUploadModal
          files={bulkFiles}
          uploadFit={history.uploadFit}
          onDone={() => {
            setBulkFiles(null);
            history.reload?.();
          }}
        />
      )}
    </div>
  );
}


