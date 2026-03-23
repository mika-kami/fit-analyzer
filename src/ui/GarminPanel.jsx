/**
 * GarminPanel.jsx — Slide-in panel for Garmin Connect integration.
 * Shows setup instructions, login form, activity list with FIT download.
 * Requires garmin_server.py on localhost:8765.
 * Props: { garmin, onClose }
 */
import { useState, useEffect } from 'react';

// ── Garmin Connect Panel ──────────────────────────────────────────────────────

function ManualLogin({ onLogin, error }) {
  const [email, setEmail] = useState('');
  const [pwd,   setPwd]   = useState('');
  const valid = email.includes('@') && pwd.length > 3;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
        placeholder="Email от Garmin Connect"
        style={{ background:'var(--bg-raised)', border:'1px solid var(--border-mid)', borderRadius:'var(--r-md)', padding:'10px 14px', color:'var(--text-primary)', fontSize:13, outline:'none', fontFamily:'var(--font-body)' }} />
      <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
        onKeyDown={e => e.key==='Enter' && valid && onLogin(email,pwd)}
        placeholder="Пароль"
        style={{ background:'var(--bg-raised)', border:'1px solid var(--border-mid)', borderRadius:'var(--r-md)', padding:'10px 14px', color:'var(--text-primary)', fontSize:13, outline:'none', fontFamily:'var(--font-body)' }} />
      {error && <div style={{ fontSize:11, color:'#ef4444', fontFamily:'var(--font-mono)' }}>⚠ {error}</div>}
      <button onClick={() => valid && onLogin(email,pwd)} disabled={!valid}
        style={{ background: valid?'rgba(232,168,50,0.15)':'var(--bg-raised)', border:`1px solid ${valid?'rgba(232,168,50,0.4)':'var(--border-mid)'}`, borderRadius:'var(--r-md)', padding:'10px 14px', color:valid?'var(--accent)':'var(--text-muted)', fontSize:13, fontWeight:600, cursor:valid?'pointer':'not-allowed', fontFamily:'var(--font-body)' }}>
        Войти
      </button>
    </div>
  );
}

export function GarminPanel({ garmin, onClose }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  const { status, serverFound, probeError, userName, activities, loadingId, error,
          probe, login, loadActivities, downloadActivity } = garmin;

  // Re-probe every time the panel opens
  useEffect(() => { probe?.(); }, []);

  const fmtDist = m => m >= 1000 ? `${(m/1000).toFixed(1)} км` : `${m} м`;
  const fmtDur  = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return `${h}:${String(m).padStart(2,'0')}`; };
  const sportIcon = t => ({cycling:'🚴',running:'🏃',swimming:'🏊',hiking:'🥾'})[t] ?? '🏅';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380, height: '100%', background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-body)',
          animation: 'slideIn 0.22s var(--ease-snappy)',
        }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Header */}
        <div style={{
          padding: 'var(--sp-5) var(--sp-5) var(--sp-4)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', marginBottom: 4 }}>
              ◈ GARMIN CONNECT
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              {status === 'connected' ? `Привет, ${userName || 'спортсмен'}` : 'Подключение к Garmin'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        {/* Server not found — show error + manual login fallback */}
        {!serverFound && status !== 'checking' && (
          <div style={{ padding: 'var(--sp-5)', flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'var(--sp-4)' }}>

            {/* Error detail */}
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 'var(--sp-2)' }}>
                Сервер не найден на localhost:8765
              </div>
              {probeError && (
                <div style={{ fontSize: 11, color: '#f87171', fontFamily: 'var(--font-mono)', marginBottom: 'var(--sp-3)' }}>
                  {probeError}
                </div>
              )}
              <div style={{
                background: 'var(--bg-raised)', borderRadius: 'var(--r-sm)',
                padding: 'var(--sp-3)', fontFamily: 'var(--font-mono)',
                fontSize: 11, color: '#a3e635', lineHeight: 2,
              }}>
                <div style={{ color: 'var(--text-muted)' }}># Запустить в терминале:</div>
                <div>python garmin_server.py</div>
              </div>
              <button
                onClick={() => probe?.()}
                style={{
                  marginTop: 'var(--sp-3)', width: '100%',
                  background: 'rgba(232,168,50,0.1)', border: '1px solid rgba(232,168,50,0.35)',
                  borderRadius: 'var(--r-md)', padding: 'var(--sp-3)',
                  color: 'var(--accent)', fontSize: 13, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}
              >
                ↺ Проверить снова
              </button>
            </div>

            {/* Manual login — show even without server detected */}
            <div style={{
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--sp-2)' }}>
                Попробовать войти напрямую
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)' }}>
                Если сервер запущен, но не обнаруживается — введите данные вручную:
              </div>
              <ManualLogin onLogin={login} error={error} />
            </div>
          </div>
        )}

        {/* Login form */}
        {serverFound && status === 'disconnected' && (
          <div style={{ padding: 'var(--sp-5)', flex:1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
              Введите данные Garmin Connect. Они передаются только на <b style={{ color: 'var(--text-secondary)' }}>localhost:8765</b> — ничего не уходит в интернет.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email от Garmin Connect"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-mid)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)' }}
              />
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && email && password && login(email, password)}
                placeholder="Пароль"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-mid)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)' }}
              />
              {error && <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>⚠ {error}</div>}
              <button
                onClick={() => email && password && login(email, password)}
                disabled={!email || !password}
                style={{
                  background: (email && password) ? 'rgba(232,168,50,0.15)' : 'var(--bg-raised)',
                  border: `1px solid ${(email && password) ? 'rgba(232,168,50,0.4)' : 'var(--border-mid)'}`,
                  borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
                  color: (email && password) ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600, cursor: (email && password) ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Войти в Garmin Connect
              </button>
            </div>
          </div>
        )}

        {/* Loading states */}
        {(status === 'checking' || status === 'loading') && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'var(--sp-3)' }}>
            <div style={{ width:28, height:28, border:'2px solid var(--border-mid)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            <div style={{ fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
              {status === 'checking' ? 'Проверяем сервер…' : 'Загружаем тренировки…'}
            </div>
          </div>
        )}

        {/* Activity list */}
        {status === 'connected' && (
          <div style={{ flex:1, overflowY:'auto', padding:'var(--sp-4) var(--sp-5)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--sp-3)' }}>
              <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                ПОСЛЕДНИЕ {activities.length} ТРЕНИРОВОК
              </div>
              <button onClick={loadActivities} style={{ background:'none', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-sm)', padding:'3px 10px', color:'var(--text-muted)', fontSize:11, cursor:'pointer' }}>
                ↻ обновить
              </button>
            </div>

            {error && <div style={{ fontSize:11, color:'#ef4444', fontFamily:'var(--font-mono)', marginBottom:'var(--sp-3)' }}>⚠ {error}</div>}

            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {activities.map(a => (
                <div
                  key={a.id}
                  style={{
                    background: loadingId === a.id ? 'rgba(232,168,50,0.08)' : 'var(--bg-overlay)',
                    border: `1px solid ${loadingId === a.id ? 'rgba(232,168,50,0.3)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    cursor: loadingId === a.id ? 'wait' : 'default',
                  }}
                >
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <span style={{ fontSize:14 }}>{sportIcon(a.sport)}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {a.name || a.sport}
                      </span>
                    </div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                      {a.date} · {fmtDist(a.distanceM)} · {fmtDur(a.durationS)}
                      {a.avgHr > 0 && ` · ♥ ${a.avgHr}`}
                    </div>
                  </div>
                  <button
                    onClick={() => downloadActivity(a.id, a.name)}
                    disabled={loadingId !== null}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--r-sm)', padding: '4px 10px',
                      color: loadingId === a.id ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 11, cursor: loadingId !== null ? 'wait' : 'pointer',
                      fontFamily: 'var(--font-mono)', flexShrink:0, marginLeft: 8,
                      transition: 'all var(--t-base) var(--ease-snappy)',
                    }}
                    onMouseEnter={e => { if(!loadingId) { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)'; }}}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-subtle)'; e.currentTarget.style.color='var(--text-secondary)'; }}
                  >
                    {loadingId === a.id ? '…' : '↓ FIT'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
