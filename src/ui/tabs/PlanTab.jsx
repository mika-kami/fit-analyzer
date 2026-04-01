/**
 * PlanTab.jsx — 7-day training plan with detraining-aware scheduling.
 * Recomputes live from history. Start-day picker (Today / Tomorrow).
 * Props: { workout, history }
 */
import { useState, useEffect, useMemo }                                  from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generateTrainingPlan } from '../../core/trainingEngine.js';
import {
  computeReadinessScore,
  computeTrainingStatus,
  analyzePerformanceLimiters,
  prescribeNextWorkout,
  buildWeeklyReadinessForecast,
  alignPrescriptionToWeekPlan,
} from '../../core/coachEngine.js';
import { Card, CardLabel }      from './OverviewTab.jsx';

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY ?? '';

function normalizePlanDateToIso(value, fallbackIso) {
  if (!value) return fallbackIso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const m = String(value).match(/^(\d{2})\/(\d{2})$/);
  if (m) {
    const year = Number((fallbackIso || new Date().toISOString().slice(0, 10)).slice(0, 4));
    const dt = new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
    return dt.toISOString().slice(0, 10);
  }
  return fallbackIso;
}

function windDirection(deg) {
  if (deg == null || Number.isNaN(deg)) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx];
}

function extractWorkoutCoords(workout) {
  const points = workout?.timeSeries ?? [];
  const point = points.find(p =>
    Number.isFinite(p?.lat) &&
    Number.isFinite(p?.lon)
  );
  return point ? { lat: point.lat, lon: point.lon } : null;
}

function pickDailyForecastFrom3h(list = [], dayIndex = 0) {
  if (!list.length) return null;
  const target = new Date();
  target.setHours(12, 0, 0, 0);
  target.setDate(target.getDate() + dayIndex);
  const targetMs = target.getTime();

  const sameDay = list.filter(item => {
    const dt = new Date((item.dt ?? 0) * 1000);
    return (
      dt.getFullYear() === target.getFullYear() &&
      dt.getMonth() === target.getMonth() &&
      dt.getDate() === target.getDate()
    );
  });

  if (!sameDay.length) return null;

  let best = sameDay[0];
  let bestDiff = Math.abs(((best.dt ?? 0) * 1000) - targetMs);
  for (let i = 1; i < sameDay.length; i++) {
    const diff = Math.abs(((sameDay[i].dt ?? 0) * 1000) - targetMs);
    if (diff < bestDiff) {
      best = sameDay[i];
      bestDiff = diff;
    }
  }

  const windMs = Number(best?.wind?.speed ?? 0);
  return {
    tempC: Math.round(best?.main?.temp ?? 0),
    windMs: parseFloat(windMs.toFixed(1)),
    windKmh: Math.round(windMs * 3.6),
    windDeg: best?.wind?.deg ?? null,
    windDir: windDirection(best?.wind?.deg),
    weatherLabel: best?.weather?.[0]?.main ?? '',
  };
}

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
            TRAINING PHASE
          </div>
          <div style={{ fontSize:13, color: phaseColor, fontWeight:600 }}>
            {dt.label}
          </div>
          {dt.daysSince < 999 && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
              Last workout: {dt.daysSince === 0 ? 'today' : `${dt.daysSince} days ago`}
            </div>
          )}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:9, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:4 }}>
            WEEK VOLUME
          </div>
          <div style={{ fontSize:20, fontWeight:600, color: phaseColor, fontFamily:'var(--font-display)' }}>
            ~{meta.targetWeekKm} km
          </div>
          <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
            base {meta.baseKm} km × {Math.round(100/meta.baseKm * meta.targetWeekKm)}%
          </div>
        </div>
      </div>

      {/* ATL / CTL / TSB row */}
      {(load.ctl > 0 || load.atl > 0) && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'var(--sp-2)' }}>
          {[
            { label:'CTL (fitness)',  value: load.ctl.toFixed(1), color:'#60a5fa', sub:'avg TE/42 days' },
            { label:'ATL (load)',value: load.atl.toFixed(1), color:'#f97316', sub:'avg TE/7 days'  },
            { label:'TSB (freshness)',value: (load.tsb > 0 ? '+' : '') + load.tsb.toFixed(1), color: tsbColor, sub: load.tsb > 5 ? 'fresh' : load.tsb < -15 ? 'fatigue' : 'neutral' },
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

export function PlanTab({ workout: w, history, coach }) {
  // Today and tomorrow as start options (0=Mon..6=Sun)
  const todayDow    = (new Date().getDay() + 6) % 7;
  const tomorrowDow = (todayDow + 1) % 7;
  const [startDow, setStartDow] = useState(todayDow);
  const [planSport, setPlanSport] = useState(() => {
    const t = coach?.profile?.targetSport;
    return (t === 'running' || t === 'cycling' || t === 'mixed') ? t : 'mixed';
  });

  // Recompute plan live: changes when history or startDow changes
  const histWorkouts = history?.history ?? [];
  const planWorkout  = useMemo(() => {
    if (!w) return w;
    if (planSport === 'running') {
      return { ...w, sport: 'Running', sportLabel: 'Running' };
    }
    if (planSport === 'cycling') {
      return { ...w, sport: 'Cycling', sportLabel: 'Cycling' };
    }
    return w;
  }, [w, planSport]);
  const livePlan     = generateTrainingPlan(planWorkout, histWorkouts, startDow);
  const plan         = livePlan.days ?? [];
  const planMeta     = livePlan.meta;
  const coords       = extractWorkoutCoords(w);
  const lastTSB      = planMeta?.load ? { ...planMeta.load, tsb: planMeta.load.tsb ?? 0 } : null;
  const todayIso     = coach?.todayIso ?? new Date().toISOString().slice(0, 10);
  const checkin      = coach?.getDailyCheckin?.(todayIso);
  const readiness    = useMemo(() => computeReadinessScore(checkin), [checkin]);
  const trainingStatus = useMemo(
    () => computeTrainingStatus({ lastTSB, readiness }),
    [lastTSB?.tsb, lastTSB?.ctl, readiness?.score]
  );
  const insights = useMemo(
    () => analyzePerformanceLimiters({
      workouts: histWorkouts,
      profile: { ...(coach?.profile || {}), targetSport: planSport },
      readiness,
      lastTSB,
    }),
    [histWorkouts, coach?.profile, planSport, readiness?.score, lastTSB?.tsb, lastTSB?.ctl]
  );
  const coachPrescription = useMemo(
    () => prescribeNextWorkout({
      profile: { ...(coach?.profile || {}), targetSport: planSport },
      readiness,
      trainingStatus,
      insights,
      weatherScore: checkin?.weatherScore ?? 70,
    }),
    [coach?.profile, planSport, readiness?.score, trainingStatus?.label, insights, checkin?.weatherScore]
  );
  const readinessForecast = useMemo(
    () => buildWeeklyReadinessForecast(checkin),
    [checkin]
  );
  const profileTarget = coach?.profile?.targetSport || 'mixed';
  const shouldAttachCoachSession =
    profileTarget === 'mixed'
      ? planSport === 'mixed'
      : planSport === profileTarget;

      const coachAligned = useMemo(() => {
    if (!shouldAttachCoachSession) {
      return {
        alignedDays: plan,
        chosenIndex: null,
        coherence: 0,
        fallbackUsed: false,
        reason: `Coach workout hidden for ${planSport} plan. Target sport is ${profileTarget}.`,
        requiredReadiness: 0,
        chosenReadiness: 0,
      };
    }
    return alignPrescriptionToWeekPlan({
      weekDays: plan,
      prescription: coachPrescription,
      readinessForecast,
    });
  }, [plan, coachPrescription, readinessForecast, shouldAttachCoachSession, planSport, profileTarget]);
  const alignedPlan = coachAligned?.alignedDays?.length ? coachAligned.alignedDays : plan;

  useEffect(() => {
    if (!coach?.saveWeeklyPlan || !alignedPlan?.length) return;
    const weekStartDate = normalizePlanDateToIso(alignedPlan[0]?.date, todayIso);
    coach.saveWeeklyPlan({
      weekStartDate,
      planSport,
      coherenceScore: coachAligned?.coherence ?? 0,
      requiredReadiness: coachAligned?.requiredReadiness ?? 0,
      chosenReadiness: coachAligned?.chosenReadiness ?? 0,
      fallbackUsed: coachAligned?.fallbackUsed ?? false,
      alignmentReason: coachAligned?.reason ?? '',
      prescription: coachPrescription ?? {},
      alignedDays: alignedPlan,
    });
  }, [
    coach,
    alignedPlan,
    coachAligned?.coherence,
    coachAligned?.requiredReadiness,
    coachAligned?.chosenReadiness,
    coachAligned?.fallbackUsed,
    coachAligned?.reason,
    coachPrescription,
    planSport,
    todayIso,
  ]);

  const DAY_FULL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const [weatherSource, setWeatherSource] = useState('workout'); // 'workout' | 'city'
  const [cityInput, setCityInput] = useState(() => {
    try {
      return localStorage.getItem('plan_weather_city') || 'Prague';
    } catch {
      return 'Prague';
    }
  });
  const [cityQuery, setCityQuery] = useState(() => {
    try {
      return localStorage.getItem('plan_weather_city') || 'Prague';
    } catch {
      return 'Prague';
    }
  });
  const [weather, setWeather] = useState({ loading: false, error: '', days: [], location: '' });

  useEffect(() => {
    if (!OPENWEATHER_API_KEY) {
      setWeather({ loading: false, error: 'VITE_OPENWEATHER_API_KEY is not set', days: [], location: '' });
      return;
    }
    if (weatherSource === 'workout' && !coords) {
      setWeather({ loading: false, error: 'No GPS points in workout for forecast', days: [], location: '' });
      return;
    }
    if (weatherSource === 'city' && !cityQuery.trim()) {
      setWeather({ loading: false, error: 'Enter city name', days: [], location: '' });
      return;
    }

    const ctrl = new AbortController();

    async function fetchForecast() {
      setWeather(prev => ({ ...prev, loading: true, error: '' }));
      try {
        const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
        if (weatherSource === 'city') {
          url.searchParams.set('q', cityQuery.trim());
        } else {
          url.searchParams.set('lat', String(coords.lat));
          url.searchParams.set('lon', String(coords.lon));
        }
        url.searchParams.set('units', 'metric');
        url.searchParams.set('appid', OPENWEATHER_API_KEY);

        const res = await fetch(url.toString(), { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.message || `OpenWeather HTTP ${res.status}`);
        }

        const list = Array.isArray(data?.list) ? data.list : [];
        const days = Array.from({ length: 7 }, (_, i) => pickDailyForecastFrom3h(list, i)).filter(Boolean);
        const location = data?.city?.name || (weatherSource === 'city' ? cityQuery.trim() : 'Workout location');

        setWeather({ loading: false, error: '', days, location });
      } catch (e) {
        if (e.name === 'AbortError') return;
        setWeather({ loading: false, error: e.message || 'Loading weather error', days: [], location: '' });
      }
    }

    fetchForecast();
    return () => ctrl.abort();
  }, [coords?.lat, coords?.lon, weatherSource, cityQuery]);

  const applyCity = () => {
    const nextCity = cityInput.trim();
    if (!nextCity) return;
    setWeatherSource('city');
    setCityQuery(nextCity);
    try {
      localStorage.setItem('plan_weather_city', nextCity);
    } catch {}
  };

  const [revealed, setRevealed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRevealed(true), 80); return () => clearTimeout(t); }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {planMeta && <PlanContextBanner meta={planMeta} workout={w} />}

      <Card style={{ padding: 'var(--sp-3) var(--sp-3)' }}>
        <CardLabel>Plan Type</CardLabel>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <select
            value={planSport}
            onChange={e => setPlanSport(e.target.value)}
            style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              padding: '6px 10px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            <option value="mixed">Mixed</option>
            <option value="running">Running</option>
            <option value="cycling">Cycling</option>
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Target sport: {profileTarget}
          </div>
        </div>
      </Card>

      {/* Start-day picker */}
      <div style={{ display:'flex', alignItems:'center', gap:'var(--sp-3)' }}>
        <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', whiteSpace:'nowrap' }}>
          START PLAN FROM:
        </span>
        <div style={{ display:'flex', gap:6, flex:1 }}>
          {[
            { dow: todayDow,    label: 'Today',    sub: DAY_FULL[todayDow]    },
            { dow: tomorrowDow, label: 'Tomorrow',     sub: DAY_FULL[tomorrowDow] },
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
        {alignedPlan.map((day, i) => (
          <DayCard
            key={day.day}
            day={day}
            weather={weather.days[i]}
            index={i}
            revealed={revealed}
          />
        ))}
      </div>

      <Card style={{ padding: 'var(--sp-4) var(--sp-3)' }}>
        <CardLabel>Coach Alignment · Weekly Plan</CardLabel>
        <div style={{
          background: coachAligned?.fallbackUsed ? 'rgba(249,115,22,0.1)' : 'rgba(74,222,128,0.08)',
          border: `1px solid ${coachAligned?.fallbackUsed ? 'rgba(249,115,22,0.35)' : 'rgba(74,222,128,0.3)'}`,
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-3)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {coachPrescription?.title || 'No prescription'}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
            {coachAligned?.reason || 'Coach workout not aligned yet.'}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            Coherence score: <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{coachAligned?.coherence ?? 0}/100</span>
            {' · '}
            Readiness gate: <span style={{ fontFamily: 'var(--font-mono)' }}>{coachAligned?.chosenReadiness ?? 0}/{coachAligned?.requiredReadiness ?? 0}</span>
          </div>
          {!shouldAttachCoachSession && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#f97316', fontFamily: 'var(--font-mono)' }}>
              Coach sessions are attached only to the target-sport plan.
            </div>
          )}
        </div>
      </Card>

      <Card style={{ padding: 'var(--sp-4) var(--sp-3)' }}>
        <CardLabel>Weather (OpenWeather)</CardLabel>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <button
            onClick={() => setWeatherSource('workout')}
            style={{
              background: weatherSource === 'workout' ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
              border: `1px solid ${weatherSource === 'workout' ? 'rgba(232,168,50,0.45)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-sm)',
              padding: '4px 10px',
              fontSize: 11,
              color: weatherSource === 'workout' ? 'var(--accent)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            By workout GPS
          </button>
          <button
            onClick={() => setWeatherSource('city')}
            style={{
              background: weatherSource === 'city' ? 'rgba(96,165,250,0.12)' : 'var(--bg-overlay)',
              border: `1px solid ${weatherSource === 'city' ? 'rgba(96,165,250,0.35)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-sm)',
              padding: '4px 10px',
              fontSize: 11,
              color: weatherSource === 'city' ? '#60a5fa' : 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            By city
          </button>
          <input
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyCity(); }}
            placeholder="City, e.g. Prague"
            style={{
              flex: '1 1 160px',
              minWidth: 140,
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              padding: '4px 8px',
              fontSize: 11,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <button
            onClick={applyCity}
            style={{
              background: 'rgba(96,165,250,0.12)',
              border: '1px solid rgba(96,165,250,0.35)',
              borderRadius: 'var(--r-sm)',
              padding: '4px 10px',
              fontSize: 11,
              color: '#60a5fa',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
        {weather.location && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 'var(--sp-2)' }}>
            Location: {weather.location}
          </div>
        )}
        {weather.loading && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Loading forecast…
          </div>
        )}
        {!weather.loading && weather.error && (
          <div style={{ fontSize: 11, color: '#f97316', fontFamily: 'var(--font-mono)' }}>
            {weather.error}
          </div>
        )}
        {!weather.loading && !weather.error && weather.days.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--sp-2)' }}>
            {weather.days.map((d, i) => (
              <div key={i} style={{
                background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
                borderRadius:'var(--r-sm)', padding:'var(--sp-2) var(--sp-3)',
              }}>
                <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                  {alignedPlan[i]?.day ?? `Day ${i + 1}`}
                </div>
                <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
                  {d.tempC}°C · {d.weatherLabel || '—'}
                </div>
                <div style={{ fontSize:11, color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>
                  Wind: {d.windKmh} km/h ({d.windMs} m/s), {d.windDir}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ padding: 'var(--sp-4) var(--sp-3) var(--sp-3)' }}>
        <CardLabel>Daily intensity</CardLabel>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={alignedPlan} margin={{ top:0, right:4, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="day" tick={{ fill:'#3a3d4e', fontSize:11, fontFamily:'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0,100]} tick={{ fill:'#3a3d4e', fontSize:10 }} axisLine={false} tickLine={false} width={24} />
            <Tooltip contentStyle={{ background:'var(--bg-raised)', border:'1px solid var(--border-mid)', borderRadius:8, fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-primary)' }} labelStyle={{ color:'var(--text-muted)' }} itemStyle={{ color:'var(--text-secondary)' }} formatter={(v,_,p) => [`${v}%`, p.payload.label]} />
            <Bar dataKey="intensity" radius={[3,3,0,0]}>
              {alignedPlan.map((d,i) => <Cell key={i} fill={d.current ? '#e8a832' : d.color} opacity={d.current ? 1 : 0.75} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <CardLabel>Weekly goals</CardLabel>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--sp-3)' }}>
          {[
            {icon:'📏', label:'Target volume',      value: planMeta ? `~${planMeta.targetWeekKm} km` : '—'},
            {icon:'💚', label:'Z1-Z2 share',         value: planMeta?.meta?.phase === 'too_easy' ? '≥ 65%' : '≥ 75%'},
            {icon:'⚡', label:'Intense sessions', value: ['overreached','base_rebuild','full_restart'].includes(planMeta?.phase) ? '0' : '1–2'},
            {icon:'😴', label:'Rest days',        value: ['overreached','full_restart'].includes(planMeta?.phase) ? '3+' : '2'},
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

export function DayCard({ day, weather, index, revealed }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), revealed ? index*60 : 0); return () => clearTimeout(t); }, [revealed, index]);

  const highlight = day.isToday || day.isTomorrow;
  const badge = day.isToday ? 'TODAY' : day.isTomorrow ? 'TOMORROW' : null;

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
            {weather && (
              <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:4, fontFamily:'var(--font-mono)' }}>
                {weather.tempC}°C · wind {weather.windKmh} km/h {weather.windDir}
              </div>
            )}
            {day.coachSession && (
              <div style={{
                marginTop: 6,
                background: day.coachSession.fallbackUsed ? 'rgba(249,115,22,0.12)' : 'rgba(74,222,128,0.1)',
                border: `1px solid ${day.coachSession.fallbackUsed ? 'rgba(249,115,22,0.35)' : 'rgba(74,222,128,0.35)'}`,
                borderRadius: 6,
                padding: '6px 8px',
              }}>
                <div style={{ fontSize: 10, color: day.coachSession.fallbackUsed ? '#f97316' : '#4ade80', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                  COACH SESSION {day.coachSession.fallbackUsed ? '· FALLBACK' : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {day.coachSession.session}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:10, color:day.color, fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>{day.type}</div>
          {day.targetKm > 0 && (
            <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>~{day.targetKm} km</div>
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
