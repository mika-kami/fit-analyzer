import ReactMarkdown from 'react-markdown';
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

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 'var(--sp-3)' }}>
        <ReactMarkdown components={mdComponents}>{briefing.weekSummary}</ReactMarkdown>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => onAction?.('analyze_ride')} style={btnStyle}>Deep Analysis</button>
        <button onClick={() => onAction?.('plan_week')} style={btnStyle}>Weekly Plan Details</button>
        <button onClick={() => onAction?.('wearing')} style={btnStyle}>What To Wear</button>
        <button onClick={onOpenCoach} style={btnStyle}>Ask Coach</button>
      </div>

      {actionLoading && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>Running: {actionLoading}...</div>
      )}
      {actionResult && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.55, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-3)' }}>
          <ReactMarkdown components={mdComponents}>{actionResult}</ReactMarkdown>
        </div>
      )}
    </Card>
  );
}

const mdComponents = {
  p: ({ children }) => <p style={{ margin: '0 0 4px', lineHeight: 1.55 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: 'var(--text-secondary)' }}>{children}</em>,
  code: ({ inline, children }) =>
    inline ? (
      <code style={{ background: 'var(--bg-overlay)', borderRadius: 3, padding: '1px 4px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{children}</code>
    ) : (
      <pre style={{ background: 'var(--bg-overlay)', borderRadius: 6, padding: '8px 10px', overflowX: 'auto', margin: '4px 0' }}>
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{children}</code>
      </pre>
    ),
  h3: ({ children }) => <h3 style={{ fontSize: 11, fontWeight: 700, margin: '6px 0 2px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 8, margin: '4px 0', color: 'var(--text-secondary)' }}>{children}</blockquote>
  ),
};

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