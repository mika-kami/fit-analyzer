/**
 * LapsTab.jsx — Per-lap breakdown from FIT data.
 * Props: { workout }
 */

function fmtTime(seconds) {
  if (!seconds) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function fmtPace(seconds, meters) {
  if (!seconds || !meters || meters < 10) return '—';
  const secPer1k = (seconds / meters) * 1000;
  const m = Math.floor(secPer1k / 60);
  const s = Math.round(secPer1k % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtDist(meters) {
  if (meters == null) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} км`;
  return `${Math.round(meters)} м`;
}

const TH = ({ children, align = 'right' }) => (
  <th style={{
    padding: '6px 10px', fontSize: 10, fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    textAlign: align, fontWeight: 500, borderBottom: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  }}>{children}</th>
);

const TD = ({ children, highlight, color }) => (
  <td style={{
    padding: '8px 10px', fontSize: 12, fontFamily: 'var(--font-mono)',
    color: color ?? (highlight ? 'var(--text-primary)' : 'var(--text-secondary)'),
    textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.03)',
  }}>{children}</td>
);

export function LapsTab({ workout: w }) {
  const laps = w.laps ?? [];

  if (laps.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)', padding: 'var(--sp-8)',
        textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
      }}>
        Данные о кругах недоступны для этой активности
      </div>
    );
  }

  // Find best lap (shortest pace) for highlighting
  const bestIdx = laps.reduce((bi, lap, i) => {
    const paceI  = lap.timer && lap.distance ? lap.timer / lap.distance : Infinity;
    const paceBi = laps[bi].timer && laps[bi].distance ? laps[bi].timer / laps[bi].distance : Infinity;
    return paceI < paceBi ? i : bi;
  }, 0);

  const hasAscent = laps.some(l => l.ascent > 0);
  const hasCalories = laps.some(l => l.calories > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Summary strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)',
      }}>
        {[
          { label: 'Кругов', value: laps.length },
          { label: 'Лучший круг', value: fmtTime(laps[bestIdx]?.timer) },
          { label: 'Ср. темп', value: (() => {
            const totalTimer = laps.reduce((s, l) => s + (l.timer ?? 0), 0);
            const totalDist  = laps.reduce((s, l) => s + (l.distance ?? 0), 0);
            return fmtPace(totalTimer, totalDist);
          })() + ' /км' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {item.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <TH align="left">#</TH>
              <TH>Время</TH>
              <TH>Дистанция</TH>
              <TH>Темп</TH>
              {hasAscent   && <TH>Набор</TH>}
              {hasCalories && <TH>Ккал</TH>}
            </tr>
          </thead>
          <tbody>
            {laps.map((lap, i) => {
              const isBest = i === bestIdx && laps.length > 1;
              return (
                <tr key={i} style={{ background: isBest ? 'rgba(232,168,50,0.04)' : 'transparent' }}>
                  <td style={{
                    padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: isBest ? 'var(--accent)' : 'var(--text-muted)',
                    textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.03)',
                    fontWeight: isBest ? 600 : 400,
                  }}>
                    {isBest ? '★' : lap.n}
                  </td>
                  <TD highlight>{fmtTime(lap.timer ?? lap.elapsed)}</TD>
                  <TD>{fmtDist(lap.distance)}</TD>
                  <TD color={isBest ? 'var(--accent)' : undefined}>
                    {fmtPace(lap.timer ?? lap.elapsed, lap.distance)} /км
                  </TD>
                  {hasAscent   && <TD>{lap.ascent  > 0 ? `+${Math.round(lap.ascent)} м` : '—'}</TD>}
                  {hasCalories && <TD>{lap.calories > 0 ? lap.calories : '—'}</TD>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
