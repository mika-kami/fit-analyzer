import { useState, useEffect } from 'react';

/**
 * MetricCard.jsx
 * Atomic display card for a single numeric metric.
 * Purely presentational — receives formatted strings.
 */

export function MetricCard({ label, value, unit, sub, accent }) {
  return (
    <div style={{
      background:    'var(--bg-overlay)',
      border:        '1px solid var(--border-subtle)',
      borderRadius:  'var(--r-lg)',
      padding:       'var(--sp-5) var(--sp-5)',
      display:       'flex',
      flexDirection: 'column',
      gap:           'var(--sp-1)',
      transition:    `border-color var(--t-base) var(--ease-snappy)`,
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-mid)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
    >
      <span style={{
        fontSize:      10,
        color:         'var(--text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontFamily:    'var(--font-mono)',
      }}>
        {label}
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, lineHeight: 1 }}>
        <span style={{
          fontSize:   30,
          fontWeight: 600,
          color:      accent || 'var(--text-primary)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.02em',
        }}>
          {value}
        </span>
        {unit && (
          <span style={{
            fontSize:  13,
            color:     'var(--text-secondary)',
            fontFamily:'var(--font-mono)',
          }}>
            {unit}
          </span>
        )}
      </div>

      {sub && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {sub}
        </span>
      )}
    </div>
  );
}


// ────────────────────────────────────────────────────────────