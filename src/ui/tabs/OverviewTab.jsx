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
import { computeAerobicEfficiency, computeVAM, detectClimbs } from '../../core/workoutAnalyzer.js';

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
        <MetricCard label="Distance"     value={fmtKm(w.distance)}      unit="km"     accent="var(--info)"    />
        <MetricCard label="Active time" value={fmtDurationShort(w.duration.active)} unit="" sub={`полное ${fmtDuration(w.duration.total)}`} accent="var(--accent)" />
        <MetricCard label="Wed. скорость"  value={fmtNum(w.speed.avg)}     unit="кm/h"   sub={`max ${fmtNum(w.speed.max)} кm/h`} accent="#34d399" />
        <MetricCard label="Wed. ЧСС"       value={w.heartRate.avg || '—'}  unit="уд/min" sub={`max ${w.heartRate.max}`} accent="#f87171" />
        <MetricCard label="Ascent"          value={w.elevation.ascent}     unit="m"      sub={`−${w.elevation.descent} m`} accent="var(--z3)" />
        <MetricCard label="Calories"        value={w.calories}             unit="kcal"   accent="var(--warning)" />
      </div>

      {/* Training Effect */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <TEBar label="Aerobic TE"    value={w.trainingEffect.aerobic}   color="var(--info)"    />
        <TEBar label="Anaerobic TE"  value={w.trainingEffect.anaerobic} color="var(--warning)" />
      </div>

      {/* HR Zones overview */}
      <Card>
        <CardLabel>Zones ЧСС · max {w.heartRate.max} уд/min</CardLabel>
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
            LOAD ASSESSMENT
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: w.load.color, fontFamily: 'var(--font-mono)' }}>
            {w.load.label} · восстановление {w.load.recoveryDays}+ дня
          </span>
        </div>
      )}

      {/* Recommendations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          Recommendations
        </div>
        {w.recommendations.map((r, i) => <RecCard key={i} rec={r} />)}
      </div>

      {/* ── Cycling-specific analytics ── */}
      {isCycling(w) && <CyclingAnalytics workout={w} />}
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
      {status === 'ok' ? '✓ GPX saved' : '↓ Export GPX'}
    </button>
  );
}


// ─── Cycling helpers ─────────────────────────────────────────────────────────

function isCycling(w) {
  const s = (w.sport ?? w.sportLabel ?? '').toLowerCase();
  return s.includes('cycl') || s.includes('bike') || s.includes('велос') || s.includes('ebik');
}

// ─── Cycling Analytics section ───────────────────────────────────────────────
export function CyclingAnalytics({ workout: w }) {
  const ts      = w.timeSeries ?? [];
  const ascent  = w.elevation?.ascent ?? 0;
  const vam     = computeVAM(ascent, ts);
  const effIdx  = computeAerobicEfficiency(w.speed?.avgMoving || w.speed?.avg, w.heartRate?.avg);
  const climbs  = ts.length > 10 ? detectClimbs(ts) : [];
  const hasPow  = w.power?.avg > 0;

  // Average gradient
  const distM   = w.distance ?? 0;
  const avgGrade = distM > 0 && ascent > 0
    ? parseFloat(((ascent / distM) * 100).toFixed(1))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Section header */}
      <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.12em',
                    textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
        Analytics · Велосипед
      </div>

      {/* Key cycling metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--sp-3)' }}>
        {w.cadence?.avg > 0 && (
          <MetricCard
            label="Cadence"
            value={w.cadence.avg}
            unit="rpm"
            sub={w.cadence.max ? `max ${w.cadence.max}` : undefined}
            accent="#a78bfa"
          />
        )}
        {hasPow && (
          <MetricCard
            label="Power"
            value={w.power.avg}
            unit="Tue"
            sub={`max ${w.power.max} Tue`}
            accent="#f97316"
          />
        )}
        {vam != null && (
          <MetricCard
            label="VAM"
            value={vam}
            unit="m/h"
            sub="climb speed"
            accent="#fbbf24"
          />
        )}
        {avgGrade != null && (
          <MetricCard
            label="Wed. уклон"
            value={avgGrade}
            unit="%"
            sub={`набор ${ascent} m`}
            accent="#34d399"
          />
        )}
        {effIdx != null && (
          <MetricCard
            label="Efficiency"
            value={effIdx}
            unit=""
            sub="speed/heart rate"
            accent="#60a5fa"
          />
        )}
      </div>

      {/* Power zones — if power meter data present */}
      {hasPow && <PowerSummary workout={w} />}

      {/* Climb segments */}
      {climbs.length > 0 && (
        <Card>
          <CardLabel>Climbs ({climbs.length})</CardLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {climbs.slice(0, 5).map((c, i) => (
              <ClimbRow key={i} climb={c} rank={i + 1} />
            ))}
          </div>
        </Card>
      )}

      {/* Efficiency context */}
      {effIdx != null && (
        <div style={{
          background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)',
          borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
          fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          <b style={{ color: '#60a5fa' }}>Aerobic efficiency {effIdx}</b> = средняя скорость / средний пульс × 100.
          Выше — лучше. Wedавнивай mежду похожиmи mаршрутаmи для отслеживания адаптации.
        </div>
      )}
    </div>
  );
}

function PowerSummary({ workout: w }) {
  const ts = w.timeSeries ?? [];
  // Compute power distribution from timeSeries if available
  // Otherwise just show avg/max
  return (
    <Card>
      <CardLabel>Power</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
            AVERAGE
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#f97316', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
            {w.power.avg}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tue</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
            MAX
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#ef4444', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
            {w.power.max}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tue</div>
        </div>
      </div>
    </Card>
  );
}

function ClimbRow({ climb, rank }) {
  const gradeColor = climb.avgGrade > 10 ? '#ef4444'
                   : climb.avgGrade > 7  ? '#f97316'
                   : climb.avgGrade > 4  ? '#fbbf24'
                   : '#4ade80';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '24px 1fr auto',
      gap: 'var(--sp-3)',
      alignItems: 'center',
      padding: 'var(--sp-2) 0',
      borderBottom: rank < 5 ? '1px solid var(--border-subtle)' : 'none',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: `${gradeColor}20`, border: `1px solid ${gradeColor}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 600, color: gradeColor, fontFamily: 'var(--font-mono)',
      }}>
        {rank}
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
          +{climb.ascentM} m · {climb.distKm} km
          <span style={{ marginLeft: 8, fontSize: 11, color: gradeColor, fontWeight: 600 }}>
            {climb.avgGrade}%
          </span>
          {climb.maxGrade > climb.avgGrade + 3 && (
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              max {climb.maxGrade}%
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          km {climb.startDistKm}–{climb.endDistKm}
          {climb.vam > 0 && <span style={{ marginLeft: 8, color: '#fbbf24' }}>VAM {climb.vam} m/h</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>GRADE</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: gradeColor, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
          {climb.avgGrade}%
        </div>
      </div>
    </div>
  );
}

