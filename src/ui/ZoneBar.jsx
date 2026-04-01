import { useState, useEffect } from 'react';

/**
 * ZoneBar.jsx
 * Animated horizontal bar showing a single HR zone's share.
 * Uses CSS transition — no JS animation library needed.
 */


export function ZoneBar({ zone, animate = true, showHr = false }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!animate) { setWidth(zone.pct); return; }
    // Stagger by zone index (z1..z5) for a cascade effect
    const zNum = parseInt(zone.id.slice(1), 10) || 1;
    const delay = 80 + zNum * 120;
    const t = setTimeout(() => setWidth(zone.pct), delay);
    return () => clearTimeout(t);
  }, [animate, zone.pct, zone.id]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      {/* Zone label */}
      <span style={{
        width: 22, fontSize: 10, color: zone.color,
        fontFamily: 'var(--font-mono)', textAlign: 'right', flexShrink: 0,
      }}>
        {zone.id.toUpperCase()}
      </span>

      {/* Track */}
      <div style={{
        flex: 1, height: 6, background: 'var(--bg-raised)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${width}%`,
          background: zone.color,
          borderRadius: 3,
          transition: `width 0.7s var(--ease-snappy)`,
          boxShadow: `0 0 8px ${zone.color}50`,
        }} />
      </div>

      {/* Minutes */}
      <span style={{
        width: 48, fontSize: 11, color: zone.color,
        fontFamily: 'var(--font-mono)', textAlign: 'right', flexShrink: 0,
      }}>
        {zone.minutes}min
      </span>

      {/* Percentage */}
      <span style={{
        width: 36, fontSize: 10, color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)', flexShrink: 0,
      }}>
        {zone.pct.toFixed(0)}%
      </span>

      {/* HR range (optional) */}
      {showHr && (
        <span style={{
          width: 70, fontSize: 10, color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)', flexShrink: 0,
        }}>
          {zone.hrLo}–{zone.hrHi}
        </span>
      )}
    </div>
  );
}


// ────────────────────────────────────────────────────────────

