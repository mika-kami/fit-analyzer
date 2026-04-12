/**
 * App.jsx -- Root orchestrator (production).
 * Screens: 'auth' | 'dashboard' | 'detail'
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { localDateIso } from './core/format.js';
import { useAuth }      from './hooks/useAuth.js';
import { useStrava }    from './hooks/useStrava.js';
import { useWorkouts }  from './hooks/useWorkouts.js';
import { useWorkout }   from './hooks/useWorkout.js';
import { useOpenAI }    from './hooks/useOpenAI.js';
import { useCoachActions } from './hooks/useCoachActions.js';
import { useGarmin }    from './hooks/useGarmin.js';
import { useCoachState } from './hooks/useCoachState.js';
import { useGear } from './hooks/useGear.js';
import { AuthPage }     from './ui/auth/AuthPage.jsx';
import { Dashboard }    from './ui/Dashboard.jsx';
import { Shell }        from './ui/Shell.jsx';
import { ProfilePage }  from './ui/ProfilePage.jsx';
import { GarminPanel }  from './ui/GarminPanel.jsx';
import { StravaPanel }  from './ui/StravaPanel.jsx';
import { OverviewTab }  from './ui/tabs/OverviewTab.jsx';
import { ChartsTab }    from './ui/tabs/ChartsTab.jsx';
import { MapTab }       from './ui/tabs/MapTab.jsx';
import { ZonesTab }     from './ui/tabs/ZonesTab.jsx';
import { PlanTab }      from './ui/tabs/PlanTab.jsx';
import { AnalyticsTab } from './ui/tabs/AnalyticsTab.jsx';
import { LapsTab }      from './ui/tabs/LapsTab.jsx';
import { CoachPanel } from './ui/CoachPanel.jsx';
import { computeReadinessScore, computeTrainingStatus, analyzePerformanceLimiters, prescribeNextWorkout } from './core/coachEngine.js';
import { calcTrainingLoad } from './core/trainingEngine.js';
import { useAlerts } from './hooks/useAlerts.js';
import { buildDailyBriefing } from './core/coachBriefing.js';
import { buildCoachTake } from './core/coachVerdicts.js';
import { buildPlanDigest } from './core/coachDigest.js';
import { deriveGearStats } from './core/gearModel.js';
import './styles/tokens.css';

const GLOBAL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg-base); color: var(--text-primary); }
  body { font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 2px; }
  input::placeholder { color: var(--text-dim); }
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes pulse   { 0%,80%,100%{opacity:.15} 40%{opacity:1} }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
  @keyframes slideIn { from{transform:translateX(100%)} to{transform:none} }
`;

export default function App() {
  const [screen,     setScreen]    = useState('dashboard');
  const [profileReturnScreen, setProfileReturnScreen] = useState('dashboard');
  const [activeTab,  setActiveTab] = useState('overview');
  const [garminOpen, setGarminOpen] = useState(false);
  const [stravaOpen, setStravaOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [dashboardWeather, setDashboardWeather] = useState(null);
  const [lastCoachAction, setLastCoachAction] = useState('');

  const auth     = useAuth();
  const workout  = useWorkout();                  // current open workout
  const coach    = useCoachState(auth.user?.id);
  const gearState = useGear(auth.user);
  const workouts = useWorkouts(auth.user, coach?.mesocycle, gearState.items);       // Supabase-backed history
  const gear = useMemo(
    () => deriveGearStats(gearState.items, workouts.history ?? []),
    [gearState.items, workouts.history]
  );
  const currentWeekDays = useMemo(() => {
    const weeks = coach?.mesocycle?.weeks ?? [];
    const idx   = coach?.mesocycle?.currentWeekIndex ?? 0;
    return weeks[idx]?.days ?? [];
  }, [coach?.mesocycle]);

  const globalChat = useOpenAI(
    workout.workout,
    workouts.recentWorkouts,
    workouts.getChatHistory,
    workouts.saveChatMessage,
    coach?.athleteDigest,
    {
      mode: 'global',
      attachedWorkout: screen === 'detail' ? workout.workout : null,
      weekDays: currentWeekDays,
    }
  );

  const todayIso = coach?.todayIso ?? localDateIso();
  const todayCheckin = coach?.getDailyCheckin?.(todayIso);
  const readiness = useMemo(() => computeReadinessScore(todayCheckin), [todayCheckin]);
  const load = useMemo(() => calcTrainingLoad(workouts.history ?? []), [workouts.history]);
  const trainingStatus = useMemo(() => computeTrainingStatus({ lastTSB: load, readiness }), [load, readiness]);
  const insights = useMemo(() => analyzePerformanceLimiters({
    workouts: workouts.history ?? [],
    profile: coach?.profile,
    readiness,
    lastTSB: load,
  }), [workouts.history, coach?.profile, readiness, load]);
  const prescription = useMemo(() => prescribeNextWorkout({
    profile: coach?.profile,
    readiness,
    trainingStatus,
    insights,
    weatherScore: todayCheckin?.weatherScore ?? 7,
  }), [coach?.profile, readiness, trainingStatus, insights, todayCheckin?.weatherScore]);

  const { alerts, dismiss: dismissAlert } = useAlerts({
    load,
    readiness,
    historyWorkouts: workouts.history ?? [],
    profile: coach?.profile,
    mesocycle: coach?.mesocycle,
    gear,
    dailyCheckins: coach?.getDailyCheckin ? undefined : {},
  });

  const weekPlan = useMemo(() => {
    const mc = coach?.mesocycle;
    const week = mc?.weeks?.[mc.currentWeekIndex];
    if (week) {
      const activeDays = (week.days ?? []).filter(d => d.type !== 'rest');
      return {
        targetSessions: activeDays.length,
        targetKm: week.targetKm ?? activeDays.reduce((s, d) => s + (d.targetKm ?? 0), 0),
      };
    }
    return { targetSessions: 5, targetKm: Math.max(80, Number(coach?.profile?.weeklyHours ?? 6) * 20) };
  }, [coach?.mesocycle, coach?.profile?.weeklyHours]);

  const briefing = useMemo(() => buildDailyBriefing({
    readiness,
    weather: dashboardWeather,
    prescription,
    history: workouts.history ?? [],
    profile: coach?.profile,
    weekPlan,
    trainingStatus,
    load,
  }), [readiness, dashboardWeather, prescription, workouts.history, coach?.profile, weekPlan, trainingStatus, load]);

  useEffect(() => {
    const key = import.meta.env.VITE_OPENWEATHER_API_KEY ?? '';
    if (!key) return;
    const city = (() => { try { return localStorage.getItem('plan_weather_city') || 'Prague'; } catch { return 'Prague'; } })();
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('q', city);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', key);
    fetch(url.toString())
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) return;
        const windMs = Number(json?.wind?.speed ?? 0);
        setDashboardWeather({
          tempC: Math.round(json?.main?.temp ?? 0),
          feelsLikeC: Math.round(json?.main?.feels_like ?? json?.main?.temp ?? 0),
          windKmh: Math.round(windMs * 3.6),
          windDir: json?.wind?.deg ?? '',
        });
      })
      .catch(() => {});
  }, []);

  const coachActions = useCoachActions(auth.user?.id, () => ({
    workout: workout.workout,
    recentWorkouts: workouts.recentWorkouts?.(10) ?? [],
    readiness,
    athleteDigest: coach?.athleteDigest,
    weather: dashboardWeather,
    targetSport: coach?.profile?.targetSport,
    coachTake: buildCoachTake(workout.workout),
    planDigest: buildPlanDigest(currentWeekDays),
  }));
  const garmin   = useGarmin(async (results) => {
    // Called by useGarmin after /sync → save all new FIT files to DB
    await workouts.saveGarminActivities?.(results);
  });
  const strava   = useStrava(auth.user, () => {
    // Refresh workouts list after Strava sync
    if (auth.user) workouts.reload?.();
  });

  // When file loaded successfully → save + open detail
  useEffect(() => {
    let cancelled = false;
    if (workout.status === 'ready' && workout.workout && screen === 'dashboard') {
      setScreen('detail');
      setActiveTab('overview');
      if (auth.user) {
        workouts.saveWorkout(workout.workout).then((saved) => {
          if (!cancelled && saved) workout.loadFromSummary(saved);
        });
      }
    }
    return () => { cancelled = true; };
  }, [auth.user, screen, workout.status, workout.workout, workout.loadFromSummary, workouts.saveWorkout]);

  const handleSelectFromHistory = useCallback((summary) => {
    workout.loadFromSummary(summary);
    setScreen('detail');
    setActiveTab('overview');
  }, [workout]);

  const handleBack = useCallback(() => {
    workout.reset();
    setScreen('dashboard');
  }, [workout]);

  const handleLoadSample = useCallback(() => {
    workout.loadSample();
    setScreen('detail');
    setActiveTab('overview');
  }, [workout]);

  const handleOpenProfile = useCallback((returnScreen) => {
    setProfileReturnScreen(returnScreen);
    setScreen('profile');
  }, []);

  const handleCloseProfile = useCallback(() => {
    setScreen(profileReturnScreen === 'detail' ? 'detail' : 'dashboard');
  }, [profileReturnScreen]);

  const handleOpenPlans = useCallback(() => {
    setScreen('detail');
    setActiveTab('plan');
  }, []);

  const handleUpdateFuturePlan = useCallback(async () => {
    await coach?.updateFutureMesocycle?.(
      workouts.history ?? [],
      null,
      { targetSport: coach?.mesocycle?.meta?.sport ?? coach?.profile?.targetSport }
    );
    setScreen('detail');
    setActiveTab('plan');
  }, [coach, workouts.history]);

  const handleSaveGearAssignment = useCallback(async (workoutId, gearIds) => {
    const updated = await workouts.updateWorkoutGear?.(workoutId, gearIds);
    if (updated && workout.workout?.id === workoutId) {
      workout.loadFromSummary(updated);
    }
    return updated;
  }, [workout, workouts]);

  const runCoachAction = useCallback(async (actionType) => {
    setCoachOpen(true);
    setLastCoachAction(actionType);
    const result = await coachActions.runAction(actionType);
    if (result) globalChat.inject('assistant', result);
  }, [coachActions, globalChat]);

  // Show loading spinner while checking auth
  if (auth.loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ width: 28, height: 28, border: '2px solid var(--border-mid)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  // Not logged in → Auth screen
  if (!auth.user) return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{GLOBAL_STYLES}</style>
      <AuthPage onSignIn={auth.signIn} onSignUp={auth.signUp} />
    </>
  );

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{GLOBAL_STYLES}</style>

      {garminOpen && (
        <GarminPanel
          garmin={{
            ...garmin,
            // Pass existing garmin_activity_ids so /sync can skip them
            knownGarminIds: workouts.history
              .map(w => w.garminActivityId)
              .filter(Boolean),
          }}
          onClose={() => setGarminOpen(false)}
        />
      )}
     {stravaOpen && <StravaPanel strava={strava} onClose={() => setStravaOpen(false)} onImport={async (w) => {
        if (auth.user) {
          const saved = await workouts.saveWorkout(w);
          workout.loadFromSummary(saved || w);
        } else {
          workout.loadFromSummary(w);
        }
        setScreen('detail');
        setActiveTab('overview');
        setStravaOpen(false);
      }} />}

      {screen === 'dashboard' ? (
        <Dashboard
          history={workouts}
          user={auth.user}
          coach={coach}
          coachBriefing={briefing}
          coachActionLoading={coachActions.loadingAction}
          coachActionResult={coachActions.results?.[lastCoachAction] || ''}
          onCoachAction={runCoachAction}
          onCoachOpen={() => setCoachOpen(true)}
          onFile={(f) => workout.loadFile(f, workouts.historicalMaxHr)}
          onSample={handleLoadSample}
          onProfile={() => handleOpenProfile('dashboard')}
          onPlans={handleOpenPlans}
          onGarmin={() => setGarminOpen(true)}
          onStrava={() => setStravaOpen(true)}
          stravaStatus={strava.status}
          onSelectWorkout={handleSelectFromHistory}
          onSignOut={auth.signOut}
          isLoading={workout.status === 'loading'}
          loadError={workout.status === 'error' ? workout.error : null}
          alerts={alerts}
          onDismissAlert={dismissAlert}
          onUpdateFuturePlan={handleUpdateFuturePlan}
        />
      ) : screen === 'profile' ? (
        <ProfilePage
          user={auth.user}
          coach={coach}
          gear={gear}
          gearLoading={gearState.loading}
          gearError={gearState.error}
          onAddGear={gearState.addGear}
          onUpdateGear={gearState.updateGear}
          onRetireGear={gearState.retireGear}
          onBackfillGear={workouts.backfillGearToHistory}
          onBack={handleCloseProfile}
          onSignOut={auth.signOut}
        />
      ) : (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
          <Shell
            workout={workout.workout}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onProfile={() => handleOpenProfile('detail')}
            onReset={handleBack}
            onGarmin={() => setGarminOpen(true)}
            garminStatus={garmin.status}
            onStrava={() => setStravaOpen(true)}
            stravaStatus={strava.status}
            showBack={true}
          />
          <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5)', animation: 'fadeUp 0.3s var(--ease-snappy)' }}>
            {activeTab === 'overview' && (
              <OverviewTab
                workout={workout.workout}
                history={workouts}
                gear={gear}
                onSaveGearAssignment={handleSaveGearAssignment}
                onSaveCoachAnalysis={workouts.saveCoachAnalysis}
              />
            )}
            {activeTab === 'charts'   && <ChartsTab   workout={workout.workout} />}
            {activeTab === 'map'      && <MapTab      workout={workout.workout} history={workouts} />}
            {activeTab === 'zones'    && <ZonesTab    workout={workout.workout} medicalProfile={coach?.profile?.medical} />}
            {activeTab === 'plan'     && <PlanTab     workout={workout.workout} history={workouts} coach={coach} prescription={prescription} />}
            {activeTab === 'analytics' && (
              <AnalyticsTab
                history={workouts}
                onSelectWorkout={handleSelectFromHistory}
                coach={coach}
                currentWorkout={workout.workout}
              />
            )}
            {activeTab === 'laps'      && <LapsTab      workout={workout.workout} />}
          </main>
        </div>
      )}
      <CoachPanel
        open={coachOpen}
        onToggle={() => setCoachOpen((v) => !v)}
        chat={globalChat}
        contextLabel={screen === 'detail' && workout.workout ? `Attached: ${workout.workout.date} ${workout.workout.sportLabel}` : 'Global conversation'}
        actionButtons={[
          { id: 'plan', label: 'Plan Week', onClick: () => runCoachAction('plan_week') },
          { id: 'wear', label: 'Wear', onClick: () => runCoachAction('wearing') },
          { id: 'recovery', label: 'Recovery', onClick: () => runCoachAction('recovery_check') },
        ]}
      />
    </>
  );
}
