import { fmtKm, fmtDurationShort } from '../core/format.js';
/**
 * Shell.jsx
 * App shell: sticky header with workout summary + tab navigation.
 * Purely presentational — receives workout, activeTab, onTabChange, onReset.
 */


const TABS = [
  { id: 'overview', label: 'Overview'   },
  { id: 'charts',   label: 'Charts' },
  { id: 'map',       label: 'Map'     },
  { id: 'analytics', label: 'Analytics' },
  { id: 'zones',     label: 'Zones'      },
  { id: 'laps',     label: 'Laps'   },
  { id: 'chat',     label: 'Coach'  },
];

export function Shell({ workout: w, activeTab, onTabChange, onReset, onGarmin, garminStatus, onStrava, stravaStatus, showBack, onSave, saveStatus, onPDF, onProfile }) {
  if (!w) return null;
  const distanceM = w.distance ?? 0;
  const activeSec = w.duration?.active ?? 0;
  return (
    <header style={{
      position:   'sticky',
      top:        0,
      zIndex:     100,
      background: 'rgba(7,8,12,0.92)',
      borderBottom: '1px solid var(--border-subtle)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      {/* Top row */}
      <div style={{
        display:       'flex',
        justifyContent:'space-between',
        alignItems:    'flex-start',
        padding:       'var(--sp-5) var(--sp-6) 0',
      }}>
        {/* Title */}
        <div>
          <div style={{
            fontSize: 10, color: 'var(--accent)', letterSpacing: '0.18em',
            textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 4,
          }}>
            ◈ FIT ANALYZER · {w.fileName}
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 600, color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)', margin: 0, letterSpacing: '-0.025em',
          }}>
            {w.sportLabel}{w.bike ? ` — ${w.bike}` : ''}
          </h1>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
            fontFamily: 'var(--font-mono)',
          }}>
            {w.date} · {w.startTime} · {fmtKm(distanceM)} km · {fmtDurationShort(activeSec)}
          </div>
        </div>

        {/* Right cluster */}
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexShrink: 0 }}>
          {/* Plans button (moved to header action row) */}
          <button
            onClick={() => onTabChange('plan')}
            title="Open weekly plans"
            style={{
              background:   activeTab === 'plan' ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
              border:       `1px solid ${activeTab === 'plan' ? 'rgba(232,168,50,0.35)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-md)',
              padding:      'var(--sp-2) var(--sp-3)',
              color:        activeTab === 'plan' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor:       'pointer',
              fontSize:     11,
              fontWeight:   600,
              fontFamily:   'var(--font-body)',
              transition:   'all var(--t-base) var(--ease-snappy)',
              whiteSpace:   'nowrap',
            }}
          >
            Plans
          </button>
          {/* Profile button */}
          {onProfile && (
            <button
              onClick={onProfile}
              title="Open profile page"
              style={{
                background:   'var(--bg-overlay)',
                border:       '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                padding:      'var(--sp-2) var(--sp-3)',
                color:        'var(--text-secondary)',
                cursor:       'pointer',
                fontSize:     11,
                fontWeight:   600,
                fontFamily:   'var(--font-body)',
                transition:   'all var(--t-base) var(--ease-snappy)',
                whiteSpace:   'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              Profile
            </button>
          )}
          {/* PDF Report button */}
          <button
            onClick={onPDF}
            title="Download workout report (PDF)"
            style={{
              background:   'var(--bg-overlay)',
              border:       '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)',
              padding:      'var(--sp-2) var(--sp-3)',
              color:        'var(--text-secondary)',
              cursor:       'pointer',
              fontSize:     11,
              fontFamily:   'var(--font-body)',
              transition:   `all var(--t-base) var(--ease-snappy)`,
              whiteSpace:   'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            ↓ PDF
          </button>

          {/* Strava button */}
          <button
            onClick={onStrava}
            title="Import from Strava"
            style={{
              background:   stravaStatus === 'connected' ? 'rgba(252,76,2,0.1)' : 'var(--bg-overlay)',
              border:       `1px solid ${stravaStatus === 'connected' ? 'rgba(252,76,2,0.35)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-md)',
              padding:      'var(--sp-2) var(--sp-3)',
              color:        stravaStatus === 'connected' ? '#fc4c02' : 'var(--text-secondary)',
              cursor:       'pointer',
              fontSize:     11,
              fontFamily:   'var(--font-body)',
              transition:   `all var(--t-base) var(--ease-snappy)`,
              whiteSpace:   'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = stravaStatus === 'connected' ? 'rgba(252,76,2,0.35)' : 'var(--border-subtle)'; }}
          >
            {stravaStatus === 'connected' ? '◈ Strava' : '⊕ Strava'}
          </button>

          {/* Garmin Connect button */}
          <button
            onClick={onGarmin}
            title="Download from Garmin Connect"
            style={{
              background:   garminStatus === 'connected' ? 'rgba(232,168,50,0.1)' : 'var(--bg-overlay)',
              border:       `1px solid ${garminStatus === 'connected' ? 'rgba(232,168,50,0.35)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-md)',
              padding:      'var(--sp-2) var(--sp-3)',
              color:        garminStatus === 'connected' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor:       'pointer',
              fontSize:     11,
              fontFamily:   'var(--font-body)',
              transition:   `all var(--t-base) var(--ease-snappy)`,
              whiteSpace:   'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = garminStatus === 'connected' ? 'rgba(232,168,50,0.35)' : 'var(--border-subtle)'; }}
          >
            {garminStatus === 'connected' ? '◈ Garmin' : '⊕ Garmin'}
          </button>

          {/* New file button */}
          <button
            onClick={onReset}
            title={showBack ? 'Back to history' : 'Upload another file'}
            style={{
              background:   'var(--bg-overlay)',
              border:       '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)',
              padding:      'var(--sp-2) var(--sp-3)',
              color:        'var(--text-secondary)',
              cursor:       'pointer',
              fontSize:     11,
              fontFamily:   'var(--font-body)',
              transition:   `all var(--t-base) var(--ease-snappy)`,
              whiteSpace:   'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {showBack ? '← History' : '↑ New file'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <nav style={{
        display: 'flex', gap: 2,
        padding: '0 var(--sp-6)',
      }}>
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
              transition:    `all var(--t-base) var(--ease-snappy)`,
            }}
            onMouseEnter={e => { if (activeTab !== t.id) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { if (activeTab !== t.id) e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
