/**
 * ChartsTab.jsx — Time-series charts: HR, speed, altitude, cadence.
 * Props: { workout }
 */
import { TimeSeriesChart } from '../TimeSeriesChart.jsx';
import { Card, CardLabel }  from './OverviewTab.jsx';

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Charts
// ═══════════════════════════════════════════════════════════════════════════════
export function ChartsTab({ workout: w }) {
  const ts = w.timeSeries ?? [];

  if (!ts.length) return (
    <div style={{ textAlign:'center', padding:'var(--sp-8)', color:'var(--text-muted)', background:'var(--bg-overlay)', borderRadius:'var(--r-lg)', border:'1px solid var(--border-subtle)' }}>
      <div style={{ fontSize:32, marginBottom:'var(--sp-3)' }}>📊</div>
      <div style={{ fontSize:13 }}>Загрузите FIT файл для просмотра графиков</div>
    </div>
  );

  const charts = [
    { key: 'hr',       label: 'Пульс',    unit: 'уд/мин', color: '#ef4444' },
    { key: 'speedKmh', label: 'Скорость', unit: 'км/ч',   color: '#60a5fa' },
    { key: 'altitude', label: 'Высота',   unit: 'м',       color: '#fbbf24' },
    ...(ts.some(p => p.cadence) ? [{ key: 'cadence', label: 'Каданс', unit: 'об/мин', color: '#a78bfa' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {charts.map(c => (
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
    </div>
  );
}
