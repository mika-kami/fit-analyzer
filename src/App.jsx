/**
 * App.jsx — Root orchestrator (production).
 * Screens: 'auth' | 'dashboard' | 'detail'
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth }      from './hooks/useAuth.js';
import { useStrava }    from './hooks/useStrava.js';
import { useWorkouts }  from './hooks/useWorkouts.js';
import { useWorkout }   from './hooks/useWorkout.js';
import { useOpenAI }    from './hooks/useOpenAI.js';
import { useGarmin }    from './hooks/useGarmin.js';
import { useCoachState } from './hooks/useCoachState.js';
import { AuthPage }     from './ui/auth/AuthPage.jsx';
import { Dashboard }    from './ui/Dashboard.jsx';
import { Shell }        from './ui/Shell.jsx';
import { GarminPanel }  from './ui/GarminPanel.jsx';
import { StravaPanel }  from './ui/StravaPanel.jsx';
import { OverviewTab }  from './ui/tabs/OverviewTab.jsx';
import { ChartsTab }    from './ui/tabs/ChartsTab.jsx';
import { MapTab }       from './ui/tabs/MapTab.jsx';
import { ZonesTab }     from './ui/tabs/ZonesTab.jsx';
import { PlanTab }      from './ui/tabs/PlanTab.jsx';
import { ChatTab }      from './ui/tabs/ChatTab.jsx';
import { AnalyticsTab } from './ui/tabs/AnalyticsTab.jsx';
import { LapsTab }      from './ui/tabs/LapsTab.jsx';
import { downloadWorkoutPDF } from './core/pdfReport.js';
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
  const [activeTab,  setActiveTab] = useState('overview');
  const [garminOpen, setGarminOpen] = useState(false);
  const [stravaOpen, setStravaOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'

  const auth     = useAuth();
  const workouts = useWorkouts(auth.user);       // Supabase-backed history
  const workout  = useWorkout();                  // current open workout
  const coach    = useCoachState(auth.user?.id);
  const chat     = useOpenAI(workout.workout, workouts.recentWorkouts);
  const garmin   = useGarmin(async (results) => {
    // Called by useGarmin after /sync — save all new FIT files to DB
    await workouts.saveGarminActivities?.(results);
  });
  const strava   = useStrava(auth.user, () => {
    // Refresh workouts list after Strava sync
    if (auth.user) workouts.reload?.();
  });

  // When file loaded successfully → save + open detail
  useEffect(() => {
    if (workout.status === 'ready' && workout.workout && screen === 'dashboard') {
      setScreen('detail');
      setActiveTab('overview');
      if (auth.user) {
        workouts.saveWorkout(workout.workout);
      }
    }
  }, [workout.status]);

  const handleSelectFromHistory = useCallback((summary) => {
    workout.loadFromSummary(summary);
    setScreen('detail');
    setActiveTab('overview');
  }, [workout]);

  const handleBack = useCallback(() => {
    workout.reset();
    setScreen('dashboard');
    setSaveStatus(null);
  }, [workout]);

  const handleSave = useCallback(async () => {
    if (!workout.workout) return;
    setSaveStatus('saving');
    const ok = await workouts.saveWorkout(workout.workout);
    setSaveStatus(ok ? 'saved' : null);
    setTimeout(() => setSaveStatus(null), 2500);
  }, [workout.workout, workouts]);

  const handleLoadSample = useCallback(() => {
    workout.loadSample();
    setScreen('detail');
    setActiveTab('overview');
  }, [workout]);

  const handleDownloadPdf = useCallback(() => {
    if (!workout.workout) return;
    downloadWorkoutPDF(workout.workout);
  }, [workout.workout]);

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
          await workouts.saveWorkout(w);
        }
        workout.loadFromSummary(w);
        setScreen('detail');
        setActiveTab('overview');
        setStravaOpen(false);
      }} />}

      {screen === 'dashboard' ? (
        <Dashboard
          history={workouts}
          user={auth.user}
          onFile={(f) => workout.loadFile(f, workouts.historicalMaxHr)}
          onSample={handleLoadSample}
          onGarmin={() => setGarminOpen(true)}
          onStrava={() => setStravaOpen(true)}
          stravaStatus={strava.status}
          onSelectWorkout={handleSelectFromHistory}
          onSignOut={auth.signOut}
          isLoading={workout.status === 'loading'}
          loadError={workout.status === 'error' ? workout.error : null}
        />
      ) : (
        <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
          <Shell
            workout={workout.workout}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onReset={handleBack}
            onGarmin={() => setGarminOpen(true)}
            garminStatus={garmin.status}
            onStrava={() => setStravaOpen(true)}
            stravaStatus={strava.status}
            showBack={true}
            onSave={handleSave}
            saveStatus={saveStatus}
            onPDF={handleDownloadPdf}
          />
          <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5)', animation: 'fadeUp 0.3s var(--ease-snappy)' }}>
            {activeTab === 'overview' && <OverviewTab workout={workout.workout} />}
            {activeTab === 'charts'   && <ChartsTab   workout={workout.workout} />}
            {activeTab === 'map'      && <MapTab      workout={workout.workout} />}
            {activeTab === 'zones'    && <ZonesTab    workout={workout.workout} />}
            {activeTab === 'plan'     && <PlanTab     workout={workout.workout} history={workouts} coach={coach} />}
            {activeTab === 'chat'     && <ChatTab     chat={chat} />}
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
    </>
  );
}
