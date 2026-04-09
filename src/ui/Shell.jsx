import { fmtKm, fmtDurationShort } from '../core/format.js';

/**
 * Shell.jsx
 * Exports:
 *   AppHeader  — shared sticky header used on both dashboard and detail screens
 *   Shell      — detail-screen wrapper: AppHeader + tab bar
 */

const TABS = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'charts',    label: 'Charts'    },
  { id: 'map',       label: 'Map'       },
  { id: 'analytics', label: 'Analytics' },
  { id: 'zones',     label: 'Zones'     },
  { id: 'laps',      label: 'Laps'      },
];

// ── Shared button style helpers ───────────────────────────────────────────────
function btnBase(extra = {}) {
  return {
    background:   'var(--bg-overlay)',
    border:       '1px solid var(--border-subtle)',
    borderRadius: 'var(--r-md)',
    padding:      'var(--sp-2) var(--sp-3)',
    color:        'var(--text-secondary)',
    cursor:       'pointer',
    fontSize:     11,
    fontFamily:   'var(--font-body)',
    transition:   'all var(--t-base) var(--ease-snappy)',
    whiteSpace:   'nowrap',
    ...extra,
  };
}

function Btn({ onClick, title, active, accent, children, style: extraStyle }) {
  const bg   = accent ? `rgba(232,168,50,${active ? '0.15' : '0.08'})` : active ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)';
  const bdr  = accent ? `rgba(232,168,50,${active ? '0.5' : '0.3'})` : active ? 'rgba(232,168,50,0.35)' : 'var(--border-subtle)';
  const clr  = accent || active ? 'var(--accent)' : 'var(--text-secondary)';
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ ...btnBase({ background: bg, border: `1px solid ${bdr}`, color: clr }), ...extraStyle }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = active || accent ? bdr : 'var(--border-mid)';
        e.currentTarget.style.color = active || accent ? 'var(--accent)' : 'var(--text-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = bdr;
        e.currentTarget.style.color = clr;
      }}
    >
      {children}
    </button>
  );
}

// ── AppHeader ─────────────────────────────────────────────────────────────────
/**
 * Shared header shell used by Dashboard (history) and Shell (detail).
 *
 * Props:
 *   title        string          — main heading (e.g. "Training history" or sport name)
 *   subtitle     string | null   — secondary line below title (e.g. date + distance)
 *   eyebrow      string | null   — small label above title (defaults to "◈ FIT ANALYZER")
 *   onProfile    fn | null
 *   onGarmin     fn | null
 *   garminStatus string | null   — 'connected' | other
 *   onStrava     fn | null
 *   stravaStatus string | null   — 'connected' | other
 *   onReset      fn | null       — back / new file button
 *   resetLabel   string | null   — label for reset button
 *   onSave       fn | null       — save button (detail only)
 *   saveStatus   string | null   — null | 'saving' | 'saved'
 *   onPDF        fn | null
 *   onSignOut    fn | null
 *   children                     — rendered below the top row (e.g. tab bar)
 */
export function AppHeader({
  title,
  subtitle,
  eyebrow,
  onProfile,
  onGarmin,
  garminStatus,
  onStrava,
  stravaStatus,
  onReset,
  resetLabel,
  onSave,
  saveStatus,
  onPDF,
  onSignOut,
  children,
}) {
  return (
    <header style={{
      position:            'sticky',
      top:                 0,
      zIndex:              100,
      background:          'rgba(7,8,12,0.92)',
      borderBottom:        '1px solid var(--border-subtle)',
      backdropFilter:      'blur(12px)',
      WebkitBackdropFilter:'blur(12px)',
    }}>
      {/* Top row */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        padding:        'var(--sp-4) var(--sp-6)',
        gap:            'var(--sp-4)',
      }}>
        {/* Left: branding + title */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10, color: 'var(--accent)', letterSpacing: '0.18em',
            textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 2,
          }}>
            {eyebrow ?? '◈ FIT ANALYZER'}
          </div>
          <div style={{
            fontSize: 18, fontWeight: 600, color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {onProfile && (
            <Btn onClick={onProfile} title="Open profile">Profile</Btn>
          )}

          {onPDF && (
            <Btn onClick={onPDF} title="Download PDF report">↓ PDF</Btn>
          )}

          {onSave && (
            <button
              onClick={onSave}
              disabled={saveStatus === 'saving'}
              style={btnBase({
                background: saveStatus === 'saved'
                  ? 'rgba(74,222,128,0.12)'
                  : 'rgba(232,168,50,0.08)',
                border: `1px solid ${saveStatus === 'saved'
                  ? 'rgba(74,222,128,0.35)'
                  : 'rgba(232,168,50,0.3)'}`,
                color: saveStatus === 'saved' ? '#4ade80' : 'var(--accent)',
                cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
              })}
            >
              {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : '↓ Save'}
            </button>
          )}

          {onStrava && (
            <button
              onClick={onStrava}
              title="Import from Strava"
              style={btnBase({
                background: stravaStatus === 'connected' ? 'rgba(252,76,2,0.1)' : 'var(--bg-overlay)',
                border: `1px solid ${stravaStatus === 'connected' ? 'rgba(252,76,2,0.35)' : 'var(--border-subtle)'}`,
                color: stravaStatus === 'connected' ? '#fc4c02' : 'var(--text-secondary)',
              })}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = stravaStatus === 'connected' ? 'rgba(252,76,2,0.35)' : 'var(--border-subtle)'; }}
            >
              {stravaStatus === 'connected' ? '◈ Strava' : '⊕ Strava'}
            </button>
          )}

          {onGarmin && (
            <button
              onClick={onGarmin}
              title="Sync from Garmin Connect"
              style={btnBase({
                background: garminStatus === 'connected' ? 'rgba(232,168,50,0.1)' : 'var(--bg-overlay)',
                border: `1px solid ${garminStatus === 'connected' ? 'rgba(232,168,50,0.35)' : 'var(--border-subtle)'}`,
                color: garminStatus === 'connected' ? 'var(--accent)' : 'var(--text-secondary)',
              })}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = garminStatus === 'connected' ? 'rgba(232,168,50,0.35)' : 'var(--border-subtle)'; }}
            >
              {garminStatus === 'connected' ? '◈ Garmin' : '⊕ Garmin'}
            </button>
          )}

          {onReset && (
            <Btn onClick={onReset} title={resetLabel ?? 'Back'}>
              {resetLabel ?? '← Back'}
            </Btn>
          )}

          {onSignOut && (
            <button
              onClick={onSignOut}
              style={btnBase({ color: 'var(--text-dim)' })}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
            >
              Log out
            </button>
          )}
        </div>
      </div>

      {/* Slot for tab bar or other sub-content */}
      {children}
    </header>
  );
}

// ── Shell (detail view) ───────────────────────────────────────────────────────
export function Shell({
  workout: w,
  activeTab,
  onTabChange,
  onReset,
  onGarmin,
  garminStatus,
  onStrava,
  stravaStatus,
  onSave,
  saveStatus,
  onPDF,
  onProfile,
}) {
  if (!w) return null;

  const title    = `${w.sportLabel}${w.bike ? ` — ${w.bike}` : ''}`;
  const subtitle = `${w.date}${w.startTime ? ' · ' + w.startTime : ''} · ${fmtKm(w.distance ?? 0)} km · ${fmtDurationShort(w.duration?.active ?? 0)}`;
  const eyebrow  = `◈ FIT ANALYZER · ${w.fileName}`;

  return (
    <AppHeader
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      onProfile={onProfile}
      onGarmin={onGarmin}
      garminStatus={garminStatus}
      onStrava={onStrava}
      stravaStatus={stravaStatus}
      onReset={onReset}
      resetLabel="← History"
      onSave={onSave}
      saveStatus={saveStatus}
      onPDF={onPDF}
    >
      {/* Tab bar */}
      <nav style={{ display: 'flex', gap: 2, padding: '0 var(--sp-6)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              background:    'none',
              border:        'none',
              padding:       'var(--sp-3) var(--sp-4)',
              cursor:        'pointer',
              color:         activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize:      12,
              fontWeight:    activeTab === t.id ? 600 : 400,
              fontFamily:    'var(--font-mono)',
              letterSpacing: '0.04em',
              borderBottom:  activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              transition:    'all var(--t-base) var(--ease-snappy)',
            }}
            onMouseEnter={e => { if (activeTab !== t.id) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { if (activeTab !== t.id) e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </AppHeader>
  );
}