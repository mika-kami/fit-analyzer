/**
 * ChartsTab.jsx — Time-series charts: HR, speed, altitude, cadence.
 * For cycling activities: adds gradient and power charts.
 * Props: { workout }
 */
import { useMemo }                          from 'react';
import { TimeSeriesChart }                  from '../TimeSeriesChart.jsx';
import { Card, CardLabel }                  from './OverviewTab.jsx';
import { computeGradientSeries }            from '../../core/workoutAnalyzer.js';

function isCycling(w) {
  const s = (w.sport ?? w.sportLabel ?? '').toLowerCase();
  return s.includes('cycl') || s.includes('bike') || s.includes('велос') || s.includes('ebik');
}

export function ChartsTab({ workout: w }) {
  const ts       = w.timeSeries ?? [];
  const cycling  = isCycling(w);

  // Gradient series — computed from altitude + distance
  const gradientSeries = useMemo(() => {
    if (!cycling) return [];
    return computeGradientSeries(ts);
  }, [ts, cycling]);

  if (!ts.length) return (
    <div style={{ textAlign:'center', padding:'var(--sp-8)', color:'var(--text-muted)',
                  background:'var(--bg-overlay)', borderRadius:'var(--r-lg)',
                  border:'1px solid var(--border-subtle)' }}>
      <div style={{ fontSize:32, marginBottom:'var(--sp-3)' }}>📊</div>
      <div style={{ fontSize:13 }}>Нет данных для графиков</div>
    </div>
  );

  const baseCharts = [
    { key: 'hr',       label: 'Пульс',    unit: 'уд/мин', color: '#ef4444' },
    { key: 'speedKmh', label: 'Скорость', unit: 'км/ч',   color: '#60a5fa' },
    { key: 'altitude', label: 'Высота',   unit: 'м',       color: '#fbbf24' },
    ...(ts.some(p => p.cadence) ? [{ key: 'cadence', label: 'Каданс', unit: 'об/мин', color: '#a78bfa' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Standard charts */}
      {baseCharts.map(c => (
        <Card key={c.key} style={{ padding: 'var(--sp-4) var(--sp-3) var(--sp-3)' }}>
          <CardLabel>{c.label} ({c.unit})</CardLabel>
          <TimeSeriesChart
            data={ts}
            dataKey={c.key}
            color={c.color}
            unit={c.unit}
            height={130}
          />
        </Card>
      ))}

      {/* Power chart — cycling with power meter */}
      {cycling && ts.some(p => p.power != null) && (
        <Card style={{ padding: 'var(--sp-4) var(--sp-3) var(--sp-3)' }}>
          <CardLabel>Мощность (Вт)</CardLabel>
          <TimeSeriesChart
            data={ts}
            dataKey="power"
            color="#f97316"
            unit="Вт"
            height={130}
          />
        </Card>
      )}

      {/* Gradient chart — cycling only, needs altitude + distance data */}
      {cycling && gradientSeries.length > 10 && (
        <Card style={{ padding: 'var(--sp-4) var(--sp-3) var(--sp-3)' }}>
          <CardLabel>Уклон (%) · по дистанции</CardLabel>
          <GradientChart data={gradientSeries} height={140} />
        </Card>
      )}
    </div>
  );
}

// ─── Gradient bar chart (distance on X, gradient on Y) ───────────────────────
function GradientChart({ data, height = 140 }) {
  if (!data.length) return null;

  const maxG  = Math.max(...data.map(d => Math.abs(d.gradient)), 5);
  const maxDist = data[data.length - 1]?.distKm ?? 1;

  // Render as a series of thin SVG bars coloured by gradient
  const W = 100; // percentage width
  const H = height;
  const MID = H / 2; // zero line

  const bars = data.map((pt, i) => {
    const x    = (pt.distKm / maxDist) * W;
    const next = data[i + 1];
    const w    = next ? Math.max(0.1, ((next.distKm - pt.distKm) / maxDist) * W) : 0.5;
    const g    = pt.gradient;
    const barH = Math.abs(g / maxG) * (H * 0.45);
    const y    = g >= 0 ? MID - barH : MID;
    const color = g > 12 ? '#7f1d1d'
                : g > 8  ? '#ef4444'
                : g > 5  ? '#f97316'
                : g > 2  ? '#fbbf24'
                : g > 0  ? '#4ade80'
                : g < -5 ? '#60a5fa'
                : '#94a3b8';
    return { x, w, y, barH: barH || 1, color, g, distKm: pt.distKm };
  });

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
      >
        {/* Zero line */}
        <line x1="0" y1={MID} x2="100" y2={MID}
          stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" />
        {/* Gradient bars */}
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={Math.max(b.w, 0.15)} height={b.barH}
            fill={b.color} opacity="0.85" />
        ))}
      </svg>
      {/* Legend */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8,
        fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
      }}>
        {[
          { color: '#4ade80', label: '0–2%' },
          { color: '#fbbf24', label: '2–5%' },
          { color: '#f97316', label: '5–8%' },
          { color: '#ef4444', label: '8–12%' },
          { color: '#7f1d1d', label: '>12%' },
          { color: '#60a5fa', label: 'спуск' },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 8, background: l.color, borderRadius: 2, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}