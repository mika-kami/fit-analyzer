/**
 * PlanTab.jsx — 7-day training plan with detraining-aware scheduling.
 * Recomputes live from history. Start-day picker (Today / Tomorrow).
 * Props: { workout, history }
 */
import { useState, useEffect }                                           from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generateTrainingPlan } from '../../core/trainingEngine.js';
import { Card, CardLabel }      from './OverviewTab.jsx';

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Plan
// ═══════════════════════════════════════════════════════════════════════════════
export function PlanContextBanner({ meta, workout }) {
  const dt    = meta.detraining;
  const load  = meta.load;
  const phase = meta.phase;

  const phaseColor = {
    full_restart: '#ef4444',
    base_rebuild: '#f97316',
    significant:  '#fbbf24',
    moderate:     '#a3e635',
    slight:       '#60a5fa',
    overreached:  '#ef4444',
    active:       '#4ade80',
    too_easy:     '#a78bfa',
  }[phase] ?? '#6b7280';

  const tsbColor = load.tsb > 5 ? '#4ade80' : load.tsb < -15 ? '#ef4444' : '#fbbf24';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--sp-3)' }}>
      {/* Phase banner */}
      <div style={{
        background: `${phaseColor}10`, border: `1px solid ${phaseColor}30`,
        borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <div>
          <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:2 }}>
            ФАЗА ПОДГОТОВКИ
          </div>
          <div style={{ fontSize:13, color: phaseColor, fontWeight:600 }}>
            {dt.label}
          </div>
          {dt.daysSince < 999 && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
              Последняя тренировка: {dt.daysSince === 0 ? 'сегодня' : `${dt.daysSince} дн. назад`}
            </div>
          )}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:9, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:4 }}>
            ОБЪЁМ НЕДЕЛИ
          </div>
          <div style={{ fontSize:20, fontWeight:600, color: phaseColor, fontFamily:'var(--font-display)' }}>
            ~{meta.targetWeekKm} км
          </div>
          <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
            база {meta.baseKm} км × {Math.round(100/meta.baseKm * meta.targetWeekKm)}%
          </div>
        </div>
      </div>

      {/* ATL / CTL / TSB row */}
      {(load.ctl > 0 || load.atl > 0) && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'var(--sp-2)' }}>
          {[
            { label:'CTL (фитнес)',  value: load.ctl.toFixed(1), color:'#60a5fa', sub:'ср. ТЭ/42 дня' },
            { label:'ATL (нагрузка)',value: load.atl.toFixed(1), color:'#f97316', sub:'ср. ТЭ/7 дней'  },
            { label:'TSB (свежесть)',value: (load.tsb > 0 ? '+' : '') + load.tsb.toFixed(1), color: tsbColor, sub: load.tsb > 5 ? 'свежий' : load.tsb < -15 ? 'усталость' : 'нейтрально' },
          ].map(item => (
            <div key={item.label} style={{
              background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
              borderRadius:'var(--r-sm)', padding:'var(--sp-2) var(--sp-3)',
            }}>
              <div style={{ fontSize:9, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:2 }}>{item.label}</div>
              <div style={{ fontSize:18, fontWeight:600, color:item.color, fontFamily:'var(--font-display)', lineHeight:1 }}>{item.value}</div>
              <div style={{ fontSize:9, color:'var(--text-dim)', marginTop:2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlanTab({ workout: w, history }) {
  // Today and tomorrow as start options (0=Mon..6=Sun)
  const todayDow    = (new Date().getDay() + 6) % 7;
  const tomorrowDow = (todayDow + 1) % 7;
  const [startDow, setStartDow] = useState(todayDow);

  // Recompute plan live: changes when history or startDow changes
  const histWorkouts = history?.history ?? [];
  const livePlan     = generateTrainingPlan(w, histWorkouts, startDow);
  const plan         = livePlan.days ?? [];
  const planMeta     = livePlan.meta;

  const DAY_FULL = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRevealed(true), 80); return () => clearTimeout(t); }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {planMeta && <PlanContextBanner meta={planMeta} workout={w} />}

      {/* Start-day picker */}
      <div style={{ display:'flex', alignItems:'center', gap:'var(--sp-3)' }}>
        <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', whiteSpace:'nowrap' }}>
          НАЧАТЬ ПЛАН С:
        </span>
        <div style={{ display:'flex', gap:6, flex:1 }}>
          {[
            { dow: todayDow,    label: 'Сегодня',    sub: DAY_FULL[todayDow]    },
            { dow: tomorrowDow, label: 'Завтра',     sub: DAY_FULL[tomorrowDow] },
          ].map(opt => (
            <button key={opt.dow} onClick={() => setStartDow(opt.dow)} style={{
              flex: 1,
              background: startDow === opt.dow ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
              border: `1px solid ${startDow === opt.dow ? 'rgba(232,168,50,0.45)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all var(--t-base) var(--ease-snappy)',
            }}>
              <div style={{ fontSize:12, fontWeight:600, color: startDow===opt.dow ? 'var(--accent)' : 'var(--text-primary)' }}>
                {opt.label}
              </div>
              <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                {opt.sub}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {plan.map((day, i) => <DayCard key={day.day} day={day} index={i} revealed={revealed} />)}
      </div>

      <Card style={{ padding: 'var(--sp-4) var(--sp-3) var(--sp-3)' }}>
        <CardLabel>Интенсивность по дням</CardLabel>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={plan} margin={{ top:0, right:4, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="day" tick={{ fill:'#3a3d4e', fontSize:11, fontFamily:'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0,100]} tick={{ fill:'#3a3d4e', fontSize:10 }} axisLine={false} tickLine={false} width={24} />
            <Tooltip contentStyle={{ background:'var(--bg-raised)', border:'1px solid var(--border-mid)', borderRadius:8, fontSize:12, fontFamily:'var(--font-mono)' }} formatter={(v,_,p) => [`${v}%`, p.payload.label]} />
            <Bar dataKey="intensity" radius={[3,3,0,0]}>
              {plan.map((d,i) => <Cell key={i} fill={d.current ? '#e8a832' : d.color} opacity={d.current ? 1 : 0.75} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <CardLabel>Недельные цели</CardLabel>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--sp-3)' }}>
          {[
            {icon:'📏', label:'Целевой объём',      value: planMeta ? `~${planMeta.targetWeekKm} км` : '—'},
            {icon:'💚', label:'Z1–Z2 доля',         value: planMeta?.meta?.phase === 'too_easy' ? '≥ 65%' : '≥ 75%'},
            {icon:'⚡', label:'Интенсивных сессий', value: ['overreached','base_rebuild','full_restart'].includes(planMeta?.phase) ? '0' : '1–2'},
            {icon:'😴', label:'Дней отдыха',        value: ['overreached','full_restart'].includes(planMeta?.phase) ? '3+' : '2'},
          ].map(item => (
            <div key={item.label} style={{ display:'flex', gap:'var(--sp-3)', alignItems:'flex-start' }}>
              <span style={{ fontSize:20, lineHeight:1.3 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:2 }}>{item.label.toUpperCase()}</div>
                <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', fontFamily:'var(--font-display)' }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function DayCard({ day, index, revealed }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), revealed ? index*60 : 0); return () => clearTimeout(t); }, [revealed, index]);

  const highlight = day.isToday || day.isTomorrow;
  const badge = day.isToday ? 'СЕГОДНЯ' : day.isTomorrow ? 'ЗАВТРА' : null;

  return (
    <div style={{
      opacity: show?1:0, transform: show?'translateY(0)':'translateY(12px)',
      transition: 'opacity 0.35s ease, transform 0.35s ease',
      background: highlight ? `${day.color}10` : 'var(--bg-overlay)',
      border: `1px solid ${highlight ? day.color+'45' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
      boxShadow: highlight ? `0 0 14px ${day.color}15` : 'none',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'var(--sp-2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'var(--sp-3)' }}>
          {/* Day label + date */}
          <div style={{ minWidth: 46 }}>
            <div style={{ fontSize:12, fontWeight:700, color: highlight ? day.color : 'var(--text-secondary)', fontFamily:'var(--font-mono)', lineHeight:1.2 }}>
              {day.day}
            </div>
            {day.date && (
              <div style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{day.date}</div>
            )}
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:13, color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {day.label}
              </span>
              {badge && (
                <span style={{
                  fontSize:9, color:day.color, fontFamily:'var(--font-mono)',
                  background:`${day.color}18`, border:`1px solid ${day.color}40`,
                  borderRadius:4, padding:'2px 6px', letterSpacing:'0.06em',
                }}>{badge}</span>
              )}
            </div>
            {day.desc && (
              <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>{day.desc}</div>
            )}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:10, color:day.color, fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>{day.type}</div>
          {day.targetKm > 0 && (
            <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>~{day.targetKm} км</div>
          )}
        </div>
      </div>
      <div style={{ height:4, background:'var(--bg-raised)', borderRadius:2, overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${day.intensity}%`,
          background: highlight ? `linear-gradient(90deg,${day.color}88,${day.color})` : day.color,
          borderRadius:2,
          transition: show ? 'width 0.6s var(--ease-snappy)' : 'none',
          transitionDelay: show ? `${index*60+200}ms` : '0ms',
          boxShadow: highlight ? `0 0 6px ${day.color}55` : 'none',
        }} />
      </div>
    </div>
  );
}
