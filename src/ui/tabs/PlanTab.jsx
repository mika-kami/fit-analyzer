/**
 * PlanTab.jsx — 7-day training plan with detraining-aware scheduling.
 * Recomputes live from history. Start-day picker (Today / Tomorrow).
 * Props: { workout, history, coach }
 */
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generateTrainingPlan } from '../../core/trainingEngine.js';
import { Card, CardLabel } from './OverviewTab.jsx';

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
  const point = points.find(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
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
      dt.getMonth()    === target.getMonth()    &&
      dt.getDate()     === target.getDate()
    );
  });
  if (!sameDay.length) return null;

  let best = sameDay[0];
  let bestDiff = Math.abs(((best.dt ?? 0) * 1000) - targetMs);
  for (let i = 1; i < sameDay.length; i++) {
    const diff = Math.abs(((sameDay[i].dt ?? 0) * 1000) - targetMs);
    if (diff < bestDiff) { best = sameDay[i]; bestDiff = diff; }
  }

  const windMs = Number(best?.wind?.speed ?? 0);
  return {
    tempC:        Math.round(best?.main?.temp ?? 0),
    windMs:       parseFloat(windMs.toFixed(1)),
    windKmh:      Math.round(windMs * 3.6),
    windDeg:      best?.wind?.deg ?? null,
    windDir:      windDirection(best?.wind?.deg),
    weatherLabel: best?.weather?.[0]?.main ?? '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

export function PlanContextBanner({ meta }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div style={{
        background: `${phaseColor}10`, border: `1px solid ${phaseColor}30`,
        borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
            TRAINING PHASE
          </div>
          <div style={{ fontSize: 13, color: phaseColor, fontWeight: 600 }}>
            {dt.label}
          </div>
          {dt.daysSince < 999 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Last workout: {dt.daysSince === 0 ? 'today' : `${dt.daysSince} days ago`}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
            WEEK VOLUME
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: phaseColor, fontFamily: 'var(--font-display)' }}>
            ~{meta.targetWeekKm} km
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            base {meta.baseKm} km × {Math.round(100 / meta.baseKm * meta.targetWeekKm)}%
          </div>
        </div>
      </div>

      {(load.ctl > 0 || load.atl > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
          {[
            { label: 'CTL (fitness)',   value: load.ctl.toFixed(1), color: '#60a5fa', sub: 'avg TE/42 days' },
            { label: 'ATL (load)',      value: load.atl.toFixed(1), color: '#f97316', sub: 'avg TE/7 days'  },
            { label: 'TSB (freshness)', value: (load.tsb > 0 ? '+' : '') + load.tsb.toFixed(1), color: tsbColor, sub: load.tsb > 5 ? 'fresh' : load.tsb < -15 ? 'fatigue' : 'neutral' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)', padding: 'var(--sp-2) var(--sp-3)',
            }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: item.color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{item.value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function DayCard({ day, weather, index, revealed }) {
  const highlight = day.current;

  return (
    <div style={{
      background:    highlight ? `${day.color}0d` : 'var(--bg-overlay)',
      border:        `1px solid ${highlight ? `${day.color}35` : 'var(--border-subtle)'}`,
      borderRadius:  'var(--r-md)',
      padding:       'var(--sp-3) var(--sp-4)',
      display:       'flex',
      flexDirection: 'column',
      gap:           'var(--sp-2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start', flex: 1 }}>
          <div style={{ minWidth: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: highlight ? day.color : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
              {day.day}
            </div>
            {day.date && (
              <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{day.date}</div>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {day.label}
              </span>
              {day.current && (
                <span style={{
                  fontSize: 9, color: day.color, fontFamily: 'var(--font-mono)',
                  background: `${day.color}18`, border: `1px solid ${day.color}40`,
                  borderRadius: 4, padding: '2px 6px', letterSpacing: '0.06em',
                }}>TODAY</span>
              )}
            </div>
            {day.desc && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{day.desc}</div>
            )}
            {weather && (
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                {weather.tempC}°C · wind {weather.windKmh} km/h {weather.windDir}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: day.color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{day.type}</div>
          {day.targetKm > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>~{day.targetKm} km</div>
          )}
        </div>
      </div>

      <div style={{ height: 4, background: 'var(--bg-raised)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height:          '100%',
          width:           revealed ? `${day.intensity}%` : '0%',
          background:      highlight ? `linear-gradient(90deg,${day.color}88,${day.color})` : day.color,
          borderRadius:    2,
          transition:      revealed ? 'width 0.6s var(--ease-snappy)' : 'none',
          transitionDelay: revealed ? `${index * 60 + 200}ms` : '0ms',
          boxShadow:       highlight ? `0 0 6px ${day.color}55` : 'none',
        }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════════════════

export function PlanTab({ workout: w, history, coach }) {
  const todayDow    = (new Date().getDay() + 6) % 7;
  const tomorrowDow = (todayDow + 1) % 7;
  const [startDow,   setStartDow]  = useState(todayDow);
  const planStartOffset            = startDow === todayDow ? 0 : 1;
  const [planSport, setPlanSport]  = useState(() => {
    const t = coach?.profile?.targetSport;
    return (t === 'running' || t === 'cycling' || t === 'mixed') ? t : 'mixed';
  });

  const histWorkouts = history?.history ?? [];

  const planWorkout = useMemo(() => {
    if (!w) return w;
    if (planSport === 'running') return { ...w, sport: 'Running', sportLabel: 'Running' };
    if (planSport === 'cycling') return { ...w, sport: 'Cycling', sportLabel: 'Cycling' };
    return w;
  }, [w, planSport]);

  const livePlan      = generateTrainingPlan(planWorkout, histWorkouts, startDow);
  const plan          = livePlan.days ?? [];
  const planMeta      = livePlan.meta;
  const coords        = extractWorkoutCoords(w);
  const profileTarget = coach?.profile?.targetSport || 'mixed';

  // ── Weather ──────────────────────────────────────────────────────────────
  const [weatherSource, setWeatherSource] = useState('workout');
  const [cityInput,     setCityInput]     = useState(() => {
    try { return localStorage.getItem('plan_weather_city') || ''; } catch { return ''; }
  });
  const [cityQuery,  setCityQuery] = useState(cityInput);
  const [weather,    setWeather]   = useState({ loading: false, error: '', days: [], location: '' });

  useEffect(() => {
    if (!OPENWEATHER_API_KEY) return;
    const ctrl = new AbortController();

    async function fetchForecast() {
      setWeather(prev => ({ ...prev, loading: true, error: '' }));
      try {
        let lat, lon;

        if (weatherSource === 'workout' && coords) {
          lat = coords.lat;
          lon = coords.lon;
        } else if (weatherSource === 'city' && cityQuery.trim()) {
          const geoRes  = await fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityQuery.trim())}&limit=1&appid=${OPENWEATHER_API_KEY}`,
            { signal: ctrl.signal }
          );
          const geoData = await geoRes.json();
          if (!geoData?.length) throw new Error('City not found');
          lat = geoData[0].lat;
          lon = geoData[0].lon;
        } else {
          setWeather({ loading: false, error: '', days: [], location: '' });
          return;
        }

        const res  = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`,
          { signal: ctrl.signal }
        );
        const data = await res.json();
        const list = Array.isArray(data?.list) ? data.list : [];
        const days = Array.from({ length: 7 }, (_, i) => pickDailyForecastFrom3h(list, i)).filter(Boolean);
        const location = data?.city?.name || (weatherSource === 'city' ? cityQuery.trim() : 'Workout location');
        setWeather({ loading: false, error: '', days, location });
      } catch (e) {
        if (e.name === 'AbortError') return;
        setWeather({ loading: false, error: e.message || 'Weather load error', days: [], location: '' });
      }
    }

    fetchForecast();
    return () => ctrl.abort();
  }, [coords?.lat, coords?.lon, weatherSource, cityQuery]);

  const applyCity = () => {
    const next = cityInput.trim();
    if (!next) return;
    setWeatherSource('city');
    setCityQuery(next);
    try { localStorage.setItem('plan_weather_city', next); } catch {}
  };

  const [revealed, setRevealed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRevealed(true), 80); return () => clearTimeout(t); }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {planMeta && <PlanContextBanner meta={planMeta} />}

      {/* Plan type selector */}
      <Card style={{ padding: 'var(--sp-3)' }}>
        <CardLabel>Plan Type</CardLabel>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <select
            value={planSport}
            onChange={e => setPlanSport(e.target.value)}
            style={{
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)', padding: '6px 10px',
              color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          START PLAN FROM:
        </span>
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          {[
            { dow: todayDow,    label: 'Today',    sub: DAY_FULL[todayDow]    },
            { dow: tomorrowDow, label: 'Tomorrow', sub: DAY_FULL[tomorrowDow] },
          ].map(opt => (
            <button key={opt.dow} onClick={() => setStartDow(opt.dow)} style={{
              flex: 1,
              background:   startDow === opt.dow ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
              border:       `1px solid ${startDow === opt.dow ? 'rgba(232,168,50,0.45)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all var(--t-base) var(--ease-snappy)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: startDow === opt.dow ? 'var(--accent)' : 'var(--text-primary)' }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {opt.sub}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Day cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {plan.map((day, i) => (
          <DayCard
            key={day.day}
            day={day}
            weather={weather.days[i + planStartOffset]}
            index={i}
            revealed={revealed}
          />
        ))}
      </div>

      {/* Weather card */}
      <Card style={{ padding: 'var(--sp-4) var(--sp-3)' }}>
        <CardLabel>Weather (OpenWeather)</CardLabel>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <button
            onClick={() => setWeatherSource('workout')}
            style={{
              background:   weatherSource === 'workout' ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
              border:       `1px solid ${weatherSource === 'workout' ? 'rgba(232,168,50,0.45)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-sm)', padding: '4px 10px', fontSize: 11,
              color:        weatherSource === 'workout' ? 'var(--accent)' : 'var(--text-secondary)',
              fontFamily:   'var(--font-mono)', cursor: 'pointer',
            }}
          >
            By workout GPS
          </button>
          <button
            onClick={() => setWeatherSource('city')}
            style={{
              background:   weatherSource === 'city' ? 'rgba(96,165,250,0.12)' : 'var(--bg-overlay)',
              border:       `1px solid ${weatherSource === 'city' ? 'rgba(96,165,250,0.35)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-sm)', padding: '4px 10px', fontSize: 11,
              color:        weatherSource === 'city' ? '#60a5fa' : 'var(--text-secondary)',
              fontFamily:   'var(--font-mono)', cursor: 'pointer',
            }}
          >
            By city
          </button>
        </div>

        {weatherSource === 'city' && (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
            <input
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyCity()}
              placeholder="City name…"
              style={{
                flex: 1, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-sm)', padding: '5px 10px',
                color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12,
              }}
            />
            <button
              onClick={applyCity}
              style={{
                background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.35)',
                borderRadius: 'var(--r-sm)', padding: '5px 12px',
                color: '#60a5fa', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
              }}
            >
              Go
            </button>
          </div>
        )}

        {weather.loading && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading weather…</div>
        )}
        {weather.error && (
          <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{weather.error}</div>
        )}
        {!weather.loading && weather.location && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 'var(--sp-2)' }}>
            📍 {weather.location}
          </div>
        )}
        {!weather.loading && weather.days.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', overflowX: 'auto', paddingBottom: 4 }}>
            {weather.days.map((d, i) => (
              <div key={i} style={{
                minWidth: 72, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-sm)', padding: 'var(--sp-2)', flexShrink: 0,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                  {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {d.tempC}°C · {d.weatherLabel || '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  Wind: {d.windKmh} km/h ({d.windMs} m/s), {d.windDir}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Intensity bar chart */}
      <Card style={{ padding: 'var(--sp-4) var(--sp-3) var(--sp-3)' }}>
        <CardLabel>Daily intensity</CardLabel>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={plan} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="day" tick={{ fill: '#3a3d4e', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#3a3d4e', fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--border-mid)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
              labelStyle={{ color: 'var(--text-muted)' }}
              itemStyle={{ color: 'var(--text-secondary)' }}
              formatter={(v, _, p) => [`${v}%`, p.payload.label]}
            />
            <Bar dataKey="intensity" radius={[3, 3, 0, 0]}>
              {plan.map((d, i) => <Cell key={i} fill={d.current ? '#e8a832' : d.color} opacity={d.current ? 1 : 0.75} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Weekly goals */}
      <Card>
        <CardLabel>Weekly goals</CardLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          {[
            { icon: '📏', label: 'Target volume',   value: planMeta ? `~${planMeta.targetWeekKm} km` : '—' },
            { icon: '💚', label: 'Z1-Z2 share',      value: planMeta?.phase === 'too_easy' ? '≥ 65%' : '≥ 75%' },
            { icon: '⚡', label: 'Intense sessions', value: ['overreached', 'base_rebuild', 'full_restart'].includes(planMeta?.phase) ? '0' : '1–2' },
            { icon: '😴', label: 'Rest days',        value: ['overreached', 'full_restart'].includes(planMeta?.phase) ? '2–3' : '1–2' },
          ].map(g => (
            <div key={g.label} style={{
              background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)', padding: 'var(--sp-3)',
              display: 'flex', gap: 'var(--sp-3)', alignItems: 'center',
            }}>
              <span style={{ fontSize: 20 }}>{g.icon}</span>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{g.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{g.value}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}