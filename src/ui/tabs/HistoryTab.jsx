/**
 * HistoryTab.jsx — Workout history with heatmap calendar and period stats.
 * 12-week GitHub-style heatmap. Save/delete workouts. Aggregate stats by period.
 * Props: { history, currentWorkout, onLoadFromHistory }
 */
import { useState, useEffect, useRef } from 'react';
import { Card, CardLabel }             from './OverviewTab.jsx';

const LOAD_COLOR = { high: '#ef4444', medium: '#f97316', low: '#4ade80', unknown: '#374151' };
const WEEKDAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const MONTHS_RU  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];


// ── Heat-map calendar (GitHub-style, last 12 weeks) ──────────────────────────
export function HeatmapCalendar({ history, onSelect, selectedDate }) {
  const today    = new Date();
  const byDate   = Object.fromEntries(history.map(w => [w.date, w]));

  // Build 12 weeks × 7 days grid aligned to Mon–Sun
  const cells = [];
  const dow    = (today.getDay() + 6) % 7; // 0=Mon
  const endDay = new Date(today);
  endDay.setHours(23,59,59,999);
  const startDay = new Date(today);
  startDay.setDate(today.getDate() - 83 + (6 - dow)); // 12 full weeks ending Sunday

  for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
    const iso  = d.toISOString().slice(0,10);
    const w    = byDate[iso];
    cells.push({ date: iso, workout: w || null });
  }

  // Group into weeks
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  // Month labels: show month name when it changes across week starts
  const monthLabels = weeks.map(week => {
    const m = new Date(week[0].date).getMonth();
    return MONTHS_RU[m];
  });

  return (
    <div>
      <div style={{ display:'flex', gap:3, alignItems:'flex-start' }}>
        {/* Weekday labels */}
        <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:20, marginRight:4 }}>
          {WEEKDAYS.map((d,i) => (
            <div key={d} style={{ height:12, fontSize:9, color:'var(--text-dim)', fontFamily:'var(--font-mono)', lineHeight:'12px', visibility: i%2===0 ? 'visible' : 'hidden' }}>{d}</div>
          ))}
        </div>
        {/* Grid */}
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {/* Month labels */}
          <div style={{ display:'flex', gap:3, marginBottom:4 }}>
            {weeks.map((week, wi) => {
              const showLabel = wi === 0 || monthLabels[wi] !== monthLabels[wi-1];
              return (
                <div key={wi} style={{ width:12, fontSize:9, color:'var(--text-muted)', fontFamily:'var(--font-mono)', overflow:'visible', whiteSpace:'nowrap' }}>
                  {showLabel ? monthLabels[wi] : ''}
                </div>
              );
            })}
          </div>
          {/* Day rows */}
          {WEEKDAYS.map((_, di) => (
            <div key={di} style={{ display:'flex', gap:3, marginBottom:3 }}>
              {weeks.map((week, wi) => {
                const cell = week[di];
                if (!cell) return <div key={wi} style={{ width:12, height:12 }} />;
                const w    = cell.workout;
                const load = w?.load?.level || null;
                const sel  = cell.date === selectedDate;
                const bg   = load ? LOAD_COLOR[load] : 'var(--bg-raised)';
                const opacity = load ? (load==='high'?1 : load==='medium'?0.75 : 0.5) : 1;
                return (
                  <div
                    key={wi}
                    onClick={() => w && onSelect(cell.date)}
                    title={w ? `${cell.date}: ${(w.distance/1000).toFixed(1)}km, TE ${w.trainingEffect?.aerobic}` : cell.date}
                    style={{
                      width:12, height:12, borderRadius:2,
                      background: bg, opacity,
                      border: sel ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                      cursor: w ? 'pointer' : 'default',
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={e => { if(w) e.currentTarget.style.transform='scale(1.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{ display:'flex', gap:12, marginTop:8, alignItems:'center' }}>
        <span style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>Load:</span>
        {[['low','Low'],['medium','Medium'],['high','High']].map(([level,label]) => (
          <div key={level} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:10, height:10, borderRadius:2, background:LOAD_COLOR[level], opacity: level==='high'?1:level==='medium'?0.75:0.5 }} />
            <span style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Workout row in the list ───────────────────────────────────────────────────
export function WorkoutRow({ w, selected, onSelect, onDelete }) {
  const fmtDur = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return `${h}:${String(m).padStart(2,'0')}`; };
  return (
    <div
      onClick={() => onSelect(w.date)}
      style={{
        display:'flex', alignItems:'center', gap:'var(--sp-4)',
        padding:'var(--sp-3) var(--sp-4)',
        background: selected ? 'rgba(232,168,50,0.08)' : 'var(--bg-overlay)',
        border: `1px solid ${selected ? 'rgba(232,168,50,0.3)' : 'var(--border-subtle)'}`,
        borderRadius:'var(--r-md)', cursor:'pointer',
        transition:'all var(--t-fast) var(--ease-snappy)',
      }}
      onMouseEnter={e => { if(!selected) e.currentTarget.style.borderColor='var(--border-mid)'; }}
      onMouseLeave={e => { if(!selected) e.currentTarget.style.borderColor='var(--border-subtle)'; }}
    >
      {/* Load dot */}
      <div style={{ width:8, height:8, borderRadius:'50%', background: LOAD_COLOR[w.load?.level||'unknown'], flexShrink:0 }} />
      {/* Date + sport */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>
          {w.date.slice(5)} <span style={{ color:'var(--text-muted)', fontWeight:400 }}>{w.startTime}</span>
        </div>
        <div style={{ fontSize:11, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {w.sport}{w.bike ? ` · ${w.bike}` : ''}
        </div>
      </div>
      {/* Stats */}
      <div style={{ display:'flex', gap:'var(--sp-4)', flexShrink:0 }}>
        <Stat value={`${(w.distance/1000).toFixed(1)}`} unit="km" />
        <Stat value={fmtDur(w.duration?.active||0)} unit="" />
        <Stat value={`${w.trainingEffect?.aerobic?.toFixed(1)||'—'}`} unit="TE" accent />
      </div>
      {/* Delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(w.date); }}
        style={{ background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:14, padding:'2px 4px', lineHeight:1 }}
        title="Delete"
      >×</button>
    </div>
  );
}

export function Stat({ value, unit, accent }) {
  return (
    <div style={{ textAlign:'right' }}>
      <span style={{ fontSize:13, fontFamily:'var(--font-mono)', color: accent ? 'var(--accent)' : 'var(--text-primary)', fontWeight: accent ? 600 : 400 }}>{value}</span>
      {unit && <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:2 }}>{unit}</span>}
    </div>
  );
}

// ── Period selector ───────────────────────────────────────────────────────────
export function PeriodSelector({ period, onChange }) {
  const opts = [7,10,14,30];
  return (
    <div style={{ display:'flex', gap:4 }}>
      {opts.map(d => (
        <button key={d} onClick={() => onChange(d)} style={{
          background: period===d ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
          border: `1px solid ${period===d ? 'rgba(232,168,50,0.4)' : 'var(--border-subtle)'}`,
          borderRadius:'var(--r-sm)', padding:'4px 10px',
          color: period===d ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize:11, fontFamily:'var(--font-mono)', cursor:'pointer',
        }}>{d}d</button>
      ))}
    </div>
  );
}

// ── Period selector ───────────────────────────────────────────────────────────
export function HistoryTab({ history, currentWorkout, onSave, onLoadFromHistory }) {
  const [selectedDate, setSelectedDate]  = useState(null);
  const [period,       setPeriod]        = useState(10);
  const [saveStatus,   setSaveStatus]    = useState(null); // null | 'saving' | 'saved' | 'error'
  const { deleteWorkout, aggregateStats } = history;
  const workouts = history.history;

  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(now.getDate() - period);
  const periodWorkouts = workouts.filter(w => new Date(w.date) >= cutoff);
  const stats = aggregateStats(periodWorkouts);
  const selectedWorkout = workouts.find(w => w.date === selectedDate);

  const handleSave = async () => {
    if (!currentWorkout) return;
    setSaveStatus('saving');
    const ok = await history.saveWorkout(currentWorkout);
    setSaveStatus(ok ? 'saved' : 'error');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const fmtDur = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return `${h}h ${String(m).padStart(2,'0')}min`; };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--sp-4)' }}>

      {/* Save current workout */}
      {currentWorkout && (
        <div style={{
          background:'rgba(232,168,50,0.06)', border:'1px solid rgba(232,168,50,0.2)',
          borderRadius:'var(--r-md)', padding:'var(--sp-3) var(--sp-4)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div>
            <div style={{ fontSize:11, color:'var(--accent)', fontFamily:'var(--font-mono)', marginBottom:2 }}>CURRENT WORKOUT</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
              {currentWorkout.date} · {(currentWorkout.distance/1000).toFixed(1)} km · TE {currentWorkout.trainingEffect?.aerobic}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            style={{
              background: saveStatus==='saved' ? 'rgba(74,222,128,0.15)' : saveStatus==='error' ? 'rgba(239,68,68,0.15)' : 'rgba(232,168,50,0.15)',
              border: `1px solid ${saveStatus==='saved' ? 'rgba(74,222,128,0.4)' : saveStatus==='error' ? 'rgba(239,68,68,0.4)' : 'rgba(232,168,50,0.4)'}`,
              borderRadius:'var(--r-sm)', padding:'var(--sp-2) var(--sp-4)',
              color: saveStatus==='saved' ? '#4ade80' : saveStatus==='error' ? '#ef4444' : 'var(--accent)',
              fontSize:12, fontWeight:600, cursor: saveStatus==='saving' ? 'wait' : 'pointer',
              fontFamily:'var(--font-body)',
            }}
          >
            {saveStatus==='saving' ? '…' : saveStatus==='saved' ? '✓ Saved' : saveStatus==='error' ? '✗ Error' : '↓ Save'}
          </button>
        </div>
      )}

      {!history.storageOk && (
        <div style={{ background:'rgba(250,191,36,0.06)', border:'1px solid rgba(250,191,36,0.2)', borderRadius:'var(--r-md)', padding:'var(--sp-3) var(--sp-4)', fontSize:12, color:'var(--accent)', fontFamily:'var(--font-mono)' }}>
          ℹ History available in this session · saved in browser memory
        </div>
      )}

      {/* Heatmap */}
      <Card>
        <CardLabel>Activity Calendar (12 weeks)</CardLabel>
        {history.loadingDb ? (
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>Loading...</div>
        ) : (
          <HeatmapCalendar history={workouts} onSelect={setSelectedDate} selectedDate={selectedDate} />
        )}
      </Card>

      {/* Period stats */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
          {periodWorkouts.length} workouts in period
        </div>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:'var(--sp-3)' }}>
          {[
            { label:'Distance',   value: stats.totalDistKm,  unit:'km'   },
            { label:'Time',        value: fmtDur(stats.totalActiveH*3600), unit:'' },
            { label:'Ascent',         value: stats.totalAscent,  unit:'m'    },
            { label:'Calories',       value: stats.totalCals,    unit:'kcal' },
            { label:'Avg TE',        value: stats.avgTE,        unit:'/5'   },
            { label:'High load', value: stats.highLoadDays, unit:'days' },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-md)', padding:'var(--sp-3) var(--sp-4)' }}>
              <div style={{ fontSize:9, color:'var(--text-muted)', fontFamily:'var(--font-mono)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)', fontFamily:'var(--font-display)', lineHeight:1 }}>
                {s.value}<span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:2 }}>{s.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workout list */}
      {workouts.length === 0 ? (
        <div style={{ background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'var(--sp-8)', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:'var(--sp-3)' }}>📂</div>
          <div style={{ fontSize:13, color:'var(--text-secondary)' }}>History is empty</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:'var(--sp-2)' }}>Upload a workout and click "Save"</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--sp-2)' }}>
          <CardLabel>All workouts ({workouts.length})</CardLabel>
          {workouts.map(w => (
            <WorkoutRow
              key={w.date} w={w}
              selected={w.date === selectedDate}
              onSelect={d => { setSelectedDate(d); onLoadFromHistory && onLoadFromHistory(w); }}
              onDelete={deleteWorkout}
            />
          ))}
        </div>
      )}

      {/* Selected workout detail */}
      {selectedWorkout && (
        <Card style={{ borderColor:'rgba(232,168,50,0.25)' }}>
          <CardLabel>Details · {selectedWorkout.date}</CardLabel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--sp-3)' }}>
            {selectedWorkout.hrZones?.map(z => (
              <div key={z.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:z.color, flexShrink:0 }} />
                <span style={{ fontSize:11, color:'var(--text-secondary)', flex:1 }}>{z.name}</span>
                <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:z.color }}>{z.minutes}min</span>
                <span style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)', width:30, textAlign:'right' }}>{z.pct?.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
