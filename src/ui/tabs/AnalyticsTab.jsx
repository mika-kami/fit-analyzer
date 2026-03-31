/**
 * AnalyticsTab.jsx — Training analytics: CTL/ATL/TSB, Aerobic Efficiency, TE trend.
 * Props: { history, onSelectWorkout }
 */
import { useState, useMemo, useEffect } from 'react';
import {
  ComposedChart, Area, Bar, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { Card, CardLabel } from './OverviewTab.jsx';
import {
  buildDailyStress, computeATL, computeCTL, computeTSB,
  detectFormState, predictPeakForm, computeAET, computeTETrend,
} from '../../core/analyticsEngine.js';
import {
  computeReadinessScore,
  computeTrainingStatus,
  analyzePerformanceLimiters,
  prescribeNextWorkout,
  defaultWorkoutReflection,
} from '../../core/coachEngine.js';

const GRID_COLOR = 'rgba(255,255,255,0.04)';
const TICK_COLOR = '#3a3d4e';
const TICK_STYLE = { fill: TICK_COLOR, fontSize: 10, fontFamily: 'var(--font-mono)' };

const SPORT_COLOR = {
  Cycling: '#60a5fa', 'E-Biking': '#60a5fa',
  Running: '#f97316', Walking: '#f97316', Hiking: '#f97316',
};
function sportColor(sport) { return SPORT_COLOR[sport] ?? '#a78bfa'; }

function fmtShortDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${+d}.${+m}`;
}

// ── Main Component ───────────────────────────────────────────────────────────
export function AnalyticsTab({ history, onSelectWorkout, coach, currentWorkout }) {
  const [period, setPeriod] = useState(90);
  const workouts = history?.history ?? [];
  const loading = history?.loadingDb;

  // ── Compute all analytics ──────────────────────────────────────────────────
  const dailyStress = useMemo(() => buildDailyStress(workouts), [workouts]);

  const tsbSeries = useMemo(() => {
    const ctl = computeCTL(dailyStress, period);
    const atl = computeATL(dailyStress, period);
    return computeTSB(ctl, atl);
  }, [dailyStress, period]);

  const formState = useMemo(() => {
    if (!tsbSeries.length) return detectFormState(0, 0);
    const last = tsbSeries[tsbSeries.length - 1];
    return detectFormState(last.tsb, last.ctl);
  }, [tsbSeries]);

  const peak = useMemo(() => predictPeakForm(tsbSeries), [tsbSeries]);

  const teTrend = useMemo(() => computeTETrend(workouts), [workouts]);

  // AET: auto-detect sport band from history
  const aetData = useMemo(() => {
    const hasCycling = workouts.some(w => (w.sport ?? w.sportLabel) === 'Cycling');
    const lo = hasCycling ? 22 : 9;
    const hi = hasCycling ? 28 : 12;
    return { points: computeAET(workouts, lo, hi), lo, hi };
  }, [workouts]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const lastTSB = tsbSeries.length ? tsbSeries[tsbSeries.length - 1] : null;
  const todayIso = coach?.todayIso ?? new Date().toISOString().slice(0, 10);

  const [profileDraft, setProfileDraft] = useState(() => coach?.profile ?? {});
  const [checkinDraft, setCheckinDraft] = useState(() => coach?.getDailyCheckin?.(todayIso) ?? {});
  const [noteDraft, setNoteDraft] = useState(() => {
    if (!coach || !currentWorkout) return defaultWorkoutReflection(currentWorkout);
    return coach.getWorkoutNote(currentWorkout);
  });

  useEffect(() => {
    setProfileDraft(coach?.profile ?? {});
  }, [coach?.profile]);

  useEffect(() => {
    if (!coach?.getDailyCheckin) return;
    setCheckinDraft(coach.getDailyCheckin(todayIso));
  }, [coach, todayIso]);

  useEffect(() => {
    if (!currentWorkout) {
      setNoteDraft(defaultWorkoutReflection(currentWorkout));
      return;
    }
    if (!coach?.getWorkoutNote) {
      setNoteDraft(defaultWorkoutReflection(currentWorkout));
      return;
    }
    setNoteDraft(coach.getWorkoutNote(currentWorkout));
  }, [coach, currentWorkout?.id, currentWorkout?.date]);

  const readiness = useMemo(
    () => computeReadinessScore(checkinDraft),
    [checkinDraft]
  );
  const trainingStatus = useMemo(
    () => computeTrainingStatus({ lastTSB, readiness }),
    [lastTSB, readiness]
  );
  const insights = useMemo(
    () => analyzePerformanceLimiters({ workouts, profile: profileDraft, readiness, lastTSB }),
    [workouts, profileDraft, readiness, lastTSB]
  );
  const nextWorkout = useMemo(
    () => prescribeNextWorkout({
      profile: profileDraft,
      readiness,
      trainingStatus,
      insights,
      weatherScore: checkinDraft?.weatherScore ?? 70,
    }),
    [profileDraft, readiness, trainingStatus, insights, checkinDraft?.weatherScore]
  );

  const workoutNoteKey = currentWorkout?.id
    ? String(currentWorkout.id)
    : currentWorkout?.date
      ? `date:${currentWorkout.date}`
      : null;

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{
          width: 28, height: 28, border: '2px solid var(--border-mid)',
          borderTopColor: 'var(--accent)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <CoachStatusCard readiness={readiness} trainingStatus={trainingStatus} />
      <AthleteProfileCard
        profile={profileDraft}
        onChange={setProfileDraft}
        onSave={() => coach?.saveProfile?.(profileDraft)}
      />
      <ReadinessCheckinCard
        checkin={checkinDraft}
        onChange={setCheckinDraft}
        onSave={() => coach?.saveDailyCheckin?.(todayIso, checkinDraft)}
      />
      <WorkoutReflectionCard
        workout={currentWorkout}
        note={noteDraft}
        onChange={setNoteDraft}
        onSave={() => {
          if (!workoutNoteKey) return;
          coach?.saveWorkoutNote?.(workoutNoteKey, noteDraft);
        }}
      />
      <InsightsCard title="Key Limiters" items={insights.limiters} />
      <InsightsCard title="Performance Opportunities" items={insights.opportunities} />
      <WorkoutPrescriptionCard workout={nextWorkout} />

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[30, 60, 90, 180].map(d => (
          <button key={d} onClick={() => setPeriod(d)} style={{
            background: period === d ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
            border: `1px solid ${period === d ? 'rgba(232,168,50,0.4)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--r-sm)', padding: '3px 10px',
            color: period === d ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer',
          }}>{d}д</button>
        ))}
      </div>

      {/* Form Summary Card */}
      <FormSummaryCard lastTSB={lastTSB} formState={formState} peak={peak} workoutCount={workouts.length} />

      {/* Load Chart */}
      <Card>
        <CardLabel>CTL / ATL / TSB</CardLabel>
        <LoadChart data={tsbSeries} />
      </Card>

      {/* AET Chart */}
      <Card>
        <CardLabel>Аэробная эффективность</CardLabel>
        <AETChart data={aetData.points} lo={aetData.lo} hi={aetData.hi} />
      </Card>

      {/* TE Trend Chart */}
      <Card>
        <CardLabel>Тренировочный эффект</CardLabel>
        <TETrendChart data={teTrend} workouts={workouts} onSelectWorkout={onSelectWorkout} />
      </Card>
    </div>
  );
}

function CoachStatusCard({ readiness, trainingStatus }) {
  return (
    <Card>
      <CardLabel>Coach Intelligence · Today</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <div style={{
          background: `${readiness.color}14`,
          border: `1px solid ${readiness.color}35`,
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-3)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>READINESS</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 28, lineHeight: 1, color: readiness.color, fontFamily: 'var(--font-display)', fontWeight: 600 }}>{readiness.score}</span>
            <span style={{ fontSize: 12, color: readiness.color, fontFamily: 'var(--font-mono)' }}>{readiness.label}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>{readiness.reason}</div>
        </div>

        <div style={{
          background: `${trainingStatus.color}12`,
          border: `1px solid ${trainingStatus.color}35`,
          borderRadius: 'var(--r-md)',
          padding: 'var(--sp-3)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>TRAINING STATUS</div>
          <div style={{ fontSize: 16, color: trainingStatus.color, fontWeight: 600 }}>{trainingStatus.label}</div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{trainingStatus.summary}</div>
        </div>
      </div>
    </Card>
  );
}

function AthleteProfileCard({ profile, onChange, onSave }) {
  return (
    <Card>
      <CardLabel>Athlete Profile</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Target Sport">
          <select value={profile.targetSport ?? 'mixed'} onChange={e => onChange(p => ({ ...p, targetSport: e.target.value }))} style={inputStyle}>
            <option value="mixed">Mixed</option>
            <option value="running">Running</option>
            <option value="cycling">Cycling</option>
          </select>
        </Field>
        <Field label="Weekly Hours">
          <input type="number" min="1" max="30" value={profile.weeklyHours ?? 6} onChange={e => onChange(p => ({ ...p, weeklyHours: Number(e.target.value || 0) }))} style={inputStyle} />
        </Field>
        <Field label="Primary Goal">
          <input value={profile.primaryGoal ?? ''} onChange={e => onChange(p => ({ ...p, primaryGoal: e.target.value }))} style={inputStyle} placeholder="Half marathon, 100km ride..." />
        </Field>
        <Field label="Goal Date">
          <input type="date" value={profile.goalDate ?? ''} onChange={e => onChange(p => ({ ...p, goalDate: e.target.value }))} style={inputStyle} />
        </Field>
      </div>
      <div style={{ marginTop: 'var(--sp-2)', display: 'grid', gap: 'var(--sp-2)' }}>
        <Field label="Constraints">
          <input value={profile.constraints ?? ''} onChange={e => onChange(p => ({ ...p, constraints: e.target.value }))} style={inputStyle} placeholder="Travel, limited weekdays, etc." />
        </Field>
        <Field label="Injury Notes">
          <input value={profile.injuryNotes ?? ''} onChange={e => onChange(p => ({ ...p, injuryNotes: e.target.value }))} style={inputStyle} placeholder="Achilles, knee, lower back..." />
        </Field>
      </div>
      <SaveRow onSave={onSave} />
    </Card>
  );
}

function ReadinessCheckinCard({ checkin, onChange, onSave }) {
  const set = (k, v) => onChange(prev => ({ ...prev, [k]: v }));
  return (
    <Card>
      <CardLabel>Daily Readiness Check-in</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Sleep Score (0-100)">
          <input type="number" min="0" max="100" value={checkin.sleepScore ?? 70} onChange={e => set('sleepScore', Number(e.target.value || 0))} style={inputStyle} />
        </Field>
        <Field label="Health Score (0-100)">
          <input type="number" min="0" max="100" value={checkin.healthScore ?? 75} onChange={e => set('healthScore', Number(e.target.value || 0))} style={inputStyle} />
        </Field>
        <Field label="Weather Score (0-100)">
          <input type="number" min="0" max="100" value={checkin.weatherScore ?? 70} onChange={e => set('weatherScore', Number(e.target.value || 0))} style={inputStyle} />
        </Field>
        <Field label="Energy (1-10)">
          <input type="number" min="1" max="10" value={checkin.energy ?? 6} onChange={e => set('energy', Number(e.target.value || 1))} style={inputStyle} />
        </Field>
        <Field label="Motivation (1-10)">
          <input type="number" min="1" max="10" value={checkin.motivation ?? 7} onChange={e => set('motivation', Number(e.target.value || 1))} style={inputStyle} />
        </Field>
        <Field label="Sleep Hours">
          <input type="number" min="0" max="14" step="0.1" value={checkin.sleepHours ?? 7.5} onChange={e => set('sleepHours', Number(e.target.value || 0))} style={inputStyle} />
        </Field>
        <Field label="Soreness (1-10)">
          <input type="number" min="1" max="10" value={checkin.soreness ?? 3} onChange={e => set('soreness', Number(e.target.value || 1))} style={inputStyle} />
        </Field>
        <Field label="Stress (1-10)">
          <input type="number" min="1" max="10" value={checkin.stress ?? 4} onChange={e => set('stress', Number(e.target.value || 1))} style={inputStyle} />
        </Field>
        <Field label="Resting HR Delta (bpm)">
          <input type="number" min="-20" max="30" value={checkin.restingHrDelta ?? 0} onChange={e => set('restingHrDelta', Number(e.target.value || 0))} style={inputStyle} />
        </Field>
      </div>
      <SaveRow onSave={onSave} />
    </Card>
  );
}

function WorkoutReflectionCard({ workout, note, onChange, onSave }) {
  const disabled = !workout;
  const set = (k, v) => onChange(prev => ({ ...prev, [k]: v }));
  return (
    <Card>
      <CardLabel>Post-Workout Reflection</CardLabel>
      {!workout && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Open a workout to add reflection notes.
        </div>
      )}
      {workout && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 'var(--sp-2)' }}>
            {workout.date} · {workout.sportLabel}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
            <Field label="Purpose">
              <input value={note.purpose ?? ''} onChange={e => set('purpose', e.target.value)} style={inputStyle} placeholder="Recovery, threshold, long endurance..." />
            </Field>
            <Field label="RPE (1-10)">
              <input type="number" min="1" max="10" value={note.rpe ?? 6} onChange={e => set('rpe', Number(e.target.value || 1))} style={inputStyle} />
            </Field>
            <Field label="Pain (1-10)">
              <input type="number" min="1" max="10" value={note.pain ?? 1} onChange={e => set('pain', Number(e.target.value || 1))} style={inputStyle} />
            </Field>
          </div>
          <div style={{ marginTop: 'var(--sp-2)', display: 'grid', gap: 'var(--sp-2)' }}>
            <Field label="How it felt">
              <input value={note.felt ?? ''} onChange={e => set('felt', e.target.value)} style={inputStyle} placeholder="Legs heavy after 40 min, stable HR, etc." />
            </Field>
            <Field label="Coach Notes">
              <textarea value={note.notes ?? ''} onChange={e => set('notes', e.target.value)} style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} placeholder="Any symptoms, fueling issues, terrain notes..." />
            </Field>
          </div>
        </>
      )}
      <SaveRow onSave={onSave} disabled={disabled} />
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg-raised)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--r-sm)',
  padding: '6px 8px',
  fontSize: 12,
  fontFamily: 'var(--font-body)',
};

function SaveRow({ onSave, disabled = false }) {
  return (
    <div style={{ marginTop: 'var(--sp-3)', display: 'flex', justifyContent: 'flex-end' }}>
      <button
        onClick={onSave}
        disabled={disabled}
        style={{
          background: disabled ? 'var(--bg-raised)' : 'rgba(232,168,50,0.12)',
          border: `1px solid ${disabled ? 'var(--border-subtle)' : 'rgba(232,168,50,0.4)'}`,
          borderRadius: 'var(--r-sm)',
          color: disabled ? 'var(--text-muted)' : 'var(--accent)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          padding: '5px 10px',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        Save
      </button>
    </div>
  );
}

function InsightsCard({ title, items = [] }) {
  return (
    <Card>
      <CardLabel>{title}</CardLabel>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        {items.map((item, i) => (
          <div key={`${item.key || item.title}-${i}`} style={{
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            padding: 'var(--sp-3)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{item.evidence}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{item.action}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WorkoutPrescriptionCard({ workout }) {
  if (!workout) return null;
  return (
    <Card>
      <CardLabel>Workout Prescription (Phase 2)</CardLabel>
      <div style={{
        background: 'rgba(74,222,128,0.08)',
        border: '1px solid rgba(74,222,128,0.3)',
        borderRadius: 'var(--r-md)',
        padding: 'var(--sp-3)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>{workout.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{workout.objective}</div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6 }}>{workout.session}</div>
      </div>
      <div style={{ marginTop: 'var(--sp-3)', display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>WHY THIS SESSION</div>
        {(workout.why || []).map((w, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>• {w}</div>
        ))}
      </div>
    </Card>
  );
}

// ── Form Summary Card ────────────────────────────────────────────────────────
function FormSummaryCard({ lastTSB, formState, peak, workoutCount }) {
  if (workoutCount < 14) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 'var(--sp-4)', color: 'var(--text-muted)', fontSize: 13 }}>
          Нужно минимум 14 тренировок для анализа нагрузки
          <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-dim)' }}>
            Сейчас: {workoutCount}
          </div>
        </div>
      </Card>
    );
  }

  const ctl = lastTSB?.ctl ?? 0;
  const atl = lastTSB?.atl ?? 0;
  const tsb = lastTSB?.tsb ?? 0;

  return (
    <Card>
      {/* Overload warning */}
      {tsb < -20 && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--r-sm)', padding: 'var(--sp-2) var(--sp-3)',
          fontSize: 11, color: '#ef4444', fontFamily: 'var(--font-mono)',
          marginBottom: 'var(--sp-4)', textAlign: 'center',
        }}>
          Высокий риск перетренированности
        </div>
      )}

      {/* Numbers row */}
      <div style={{ display: 'flex', gap: 'var(--sp-5)', justifyContent: 'center', marginBottom: 'var(--sp-4)' }}>
        <MetricBlock label="CTL" value={ctl.toFixed(1)} color="#60a5fa" />
        <MetricBlock label="ATL" value={atl.toFixed(1)} color="#f97316" />
        <MetricBlock label="TSB" value={tsb.toFixed(1)} color={tsb >= 0 ? '#4ade80' : '#ef4444'} />
      </div>

      {/* Status label */}
      <div style={{ textAlign: 'center' }}>
        <span style={{
          display: 'inline-block',
          background: `${formState.color}18`,
          border: `1px solid ${formState.color}40`,
          borderRadius: 'var(--r-sm)',
          padding: '3px 12px',
          fontSize: 12, fontWeight: 600, color: formState.color,
          fontFamily: 'var(--font-mono)',
        }}>
          {formState.label}
        </span>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {formState.description}
        </div>
      </div>

      {/* Peak prediction */}
      {peak.date && (
        <div style={{
          textAlign: 'center', marginTop: 'var(--sp-3)',
          fontSize: 11, color: '#4ade80', fontFamily: 'var(--font-mono)',
        }}>
          Пик формы: {peak.date} ({peak.daysUntil} дн.)
        </div>
      )}
    </Card>
  );
}

function MetricBlock({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color, fontFamily: 'var(--font-display)', lineHeight: 1, letterSpacing: '-0.03em' }}>
        {value}
      </div>
    </div>
  );
}

// ── Load Chart (CTL/ATL/TSB) ─────────────────────────────────────────────────
function LoadChart({ data }) {
  if (!data.length) return <EmptyState text="Недостаточно данных" />;

  // Thin out ticks — show every ~14 days
  const tickInterval = Math.max(1, Math.floor(data.length / (data.length / 14)));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradCTL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradATL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis
          dataKey="date" tick={TICK_STYLE} tickFormatter={fmtShortDate}
          interval={tickInterval} axisLine={false} tickLine={false}
        />
        <YAxis domain={[-30, 60]} tick={TICK_STYLE} axisLine={false} tickLine={false} width={36} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
        <Tooltip content={<LoadTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="ctl" stroke="#60a5fa" strokeWidth={1.5} fill="url(#gradCTL)" dot={false} name="CTL" />
        <Area type="monotone" dataKey="atl" stroke="#f97316" strokeWidth={1.5} fill="url(#gradATL)" dot={false} name="ATL" />
        <Bar dataKey="tsb" name="TSB" barSize={3} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.tsb >= 0 ? 'rgba(74,222,128,0.6)' : 'rgba(239,68,68,0.5)'} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function LoadTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: 'var(--bg-raised)', border: '1px solid var(--border-mid)',
      borderRadius: 'var(--r-md)', padding: '8px 12px',
      fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{d.date}</div>
      <div style={{ color: '#60a5fa' }}>CTL: {d.ctl?.toFixed(1)}</div>
      <div style={{ color: '#f97316' }}>ATL: {d.atl?.toFixed(1)}</div>
      <div style={{ color: d.tsb >= 0 ? '#4ade80' : '#ef4444' }}>TSB: {d.tsb?.toFixed(1)}</div>
    </div>
  );
}

// ── AET Chart ────────────────────────────────────────────────────────────────
function AETChart({ data, lo, hi }) {
  if (data.length < 5) {
    return (
      <>
        <EmptyState text="Недостаточно данных. Нужно 5+ тренировок с данными Z2." />
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'center', marginTop: 4 }}>
          Z2 скорость: {lo}–{hi} км/ч
        </div>
      </>
    );
  }

  // Build chart data with rolling avg
  const chartData = data.map((p, idx) => {
    const windowStart = new Date(p.date);
    windowStart.setDate(windowStart.getDate() - 14);
    const inWindow = data.filter((s, i) => i <= idx && new Date(s.date) >= windowStart);
    const avg = inWindow.reduce((s, x) => s + x.avgHr, 0) / inWindow.length;
    return { ...p, rollingAvg: parseFloat(avg.toFixed(1)), index: idx };
  });

  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis dataKey="date" tick={TICK_STYLE} tickFormatter={fmtShortDate} axisLine={false} tickLine={false} />
          <YAxis
            tick={TICK_STYLE} axisLine={false} tickLine={false} width={36}
            label={{ value: 'уд/мин', angle: -90, position: 'insideLeft', style: { fill: TICK_COLOR, fontSize: 9, fontFamily: 'var(--font-mono)' } }}
          />
          <Tooltip content={<AETTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }} />
          <Scatter dataKey="avgHr" isAnimationActive={false}>
            {chartData.map((p, i) => (
              <Cell key={i} fill={sportColor(p.sport)} r={4} />
            ))}
          </Scatter>
          <Line type="monotone" dataKey="rollingAvg" stroke="#a78bfa" strokeWidth={2} dot={false} name="14д среднее" />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'center', marginTop: 4 }}>
        Z2 скорость: {lo}–{hi} км/ч
      </div>
    </>
  );
}

function AETTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: 'var(--bg-raised)', border: '1px solid var(--border-mid)',
      borderRadius: 'var(--r-md)', padding: '8px 12px',
      fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{d.date} · {d.sport}</div>
      <div>Ср. ЧСС: <span style={{ color: sportColor(d.sport) }}>{d.avgHr}</span> уд/мин</div>
    </div>
  );
}

// ── TE Trend Chart ───────────────────────────────────────────────────────────
function TETrendChart({ data, workouts, onSelectWorkout }) {
  if (!data.length) return <EmptyState text="Недостаточно данных о тренировочном эффекте" />;

  const handleDotClick = (entry) => {
    if (!entry?.id || !onSelectWorkout) return;
    const w = workouts.find(w => w.id === entry.id);
    if (w) onSelectWorkout(w);
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="date" tick={TICK_STYLE} tickFormatter={fmtShortDate} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 5]} tick={TICK_STYLE} axisLine={false} tickLine={false} width={36} />
        <ReferenceLine y={2.0} stroke="#6b7280" strokeDasharray="4 4" label={{ value: 'Поддержание', fill: '#6b7280', fontSize: 9, fontFamily: 'var(--font-mono)', position: 'right' }} />
        <ReferenceLine y={4.0} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Перегрузка', fill: '#ef4444', fontSize: 9, fontFamily: 'var(--font-mono)', position: 'right' }} />
        <Tooltip content={<TETooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }} />
        <Scatter dataKey="te" isAnimationActive={false} onClick={(_, __, entry) => handleDotClick(entry)} style={{ cursor: 'pointer' }}>
          {data.map((p, i) => (
            <Cell key={i} fill={sportColor(p.sport)} r={4} />
          ))}
        </Scatter>
        <Line type="monotone" dataKey="rollingAvg" stroke="#a78bfa" strokeWidth={2} dot={false} name="14д среднее" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function TETooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: 'var(--bg-raised)', border: '1px solid var(--border-mid)',
      borderRadius: 'var(--r-md)', padding: '8px 12px',
      fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
    }}>
      {d.date} · {d.sport} · TE <span style={{ color: sportColor(d.sport), fontWeight: 600 }}>{d.te?.toFixed(1)}</span>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ text }) {
  return (
    <div style={{
      height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)',
    }}>
      {text}
    </div>
  );
}
