import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardLabel } from './tabs/OverviewTab.jsx';
import { computeReadinessScore, computeTrainingStatus } from '../core/coachEngine.js';
import { supabase } from '../lib/supabase.js';

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

        <AthleteProfileCard
          profile={profileDraft}
          onChange={setProfileDraft}
          onSave={() => coach?.saveProfile?.(profileDraft)}
        />

        <MedicalProfileCard
          medical={profileDraft.medical ?? {}}
          onChange={med => setProfileDraft(p => ({ ...p, medical: { ...(p.medical ?? {}), ...med } }))}
          onSave={() => coach?.saveProfile?.(profileDraft)}
        />

        <MedicalDocumentsCard userId={user?.id} />

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

// ── Athlete Profile Card ──────────────────────────────────────────────────────

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

// ── Medical Profile Card ──────────────────────────────────────────────────────

const SECTION_HEADER = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--accent)',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.06em',
  marginTop: 'var(--sp-3)',
  marginBottom: 'var(--sp-1)',
  paddingBottom: 4,
  borderBottom: '1px solid var(--border-subtle)',
};

function MedicalProfileCard({ medical, onChange, onSave }) {
  const m = medical ?? {};
  const set = (k, v) => onChange({ [k]: v });

  return (
    <Card>
      <CardLabel>Medical Profile</CardLabel>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--sp-2)', lineHeight: 1.5 }}>
        This information helps the AI coach adjust training intensity, recovery, and safety recommendations.
        All data is private and stored securely.
      </div>

      {/* Cardiovascular */}
      <div style={SECTION_HEADER}>CARDIOVASCULAR</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Resting HR (bpm)">
          <input type="number" min="30" max="120" value={m.restingHr ?? ''} onChange={e => set('restingHr', e.target.value)} style={inputStyle} placeholder="e.g. 52" />
        </Field>
        <Field label="Max HR tested (bpm)">
          <input type="number" min="100" max="230" value={m.maxHrTested ?? ''} onChange={e => set('maxHrTested', e.target.value)} style={inputStyle} placeholder="From stress test" />
        </Field>
        <Field label="Blood Pressure">
          <input value={m.bloodPressure ?? ''} onChange={e => set('bloodPressure', e.target.value)} style={inputStyle} placeholder="120/80" />
        </Field>
      </div>
      <div style={{ marginTop: 'var(--sp-2)' }}>
        <Field label="Known cardiac conditions">
          <input value={m.knownCardiacConditions ?? ''} onChange={e => set('knownCardiacConditions', e.target.value)} style={inputStyle} placeholder="None, or describe..." />
        </Field>
      </div>

      {/* Respiratory */}
      <div style={SECTION_HEADER}>RESPIRATORY</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Asthma">
          <select value={m.asthma ? 'yes' : 'no'} onChange={e => set('asthma', e.target.value === 'yes')} style={inputStyle}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Exercise-induced bronchoconstriction">
          <select value={m.exerciseInducedBronchoconstriction ? 'yes' : 'no'} onChange={e => set('exerciseInducedBronchoconstriction', e.target.value === 'yes')} style={inputStyle}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 'var(--sp-2)' }}>
        <Field label="Respiratory notes">
          <input value={m.respiratoryNotes ?? ''} onChange={e => set('respiratoryNotes', e.target.value)} style={inputStyle} placeholder="Seasonal allergies, COPD history..." />
        </Field>
      </div>

      {/* Musculoskeletal */}
      <div style={SECTION_HEADER}>MUSCULOSKELETAL</div>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <Field label="Current injuries">
          <input value={m.currentInjuries ?? ''} onChange={e => set('currentInjuries', e.target.value)} style={inputStyle} placeholder="Active issues affecting training..." />
        </Field>
        <Field label="Past surgeries">
          <input value={m.pastSurgeries ?? ''} onChange={e => set('pastSurgeries', e.target.value)} style={inputStyle} placeholder="ACL reconstruction 2019, meniscus 2021..." />
        </Field>
        <Field label="Chronic conditions">
          <input value={m.chronicConditions ?? ''} onChange={e => set('chronicConditions', e.target.value)} style={inputStyle} placeholder="IT band syndrome, plantar fasciitis..." />
        </Field>
        <Field label="Mobility limitations">
          <input value={m.mobilityLimitations ?? ''} onChange={e => set('mobilityLimitations', e.target.value)} style={inputStyle} placeholder="Limited ankle dorsiflexion, hip flexor..." />
        </Field>
      </div>

      {/* Metabolic */}
      <div style={SECTION_HEADER}>METABOLIC & ENDOCRINE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Diabetes">
          <select value={m.diabetes ?? 'none'} onChange={e => set('diabetes', e.target.value)} style={inputStyle}>
            <option value="none">None</option>
            <option value="type1">Type 1</option>
            <option value="type2">Type 2</option>
            <option value="prediabetes">Prediabetes</option>
          </select>
        </Field>
        <Field label="Thyroid condition">
          <input value={m.thyroidCondition ?? ''} onChange={e => set('thyroidCondition', e.target.value)} style={inputStyle} placeholder="None, hypothyroid..." />
        </Field>
        <Field label="Iron deficiency">
          <select value={m.ironDeficiency ? 'yes' : 'no'} onChange={e => set('ironDeficiency', e.target.value === 'yes')} style={inputStyle}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>

      {/* Medications */}
      <div style={SECTION_HEADER}>MEDICATIONS & SUPPLEMENTS</div>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <Field label="Current medications">
          <textarea value={m.currentMedications ?? ''} onChange={e => set('currentMedications', e.target.value)} style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} placeholder="Beta-blockers, statins, inhaler..." />
        </Field>
        <Field label="Supplements">
          <input value={m.supplements ?? ''} onChange={e => set('supplements', e.target.value)} style={inputStyle} placeholder="Iron, vitamin D, creatine, caffeine..." />
        </Field>
        <Field label="Allergies (drug/food/env)">
          <input value={m.allergies ?? ''} onChange={e => set('allergies', e.target.value)} style={inputStyle} placeholder="Penicillin, nuts, pollen..." />
        </Field>
      </div>

      {/* Lifestyle */}
      <div style={SECTION_HEADER}>LIFESTYLE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Smoking status">
          <select value={m.smokingStatus ?? 'never'} onChange={e => set('smokingStatus', e.target.value)} style={inputStyle}>
            <option value="never">Never</option>
            <option value="former">Former</option>
            <option value="current">Current</option>
          </select>
        </Field>
        <Field label="Alcohol frequency">
          <input value={m.alcoholFrequency ?? ''} onChange={e => set('alcoholFrequency', e.target.value)} style={inputStyle} placeholder="Occasional, 2-3/week..." />
        </Field>
        <Field label="Sleep disorders">
          <input value={m.sleepDisorders ?? ''} onChange={e => set('sleepDisorders', e.target.value)} style={inputStyle} placeholder="Sleep apnea, insomnia..." />
        </Field>
      </div>

      {/* Sport-specific medical */}
      <div style={SECTION_HEADER}>SPORT-SPECIFIC TESTING</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Last stress test">
          <input type="date" value={m.lastStressTest ?? ''} onChange={e => set('lastStressTest', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Last bloodwork">
          <input type="date" value={m.lastBloodwork ?? ''} onChange={e => set('lastBloodwork', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Last ECG">
          <input type="date" value={m.lastEcg ?? ''} onChange={e => set('lastEcg', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="VO2max tested (ml/kg/min)">
          <input type="number" min="15" max="90" step="0.1" value={m.vo2maxTested ?? ''} onChange={e => set('vo2maxTested', e.target.value)} style={inputStyle} placeholder="e.g. 55.2" />
        </Field>
        <Field label="Lactate threshold (bpm or W)">
          <input value={m.lactateThreshold ?? ''} onChange={e => set('lactateThreshold', e.target.value)} style={inputStyle} placeholder="168 bpm or 280 W" />
        </Field>
      </div>

      {/* Freetext */}
      <div style={SECTION_HEADER}>ADDITIONAL NOTES</div>
      <Field label="Anything else the coach should know">
        <textarea value={m.doctorNotes ?? ''} onChange={e => set('doctorNotes', e.target.value)} style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} placeholder="Recent illness, family history of cardiac events, heat intolerance..." />
      </Field>

      <SaveRow onSave={onSave} />
    </Card>
  );
}

// ── Medical Documents Card ────────────────────────────────────────────────────

const DOC_CATEGORIES = [
  { value: 'lab_results',  label: 'Lab Results' },
  { value: 'ecg',          label: 'ECG / EKG' },
  { value: 'imaging',      label: 'Imaging (X-ray, MRI)' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'discharge',    label: 'Discharge Summary' },
  { value: 'referral',     label: 'Referral Letter' },
  { value: 'other',        label: 'Other' },
];

function MedicalDocumentsCard({ userId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const loadDocs = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error: err } = await supabase
        .from('medical_documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setDocs(data ?? []);
    } catch (e) {
      console.warn('[MedicalDocs] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File too large (max 10 MB)');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const storagePath = `${userId}/${Date.now()}_${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from('medical-docs')
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase
        .from('medical_documents')
        .insert({
          user_id: userId,
          file_name: file.name,
          file_type: file.type,
          file_size_bytes: file.size,
          storage_path: storagePath,
          category: 'other',
          description: '',
        });

      if (insertErr) throw insertErr;
      await loadDocs();
    } catch (e) {
      setError(e.message || 'Upload failed');
      console.error('[MedicalDocs] Upload error:', e);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [userId, loadDocs]);

  const updateDoc = useCallback(async (docId, patch) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, ...patch } : d));
    await supabase.from('medical_documents').update(patch).eq('id', docId);
  }, []);

  const deleteDoc = useCallback(async (doc) => {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    try {
      await supabase.storage.from('medical-docs').remove([doc.storage_path]);
      await supabase.from('medical_documents').delete().eq('id', doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  }, []);

  const downloadDoc = useCallback(async (doc) => {
    try {
      const { data, error: err } = await supabase.storage
        .from('medical-docs')
        .download(doc.storage_path);
      if (err) throw err;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Download failed');
    }
  }, []);

  const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardLabel>Medical Documents</CardLabel>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
        Upload lab results, ECG reports, imaging, prescriptions, or other medical records.
        Documents are stored securely and are private to your account.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <label style={{
          background: 'rgba(96,165,250,0.12)',
          border: '1px solid rgba(96,165,250,0.35)',
          borderRadius: 'var(--r-sm)',
          padding: '6px 14px',
          fontSize: 11,
          color: '#60a5fa',
          fontFamily: 'var(--font-mono)',
          cursor: uploading ? 'wait' : 'pointer',
          opacity: uploading ? 0.6 : 1,
        }}>
          {uploading ? 'Uploading...' : '+ Upload Document'}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
            onChange={handleUpload}
            disabled={uploading || !userId}
            style={{ display: 'none' }}
          />
        </label>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          PDF, images, docs · max 10 MB
        </span>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--r-sm)',
          padding: 'var(--sp-2) var(--sp-3)',
          fontSize: 11,
          color: '#fca5a5',
          marginBottom: 'var(--sp-2)',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 'var(--sp-3)' }}>Loading...</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: 'var(--sp-2)', fontStyle: 'italic' }}>
          No documents uploaded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {docs.map(doc => (
            <div key={doc.id} style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              padding: 'var(--sp-2) var(--sp-3)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {doc.file_name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {fmtSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => downloadDoc(doc)} style={smallBtnStyle} title="Download">↓</button>
                  <button onClick={() => deleteDoc(doc)} style={{ ...smallBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} title="Delete">✕</button>
                </div>
              </div>
              <div style={{ marginBottom: 'var(--sp-1)' }}>
                <Field label="Key findings (visible to AI coach)">
                  <textarea
                    value={doc.key_findings ?? ''}
                    onChange={e => updateDoc(doc.id, { key_findings: e.target.value })}
                    style={{ ...inputStyleSm, minHeight: 40, resize: 'vertical' }}
                    placeholder="e.g. Ferritin 28 ng/mL (low), Vitamin D 18 ng/mL (deficient), TSH normal 2.1..."
                  />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-1)' }}>
                <Field label="Category">
                  <select value={doc.category ?? 'other'} onChange={e => updateDoc(doc.id, { category: e.target.value })} style={inputStyleSm}>
                    {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Document date">
                  <input type="date" value={doc.document_date ?? ''} onChange={e => updateDoc(doc.id, { document_date: e.target.value || null })} style={inputStyleSm} />
                </Field>
                <Field label="Description">
                  <input value={doc.description ?? ''} onChange={e => updateDoc(doc.id, { description: e.target.value })} style={inputStyleSm} placeholder="Brief note..." />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Readiness Checkin Card ────────────────────────────────────────────────────

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

// ── Shared components ─────────────────────────────────────────────────────────

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

const inputStyleSm = {
  ...inputStyle,
  fontSize: 10,
  padding: '4px 6px',
};

const smallBtnStyle = {
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--r-sm)',
  width: 24,
  height: 24,
  fontSize: 12,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
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
