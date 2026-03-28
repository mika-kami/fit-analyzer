/**
 * GarminPanel.jsx — Garmin Connect sync panel.
 * Props: { garmin, onClose }
 */
import { useState, useEffect } from 'react';

const FILTER_LABELS = {
  all:       'Все',
  cycling:   'Велосипед 🚴',
  running:   'Бег 🏃',
  swimming:  'Плавание 🏊',
  hiking:    'Хайкинг 🥾',
  walking:   'Ходьба 🚶',
};

export function GarminPanel({ garmin, onClose }) {
  const {
    serverFound, probeError, syncing, step, message, error, filters,
    probe, syncActivities,
  } = garmin;

  const knownIds      = garmin.knownGarminIds ?? [];
  const [filter, setFilter] = useState('all');

  useEffect(() => { probe?.(); }, []);

  return (
    <div
      style={{
        position:'fixed', inset:0, zIndex:200,
        background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)',
        display:'flex', justifyContent:'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:380, height:'100%', background:'var(--bg-surface)',
          borderLeft:'1px solid var(--border-subtle)',
          display:'flex', flexDirection:'column',
          fontFamily:'var(--font-body)',
          animation:'slideIn 0.22s var(--ease-snappy)',
        }}
      >
        {/* Header */}
        <div style={{
          padding:'var(--sp-5) var(--sp-5) var(--sp-4)',
          borderBottom:'1px solid var(--border-subtle)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div>
            <div style={{ fontSize:10, color:'var(--accent)', fontFamily:'var(--font-mono)',
                          letterSpacing:'0.12em', marginBottom:4 }}>
              ◈ GARMIN CONNECT
            </div>
            <div style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)' }}>
              Синхронизация тренировок
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'var(--text-muted)', fontSize:20, cursor:'pointer' }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'var(--sp-5)',
                      display:'flex', flexDirection:'column', gap:'var(--sp-4)' }}>

          {/* Server not found */}
          {!serverFound && (
            <div style={{
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)',
              borderRadius:'var(--r-md)', padding:'var(--sp-4)',
            }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#ef4444', marginBottom:6 }}>
                Сервер не найден на localhost:8765
              </div>
              {probeError && (
                <div style={{ fontSize:11, color:'#f87171', fontFamily:'var(--font-mono)',
                              marginBottom:'var(--sp-3)' }}>{probeError}</div>
              )}
              <div style={{
                background:'var(--bg-raised)', borderRadius:'var(--r-sm)',
                padding:'var(--sp-3)', fontFamily:'var(--font-mono)',
                fontSize:11, color:'#a3e635', lineHeight:2,
              }}>
                <div style={{ color:'var(--text-muted)' }}># Запустить в терминале:</div>
                <div>python garmin_server.py</div>
              </div>
              <button onClick={probe} style={{
                marginTop:'var(--sp-3)', width:'100%',
                background:'rgba(232,168,50,0.1)', border:'1px solid rgba(232,168,50,0.35)',
                borderRadius:'var(--r-md)', padding:'var(--sp-3)',
                color:'var(--accent)', fontSize:13, cursor:'pointer',
                fontFamily:'var(--font-body)',
              }}>↺ Проверить снова</button>
            </div>
          )}

          {/* Filter selector */}
          {serverFound && filters.length > 0 && (
            <div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)',
                            letterSpacing:'0.08em', marginBottom:'var(--sp-2)' }}>
                ТИП АКТИВНОСТИ
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--sp-2)' }}>
                {filters.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    disabled={syncing}
                    style={{
                      padding:'var(--sp-2) var(--sp-3)',
                      background: filter === f
                        ? 'rgba(232,168,50,0.15)' : 'var(--bg-raised)',
                      border: `1px solid ${filter === f
                        ? 'rgba(232,168,50,0.5)' : 'var(--border-subtle)'}`,
                      borderRadius:'var(--r-md)',
                      color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize:12,
                      cursor: syncing ? 'default' : 'pointer',
                      fontFamily:'var(--font-body)',
                      transition:'all var(--t-base) var(--ease-snappy)',
                    }}
                  >
                    {FILTER_LABELS[f] ?? f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* How it works — shown before first sync */}
          {serverFound && !syncing && !message && (
            <div style={{
              background:'rgba(232,168,50,0.06)',
              border:'1px solid rgba(232,168,50,0.2)',
              borderRadius:'var(--r-md)', padding:'var(--sp-4)',
            }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--accent)', marginBottom:6 }}>
                Как это работает
              </div>
              <div style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.8 }}>
                Нажми кнопку. Откроется браузер Garmin Connect.<br/>
                Войди в аккаунт (если потребуется).<br/>
                Приложение само скачает новые тренировки.<br/>
                Окно закроется, данные сохранятся в историю.
              </div>
            </div>
          )}

          {/* Sync button */}
          {serverFound && (
            <button
              onClick={() => syncActivities(knownIds, filter)}
              disabled={syncing}
              style={{
                padding:'var(--sp-4)',
                background: syncing ? 'var(--bg-raised)' : 'rgba(232,168,50,0.12)',
                border: `1px solid ${syncing ? 'var(--border-mid)' : 'rgba(232,168,50,0.4)'}`,
                borderRadius:'var(--r-md)',
                color: syncing ? 'var(--text-muted)' : 'var(--accent)',
                fontSize:14, fontWeight:600,
                cursor: syncing ? 'wait' : 'pointer',
                fontFamily:'var(--font-body)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              }}
            >
              {syncing
                ? <><Spinner /> {step || 'Синхронизация…'}</>
                : <>↓ Синхронизировать{filter !== 'all' ? ` (${FILTER_LABELS[filter] ?? filter})` : ''}</>
              }
            </button>
          )}

          {/* Progress steps */}
          {syncing && (
            <div style={{
              background:'var(--bg-raised)', borderRadius:'var(--r-md)',
              padding:'var(--sp-3) var(--sp-4)',
              fontSize:11, color:'var(--text-secondary)',
              fontFamily:'var(--font-mono)', lineHeight:2,
            }}>
              <StepRow done={true}  text="Открываем браузер" />
              <StepRow
                done={step.includes('список') || step.includes('Скач') || step.includes('Сохран')}
                active={step.includes('Garmin')}
                text="Garmin Connect" />
              <StepRow
                done={step.includes('Скач') || step.includes('Сохран')}
                active={step.includes('список')}
                text="Список тренировок" />
              <StepRow
                done={step.includes('Сохран')}
                active={step.includes('Скач')}
                text="Скачиваем FIT-файлы" />
              <StepRow
                done={false}
                active={step.includes('Сохран')}
                text="Сохраняем в историю" />
            </div>
          )}

          {/* Result */}
          {message && !syncing && (
            <div style={{
              background: message.includes('No new')
                ? 'var(--bg-overlay)' : 'rgba(34,197,94,0.08)',
              border: `1px solid ${message.includes('No new')
                ? 'var(--border-subtle)' : 'rgba(34,197,94,0.3)'}`,
              borderRadius:'var(--r-md)', padding:'var(--sp-3) var(--sp-4)',
              fontSize:13, fontWeight:600, fontFamily:'var(--font-mono)',
              color: message.includes('No new') ? 'var(--text-secondary)' : '#4ade80',
            }}>
              {message.includes('No new') ? '◎ ' : '✓ '}{message}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)',
              borderRadius:'var(--r-md)', padding:'var(--sp-3) var(--sp-4)',
              fontSize:11, color:'#ef4444', fontFamily:'var(--font-mono)',
              whiteSpace:'pre-wrap', wordBreak:'break-all',
            }}>
              ✗ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width:13, height:13, flexShrink:0,
      border:'1.5px solid currentColor',
      borderTopColor:'transparent',
      borderRadius:'50%',
      animation:'spin 0.8s linear infinite',
    }} />
  );
}

function StepRow({ done, active, text }) {
  const color = done ? '#4ade80' : active ? 'var(--accent)' : 'var(--text-dim)';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, color }}>
      <span style={{ width:12, textAlign:'center' }}>
        {done ? '✓' : active ? '›' : '○'}
      </span>
      <span>{text}</span>
      {active && <Spinner />}
    </div>
  );
}