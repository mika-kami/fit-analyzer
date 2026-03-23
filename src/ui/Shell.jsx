import { fmtKm, fmtDurationShort } from '../core/format.js';

/**
 * Shell.jsx
 * App shell: sticky header with workout summary + tab navigation.
 * Purely presentational — receives workout, activeTab, onTabChange, onReset.
 */


const TABS = [
  { id: 'overview', label: 'Обзор'   },
  { id: 'charts',   label: 'Графики' },
  { id: 'map',      label: 'Карта'   },
  { id: 'zones',    label: 'Зоны'    },
  { id: 'plan',     label: 'План'    },
  { id: 'history',  label: 'История' },
  { id: 'chat',     label: 'Тренер'  },
];

export function Shell({ workout: w, activeTab, onTabChange, onReset, onGarmin, garminStatus, showBack }) {
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
            {w.date} · {w.startTime} · {fmtKm(w.distance)} км · {fmtDurationShort(w.duration.active)}
          </div>
        </div>

        {/* Right cluster */}
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexShrink: 0 }}>
          {/* TE badge */}
          {w.trainingEffect.aerobic > 0 && (
            <div style={{
              background:    'var(--accent-dim)',
              border:        '1px solid rgba(232,168,50,0.3)',
              borderRadius:  'var(--r-md)',
              padding:       'var(--sp-2) var(--sp-3)',
              textAlign:     'center',
            }}>
              <div style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 1 }}>TE</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-display)', lineHeight: 1, letterSpacing: '-0.03em' }}>
                {w.trainingEffect.aerobic.toFixed(1)}
              </div>
            </div>
          )}

          {/* Garmin Connect button */}
          <button
            onClick={onGarmin}
            title="Загрузить из Garmin Connect"
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
            title={showBack ? 'Вернуться к истории' : 'Загрузить другой файл'}
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
            {showBack ? '← История' : '↑ Новый файл'}
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


// ────────────────────────────────────────────────────────────