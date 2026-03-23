/**
 * OverviewTab.jsx — Primary metrics, training effect, HR zones overview, recommendations.
 * Also exports: Card, CardLabel (shared helpers used by other tabs).
 * Props: { workout }
 */
import { useState, useEffect } from 'react';
import { MetricCard }                                     from '../MetricCard.jsx';
import { ZoneBar }                                       from '../ZoneBar.jsx';
import { fmtKm, fmtDuration, fmtDurationShort, fmtNum } from '../../core/format.js';
import { downloadGPX } from '../../core/gpxExport.js';

// ─── Shared card wrapper ─────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return (
    <div style={{
      background:    'var(--bg-overlay)',
      border:        '1px solid var(--border-subtle)',
      borderRadius:  'var(--r-lg)',
      padding:       'var(--sp-5)',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function CardLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em',
      textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 'var(--sp-4)',
    }}>
      {children}
    </div>
  );
}

// ─── Training Effect bar ─────────────────────────────────────────────────────
export function TEBar({ label, value, color }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW((value / 5) * 100), 300); return () => clearTimeout(t); }, [value]);
  return (
    <Card>
      <CardLabel>{label}</CardLabel>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 'var(--sp-3)' }}>
        <span style={{ fontSize: 42, fontWeight: 600, color, fontFamily: 'var(--font-display)', lineHeight: 1, letterSpacing: '-0.04em' }}>
          {value.toFixed(1)}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>/5</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg-raised)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${w}%`,
          background: `linear-gradient(90deg, ${color}80, ${color})`,
          borderRadius: 2, transition: 'width 0.8s var(--ease-snappy)',
          boxShadow: `0 0 8px ${color}40`,
        }} />
      </div>
    </Card>
  );
}

// ─── Recommendation card ─────────────────────────────────────────────────────
export function RecCard({ rec }) {
  const borderColor = { warning: 'rgba(249,115,22,0.2)', info: 'rgba(96,165,250,0.2)', success: 'rgba(74,222,128,0.2)' }[rec.type] ?? 'var(--border-subtle)';
  const bgColor     = { warning: 'rgba(249,115,22,0.05)', info: 'rgba(96,165,250,0.05)', success: 'rgba(74,222,128,0.05)' }[rec.type] ?? 'var(--bg-overlay)';
  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-3)' }}>
      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{rec.icon}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{rec.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{rec.text}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Overview
// ═══════════════════════════════════════════════════════════════════════════════
export function OverviewTab({ workout: w }) {
  const [zonesReady, setZonesReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setZonesReady(true), 200); return () => clearTimeout(t); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Primary metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--sp-3)' }}>
        <MetricCard label="Дистанция"     value={fmtKm(w.distance)}      unit="км"     accent="var(--info)"    />
        <MetricCard label="Активн. время" value={fmtDurationShort(w.duration.active)} unit="" sub={`полное ${fmtDuration(w.duration.total)}`} accent="var(--accent)" />
        <MetricCard label="Ср. скорость"  value={fmtNum(w.speed.avg)}     unit="км/ч"   sub={`макс ${fmtNum(w.speed.max)} км/ч`} accent="#34d399" />
        <MetricCard label="Ср. ЧСС"       value={w.heartRate.avg || '—'}  unit="уд/мин" sub={`макс ${w.heartRate.max}`} accent="#f87171" />
        <MetricCard label="Набор"          value={w.elevation.ascent}     unit="м"      sub={`−${w.elevation.descent} м`} accent="var(--z3)" />
        <MetricCard label="Калории"        value={w.calories}             unit="ккал"   accent="var(--warning)" />
      </div>

      {/* Training Effect */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <TEBar label="Аэробный ТЭ"    value={w.trainingEffect.aerobic}   color="var(--info)"    />
        <TEBar label="Анаэробный ТЭ"  value={w.trainingEffect.anaerobic} color="var(--warning)" />
      </div>

      {/* HR Zones overview */}
      <Card>
        <CardLabel>Зоны ЧСС · макс {w.heartRate.max} уд/мин</CardLabel>
        {w.hrZones.map(z => <ZoneBar key={z.id} zone={z} animate={zonesReady} />)}
      </Card>

      {/* Load badge */}
      {w.load && (
        <div style={{
          background: `${w.load.color}10`,
          border:     `1px solid ${w.load.color}30`,
          borderRadius: 'var(--r-md)',
          padding:    'var(--sp-3) var(--sp-4)',
          display:    'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            ОЦЕНКА НАГРУЗКИ
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: w.load.color, fontFamily: 'var(--font-mono)' }}>
            {w.load.label} · восстановление {w.load.recoveryDays}+ дня
          </span>
        </div>
      )}

      {/* Recommendations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          Рекомендации
        </div>
        {w.recommendations.map((r, i) => <RecCard key={i} rec={r} />)}
      </div>
    </div>
  );
}

export function OverviewGPXButton({ workout }) {
  const [status, setStatus] = useState(null);
  return (
    <button
      onClick={() => {
        try { downloadGPX(workout); setStatus('ok'); }
        catch { setStatus('err'); }
        setTimeout(() => setStatus(null), 2500);
      }}
      style={{
        background: status === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(232,168,50,0.08)',
        border: `1px solid ${status === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(232,168,50,0.25)'}`,
        borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-4)',
        color: status === 'ok' ? '#4ade80' : 'var(--accent)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'var(--font-body)', width: '100%',
        transition: 'all var(--t-base) var(--ease-snappy)',
      }}
    >
      {status === 'ok' ? '✓ GPX сохранён' : '↓ Экспорт GPX'}
    </button>
  );
}
