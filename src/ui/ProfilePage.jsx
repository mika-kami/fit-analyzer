import { useEffect, useMemo, useState } from 'react';
import { Card, CardLabel } from './tabs/OverviewTab.jsx';
import { computeReadinessScore, computeTrainingStatus } from '../core/coachEngine.js';

export function ProfilePage({ user, coach, onBack, onSignOut }) {
  const todayIso = coach?.todayIso ?? new Date().toISOString().slice(0, 10);
  const [profileDraft, setProfileDraft] = useState(() => coach?.profile ?? {});
  const [checkinDraft, setCheckinDraft] = useState(() => coach?.getDailyCheckin?.(todayIso) ?? {});

  useEffect(() => {
    setProfileDraft(coach?.profile ?? {});
  }, [coach?.profile]);

  useEffect(() => {
    if (!coach?.getDailyCheckin) return;
    setCheckinDraft(coach.getDailyCheckin(todayIso));
  }, [coach, todayIso]);

  const readiness = useMemo(() => computeReadinessScore(checkinDraft), [checkinDraft]);
  const trainingStatus = useMemo(
    () => computeTrainingStatus({ lastTSB: null, readiness }),
    [readiness]
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: 'var(--sp-4) var(--sp-5)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>
              PROFILE
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              Athlete Profile
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <button
              onClick={onBack}
              style={{
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-2) var(--sp-3)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Back
            </button>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5)', display: 'grid', gap: 'var(--sp-5)' }}>
        <Card>
          <CardLabel>Account</CardLabel>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {user?.email || 'No email'}
          </div>
        </Card>

        <Card>
          <CardLabel>Coach Intelligence Â· Today</CardLabel>
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

        {onSignOut && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onSignOut}
              style={{
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-2) var(--sp-3)',
                color: '#fca5a5',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Logout
            </button>
          </div>
        )}
      </main>
    </div>
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


