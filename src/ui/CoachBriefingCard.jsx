import { Card, CardLabel } from './tabs/OverviewTab.jsx';

function alertColor(text = '') {
  const t = text.toLowerCase();
  if (t.includes('fatigue') || t.includes('low') || t.includes('risk')) return '#f97316';
  return '#fbbf24';
}

export function CoachBriefingCard({ briefing, onAction, onOpenCoach, actionLoading, actionResult }) {
  if (!briefing) return null;
  const tsbText = `${briefing.tsb > 0 ? '+' : ''}${Number(briefing.tsb ?? 0).toFixed(1)}`;

  return (
    <Card>
      <CardLabel>Daily Briefing</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>Readiness:</b> {briefing.readinessScore} ({briefing.readinessLabel})
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>Weather:</b> {briefing.weatherText}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>Status:</b> {briefing.trainingStatus}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>TSB:</b> {tsbText}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--sp-3)', background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>TODAY'S SESSION</div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{briefing.todaySession}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>{briefing.why}</div>
      </div>

      {briefing.alerts?.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>ALERTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {briefing.alerts.map((a, i) => (
              <div key={i} style={{ fontSize: 11, color: alertColor(a) }}>• {a}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 'var(--sp-3)' }}>{briefing.weekSummary}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => onAction?.('analyze_ride')} style={btnStyle}>Deep Analysis</button>
        <button onClick={() => onAction?.('plan_week')} style={btnStyle}>Plan My Week</button>
        <button onClick={() => onAction?.('wearing')} style={btnStyle}>What To Wear</button>
        <button onClick={onOpenCoach} style={btnStyle}>Ask Coach</button>
      </div>

      {actionLoading && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>Running: {actionLoading}...</div>}
      {actionResult && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.55, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3)' }}>
          {actionResult}
        </div>
      )}
    </Card>
  );
}

const btnStyle = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--r-md)',
  padding: '6px 10px',
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};
