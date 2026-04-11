import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardLabel } from './tabs/OverviewTab.jsx';
import { computeReadinessScore, computeTrainingStatus } from '../core/coachEngine.js';
import { supabase } from '../lib/supabase.js';
import { GearPanel } from './GearPanel.jsx';
import { flaggedMarkers, ENDURANCE_MARKERS, trendAnalysis, parseLabValuesFromAI } from '../core/labTracker.js';
import { localDateIso } from '../core/format.js';

const AI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? '';
const AI_URL     = import.meta.env.VITE_LLM_URL ?? 'https://api.openai.com/v1/chat/completions';
const AI_MODEL   = import.meta.env.VITE_LLM_MODEL ?? 'gpt-4o-mini';

// ── AI document analysis helpers ─────────────────────────────────────────────

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

async function analyzeDocumentWithAI(doc) {
  if (!AI_API_KEY) throw new Error('OpenAI API key not configured');

  const { data: blob, error } = await supabase.storage.from('medical-docs').download(doc.storage_path);
  if (error) throw error;

  const type = (doc.file_type || '').toLowerCase();
  const isImage = type.startsWith('image/');
  const isPdf   = type === 'application/pdf';
  const isText  = type.startsWith('text/') || doc.file_name?.endsWith('.txt');

  const EXTRACT_PROMPT = `You are a medical document analyzer for a sports coaching app. Extract clinically relevant findings that affect athletic training and performance.

Output TWO sections:
1. A single paragraph summary: "Metric: value (status), ..." e.g. "Ferritin: 28 ng/mL (low), Vitamin D: 18 ng/mL (deficient), TSH: 2.1 mIU/L (normal)."
2. If the document contains lab values, output a JSON block: {"labValues": [{"marker": "ferritin", "value": 28, "unit": "ng/mL", "refLow": 12, "refHigh": 300, "flagged": true}]}

Known markers: ferritin, hemoglobin, vitamin_d, tsh, crp, cortisol_am, testosterone, creatine_kinase, hematocrit, b12.
If the document is not a medical record, say "Not a medical document." Do not include patient personal data (name, DOB, address, ID numbers).`;

  let messages;

  if (isImage) {
    const base64 = await blobToBase64(blob);
    messages = [
      { role: 'system', content: EXTRACT_PROMPT },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${type || 'image/jpeg'};base64,${base64}` } },
        { type: 'text', text: 'Extract key medical findings from this document.' },
      ]},
    ];
  } else if (isPdf) {
    const base64 = await blobToBase64(blob);
    messages = [
      { role: 'system', content: EXTRACT_PROMPT },
      { role: 'user', content: [
        { type: 'file', file: { filename: doc.file_name, file_data: `data:application/pdf;base64,${base64}` } },
        { type: 'text', text: 'Extract key medical findings from this document.' },
      ]},
    ];
  } else if (isText) {
    const text = await blob.text();
    messages = [
      { role: 'system', content: EXTRACT_PROMPT },
      { role: 'user', content: `Extract key medical findings:\n\n${text.slice(0, 8000)}` },
    ];
  } else {
    throw new Error(`Unsupported file type: ${type || doc.file_name}. Use PDF, image, or text.`);
  }

  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({ model: AI_MODEL, max_completion_tokens: 500, messages }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `AI API error ${res.status}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ProfilePage({
  user,
  coach,
  gear = [],
  gearLoading = false,
  gearError = '',
  onAddGear,
  onUpdateGear,
  onRetireGear,
  onBackfillGear,
  onBack,
  onSignOut,
}) {
  const todayIso = coach?.todayIso ?? localDateIso();
  const [profileDraft, setProfileDraft] = useState(() => coach?.profile ?? {});
  const [checkinDraft, setCheckinDraft] = useState(() => coach?.getDailyCheckin?.(todayIso) ?? {});

  useEffect(() => { setProfileDraft(coach?.profile ?? {}); }, [coach?.profile]);
  useEffect(() => { if (coach?.getDailyCheckin) setCheckinDraft(coach.getDailyCheckin(todayIso)); }, [coach, todayIso]);

  const readiness = useMemo(() => computeReadinessScore(checkinDraft), [checkinDraft]);
  const trainingStatus = useMemo(() => computeTrainingStatus({ lastTSB: null, readiness }), [readiness]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--sp-4) var(--sp-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>PROFILE</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Athlete Profile</div>
          </div>
          <button onClick={onBack} style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Back</button>
        </div>
      </div>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5)', display: 'grid', gap: 'var(--sp-5)' }}>
        <Card><CardLabel>Account</CardLabel><div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{user?.email || 'No email'}</div></Card>

        <Card>
          <CardLabel>Coach Intelligence · Today</CardLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
            <div style={{ background: `${readiness.color}14`, border: `1px solid ${readiness.color}35`, borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>READINESS</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 28, lineHeight: 1, color: readiness.color, fontFamily: 'var(--font-display)', fontWeight: 600 }}>{readiness.score}</span>
                <span style={{ fontSize: 12, color: readiness.color, fontFamily: 'var(--font-mono)' }}>{readiness.label}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>{readiness.reason}</div>
            </div>
            <div style={{ background: `${trainingStatus.color}12`, border: `1px solid ${trainingStatus.color}35`, borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>TRAINING STATUS</div>
              <div style={{ fontSize: 16, color: trainingStatus.color, fontWeight: 600 }}>{trainingStatus.label}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{trainingStatus.summary}</div>
            </div>
          </div>
        </Card>

        <AthleteProfileCard profile={profileDraft} onChange={setProfileDraft} onSave={() => coach?.saveProfile?.(profileDraft)} />
        <MedicalProfileCard medical={profileDraft.medical ?? {}} onChange={med => setProfileDraft(p => ({ ...p, medical: { ...(p.medical ?? {}), ...med } }))} onSave={() => coach?.saveProfile?.(profileDraft)} />
        <MedicalDocumentsCard userId={user?.id} onDigestChanged={() => coach?.rebuildAthleteDigest?.(profileDraft)} />
        <ReadinessCheckinCard checkin={checkinDraft} onChange={setCheckinDraft} onSave={() => coach?.saveDailyCheckin?.(todayIso, checkinDraft)} />

        <LabMarkersCard labValues={coach?.labValues ?? []} />

        <Card>
          <CardLabel>Gear Tracker</CardLabel>
          {gearError ? (
            <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 'var(--sp-2)' }}>{gearError}</div>
          ) : null}
          {gearLoading ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading gear...</div>
          ) : (
            <GearPanel
              gear={gear}
              onAdd={onAddGear}
              onUpdate={onUpdateGear}
              onRetire={onRetireGear}
              onBackfill={onBackfillGear}
            />
          )}
        </Card>

        {onSignOut && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onSignOut} style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)', color: '#fca5a5', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Logout</button>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Athlete Profile Card ─────────────────────────────────────────────────────

function AthleteProfileCard({ profile, onChange, onSave }) {
  return (
    <Card>
      <CardLabel>Athlete Profile</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Target Sport">
          <select value={profile.targetSport ?? 'mixed'} onChange={e => onChange(p => ({ ...p, targetSport: e.target.value }))} style={inputStyle}>
            <option value="mixed">Mixed</option><option value="running">Running</option><option value="cycling">Cycling</option>
          </select>
        </Field>
        <Field label="Weekly Hours"><input type="number" min="1" max="30" value={profile.weeklyHours ?? 6} onChange={e => onChange(p => ({ ...p, weeklyHours: Number(e.target.value || 0) }))} style={inputStyle} /></Field>
        <Field label="Primary Goal"><input value={profile.primaryGoal ?? ''} onChange={e => onChange(p => ({ ...p, primaryGoal: e.target.value }))} style={inputStyle} placeholder="Half marathon, 100km ride..." /></Field>
        <Field label="Goal Date"><input type="date" value={profile.goalDate ?? ''} onChange={e => onChange(p => ({ ...p, goalDate: e.target.value }))} style={inputStyle} /></Field>
      </div>
      <div style={{ marginTop: 'var(--sp-2)', display: 'grid', gap: 'var(--sp-2)' }}>
        <Field label="Constraints"><input value={profile.constraints ?? ''} onChange={e => onChange(p => ({ ...p, constraints: e.target.value }))} style={inputStyle} placeholder="Travel, limited weekdays, etc." /></Field>
        <Field label="Injury Notes"><input value={profile.injuryNotes ?? ''} onChange={e => onChange(p => ({ ...p, injuryNotes: e.target.value }))} style={inputStyle} placeholder="Achilles, knee, lower back..." /></Field>
      </div>
      <SaveRow onSave={onSave} />
    </Card>
  );
}

// ── Medical Profile Card ─────────────────────────────────────────────────────

const SH = { fontSize: 11, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', marginTop: 'var(--sp-3)', marginBottom: 'var(--sp-1)', paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' };

function MedicalProfileCard({ medical, onChange, onSave }) {
  const m = medical ?? {};
  const set = (k, v) => onChange({ [k]: v });
  return (
    <Card>
      <CardLabel>Medical Profile</CardLabel>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--sp-2)', lineHeight: 1.5 }}>Helps the AI coach adjust training intensity, recovery, and safety. All data is private.</div>

      <div style={SH}>CARDIOVASCULAR</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Resting HR (bpm)"><input type="number" min="30" max="120" value={m.restingHr ?? ''} onChange={e => set('restingHr', e.target.value)} style={inputStyle} placeholder="e.g. 52" /></Field>
        <Field label="Max HR tested (bpm)"><input type="number" min="100" max="230" value={m.maxHrTested ?? ''} onChange={e => set('maxHrTested', e.target.value)} style={inputStyle} placeholder="From stress test" /></Field>
        <Field label="Blood Pressure"><input value={m.bloodPressure ?? ''} onChange={e => set('bloodPressure', e.target.value)} style={inputStyle} placeholder="120/80" /></Field>
      </div>
      <div style={{ marginTop: 'var(--sp-2)' }}><Field label="Known cardiac conditions"><input value={m.knownCardiacConditions ?? ''} onChange={e => set('knownCardiacConditions', e.target.value)} style={inputStyle} placeholder="None, or describe..." /></Field></div>

      <div style={SH}>RESPIRATORY</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Asthma"><select value={m.asthma ? 'yes' : 'no'} onChange={e => set('asthma', e.target.value === 'yes')} style={inputStyle}><option value="no">No</option><option value="yes">Yes</option></select></Field>
        <Field label="Exercise-induced bronchoconstriction"><select value={m.exerciseInducedBronchoconstriction ? 'yes' : 'no'} onChange={e => set('exerciseInducedBronchoconstriction', e.target.value === 'yes')} style={inputStyle}><option value="no">No</option><option value="yes">Yes</option></select></Field>
      </div>
      <div style={{ marginTop: 'var(--sp-2)' }}><Field label="Respiratory notes"><input value={m.respiratoryNotes ?? ''} onChange={e => set('respiratoryNotes', e.target.value)} style={inputStyle} placeholder="Seasonal allergies, COPD history..." /></Field></div>

      <div style={SH}>MUSCULOSKELETAL</div>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <Field label="Current injuries"><input value={m.currentInjuries ?? ''} onChange={e => set('currentInjuries', e.target.value)} style={inputStyle} placeholder="Active issues affecting training..." /></Field>
        <Field label="Past surgeries"><input value={m.pastSurgeries ?? ''} onChange={e => set('pastSurgeries', e.target.value)} style={inputStyle} placeholder="ACL reconstruction 2019..." /></Field>
        <Field label="Chronic conditions"><input value={m.chronicConditions ?? ''} onChange={e => set('chronicConditions', e.target.value)} style={inputStyle} placeholder="IT band syndrome, plantar fasciitis..." /></Field>
        <Field label="Mobility limitations"><input value={m.mobilityLimitations ?? ''} onChange={e => set('mobilityLimitations', e.target.value)} style={inputStyle} placeholder="Limited ankle dorsiflexion..." /></Field>
      </div>

      <div style={SH}>METABOLIC & ENDOCRINE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Diabetes"><select value={m.diabetes ?? 'none'} onChange={e => set('diabetes', e.target.value)} style={inputStyle}><option value="none">None</option><option value="type1">Type 1</option><option value="type2">Type 2</option><option value="prediabetes">Prediabetes</option></select></Field>
        <Field label="Thyroid condition"><input value={m.thyroidCondition ?? ''} onChange={e => set('thyroidCondition', e.target.value)} style={inputStyle} placeholder="None, hypothyroid..." /></Field>
        <Field label="Iron deficiency"><select value={m.ironDeficiency ? 'yes' : 'no'} onChange={e => set('ironDeficiency', e.target.value === 'yes')} style={inputStyle}><option value="no">No</option><option value="yes">Yes</option></select></Field>
      </div>

      <div style={SH}>MEDICATIONS & SUPPLEMENTS</div>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <Field label="Current medications"><textarea value={m.currentMedications ?? ''} onChange={e => set('currentMedications', e.target.value)} style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} placeholder="Beta-blockers, statins, inhaler..." /></Field>
        <Field label="Supplements"><input value={m.supplements ?? ''} onChange={e => set('supplements', e.target.value)} style={inputStyle} placeholder="Iron, vitamin D, creatine, caffeine..." /></Field>
        <Field label="Allergies"><input value={m.allergies ?? ''} onChange={e => set('allergies', e.target.value)} style={inputStyle} placeholder="Penicillin, nuts, pollen..." /></Field>
      </div>

      <div style={SH}>LIFESTYLE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Smoking status"><select value={m.smokingStatus ?? 'never'} onChange={e => set('smokingStatus', e.target.value)} style={inputStyle}><option value="never">Never</option><option value="former">Former</option><option value="current">Current</option></select></Field>
        <Field label="Alcohol frequency"><input value={m.alcoholFrequency ?? ''} onChange={e => set('alcoholFrequency', e.target.value)} style={inputStyle} placeholder="Occasional, 2-3/week..." /></Field>
        <Field label="Sleep disorders"><input value={m.sleepDisorders ?? ''} onChange={e => set('sleepDisorders', e.target.value)} style={inputStyle} placeholder="Sleep apnea, insomnia..." /></Field>
      </div>

      <div style={SH}>SPORT-SPECIFIC TESTING</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Last stress test"><input type="date" value={m.lastStressTest ?? ''} onChange={e => set('lastStressTest', e.target.value)} style={inputStyle} /></Field>
        <Field label="Last bloodwork"><input type="date" value={m.lastBloodwork ?? ''} onChange={e => set('lastBloodwork', e.target.value)} style={inputStyle} /></Field>
        <Field label="Last ECG"><input type="date" value={m.lastEcg ?? ''} onChange={e => set('lastEcg', e.target.value)} style={inputStyle} /></Field>
        <Field label="VO2max tested (ml/kg/min)"><input type="number" min="15" max="90" step="0.1" value={m.vo2maxTested ?? ''} onChange={e => set('vo2maxTested', e.target.value)} style={inputStyle} placeholder="e.g. 55.2" /></Field>
        <Field label="Lactate threshold (bpm or W)"><input value={m.lactateThreshold ?? ''} onChange={e => set('lactateThreshold', e.target.value)} style={inputStyle} placeholder="168 bpm or 280 W" /></Field>
      </div>

      <div style={SH}>ADDITIONAL NOTES</div>
      <Field label="Anything else the coach should know"><textarea value={m.doctorNotes ?? ''} onChange={e => set('doctorNotes', e.target.value)} style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} placeholder="Recent illness, family history, heat intolerance..." /></Field>
      <SaveRow onSave={onSave} />
    </Card>
  );
}

// ── Medical Documents Card ───────────────────────────────────────────────────

const DOC_CATEGORIES = [
  { value: 'lab_results', label: 'Lab Results' }, { value: 'ecg', label: 'ECG / EKG' },
  { value: 'imaging', label: 'Imaging (X-ray, MRI)' }, { value: 'prescription', label: 'Prescription' },
  { value: 'discharge', label: 'Discharge Summary' }, { value: 'referral', label: 'Referral Letter' },
  { value: 'other', label: 'Other' },
];

function MedicalDocumentsCard({ userId, onDigestChanged }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [analyzingId, setAnalyzingId] = useState(null);

  const loadDocs = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error: err } = await supabase.from('medical_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (err) throw err;
      setDocs(data ?? []);
    } catch (e) { console.warn('[MedicalDocs] Load error:', e); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 10 * 1024 * 1024) { setError('File too large (max 10 MB)'); return; }
    setUploading(true); setError('');
    try {
      const storagePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('medical-docs').upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw uploadErr;
      const { error: insertErr } = await supabase.from('medical_documents').insert({ user_id: userId, file_name: file.name, file_type: file.type, file_size_bytes: file.size, storage_path: storagePath, category: 'other', description: '', key_findings: '', share_with_coach: false });
      if (insertErr) throw insertErr;
      await loadDocs();
      if (onDigestChanged) await onDigestChanged();
    } catch (e) { setError(e.message || 'Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  }, [userId, loadDocs, onDigestChanged]);

  const updateDoc = useCallback(async (docId, patch) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, ...patch } : d));
    await supabase.from('medical_documents').update(patch).eq('id', docId);
    if (onDigestChanged) await onDigestChanged();
  }, [onDigestChanged]);

  const deleteDoc = useCallback(async (doc) => {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    try {
      await supabase.storage.from('medical-docs').remove([doc.storage_path]);
      await supabase.from('medical_documents').delete().eq('id', doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      if (onDigestChanged) await onDigestChanged();
    } catch (e) { setError(e.message || 'Delete failed'); }
  }, [onDigestChanged]);

  const downloadDoc = useCallback(async (doc) => {
    try {
      const { data, error: err } = await supabase.storage.from('medical-docs').download(doc.storage_path);
      if (err) throw err;
      const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = doc.file_name; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message || 'Download failed'); }
  }, []);

  const handleAnalyze = useCallback(async (doc) => {
    setAnalyzingId(doc.id);
    setError('');
    try {
      const findings = await analyzeDocumentWithAI(doc);
      if (findings) {
        setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, key_findings: findings, share_with_coach: true } : d));
        await supabase.from('medical_documents').update({ key_findings: findings, share_with_coach: true }).eq('id', doc.id);

        // Parse and store structured lab values if present
        const labValues = parseLabValuesFromAI(findings, doc.id);
        if (labValues.length > 0 && userId) {
          const rows = labValues.map(v => ({ ...v, user_id: userId, test_date: doc.created_at?.slice(0, 10) ?? localDateIso() }));
          await supabase.from('lab_values').upsert(rows, { onConflict: 'document_id,marker' });
        }

        if (onDigestChanged) await onDigestChanged();
      }
    } catch (e) {
      setError(`AI analysis failed: ${e.message}`);
    } finally {
      setAnalyzingId(null);
    }
  }, [userId, onDigestChanged]);

  const fmtSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const canAnalyze = (doc) => {
    const t = (doc.file_type || '').toLowerCase();
    return t.startsWith('image/') || t === 'application/pdf' || t.startsWith('text/') || doc.file_name?.endsWith('.txt');
  };

  return (
    <Card>
      <CardLabel>Medical Documents</CardLabel>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
        Upload lab results, ECG reports, imaging, prescriptions. Use <b style={{ color: '#a855f7' }}>⚡ Analyze with AI</b> to auto-extract findings, or fill them in manually. Enable <b style={{ color: 'var(--accent)' }}>Share</b> to let the coach see them.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <label style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 'var(--r-sm)', padding: '6px 14px', fontSize: 11, color: '#60a5fa', fontFamily: 'var(--font-mono)', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'Uploading...' : '+ Upload Document'}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt" onChange={handleUpload} disabled={uploading || !userId} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>PDF, images, docs · max 10 MB</span>
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-2) var(--sp-3)', fontSize: 11, color: '#fca5a5', marginBottom: 'var(--sp-2)' }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 'var(--sp-3)' }}>Loading...</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: 'var(--sp-2)', fontStyle: 'italic' }}>No documents uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ background: 'var(--bg-raised)', border: `1px solid ${doc.share_with_coach ? 'rgba(74,222,128,0.25)' : 'var(--border-subtle)'}`, borderRadius: 'var(--r-sm)', padding: 'var(--sp-2) var(--sp-3)' }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{doc.file_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{fmtSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => downloadDoc(doc)} style={smallBtnStyle} title="Download">↓</button>
                  <button onClick={() => deleteDoc(doc)} style={{ ...smallBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} title="Delete">✕</button>
                </div>
              </div>

              {/* Share checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--sp-1)', marginTop: 2 }}>
                <input
                  type="checkbox"
                  checked={!!doc.share_with_coach}
                  onChange={e => updateDoc(doc.id, { share_with_coach: e.target.checked })}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
                  id={`share-${doc.id}`}
                />
                <label htmlFor={`share-${doc.id}`} style={{ fontSize: 11, color: doc.share_with_coach ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', userSelect: 'none' }}>
                  {doc.share_with_coach ? '✓ Shared with AI coach' : 'Share with AI coach'}
                </label>
              </div>

              {/* Key Findings with AI analyze button */}
              <div style={{ marginBottom: 'var(--sp-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>✦ Key Findings</span>
                  {canAnalyze(doc) && (
                    <button
                      onClick={() => handleAnalyze(doc)}
                      disabled={analyzingId === doc.id || !AI_API_KEY}
                      style={{
                        background: analyzingId === doc.id ? 'rgba(168,85,247,0.15)' : 'rgba(168,85,247,0.08)',
                        border: '1px solid rgba(168,85,247,0.35)',
                        borderRadius: 'var(--r-sm)',
                        padding: '2px 8px',
                        fontSize: 10,
                        color: analyzingId === doc.id ? 'rgba(168,85,247,0.6)' : '#a855f7',
                        fontFamily: 'var(--font-mono)',
                        cursor: analyzingId === doc.id ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {analyzingId === doc.id ? '⟳ Analyzing...' : '⚡ Analyze with AI'}
                    </button>
                  )}
                </div>
                <textarea
                  value={doc.key_findings ?? ''}
                  onBlur={e => updateDoc(doc.id, { key_findings: e.target.value })}
                  onChange={e => setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, key_findings: e.target.value } : d))}
                  style={{ ...inputStyle, minHeight: 48, resize: 'vertical', borderColor: (doc.key_findings ?? '').trim() ? 'rgba(74,222,128,0.35)' : 'rgba(232,168,50,0.35)' }}
                  placeholder="e.g. Ferritin 28 ng/mL (low), Vitamin D 18 ng/mL (deficient)... or click ⚡ Analyze with AI"
                />
                {!doc.share_with_coach && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Enable "Share with AI coach" to include in coaching analysis
                  </div>
                )}
                {doc.share_with_coach && !(doc.key_findings ?? '').trim() && (
                  <div style={{ fontSize: 10, color: '#f97316', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    ⚠ Shared but no findings — use ⚡ Analyze or enter manually
                  </div>
                )}
              </div>

              {/* Metadata row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-1)' }}>
                <Field label="Category"><select value={doc.category ?? 'other'} onChange={e => updateDoc(doc.id, { category: e.target.value })} style={inputStyleSm}>{DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
                <Field label="Document date"><input type="date" value={doc.document_date ?? ''} onChange={e => updateDoc(doc.id, { document_date: e.target.value || null })} style={inputStyleSm} /></Field>
                <Field label="Description"><input value={doc.description ?? ''} onBlur={e => updateDoc(doc.id, { description: e.target.value })} onChange={e => setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, description: e.target.value } : d))} style={inputStyleSm} placeholder="Brief note..." /></Field>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Readiness Checkin Card ───────────────────────────────────────────────────

function ReadinessCheckinCard({ checkin, onChange, onSave }) {
  const set = (k, v) => onChange(prev => ({ ...prev, [k]: v }));
  return (
    <Card>
      <CardLabel>Daily Readiness Check-in</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Field label="Sleep Score (0-100)"><input type="number" min="0" max="100" value={checkin.sleepScore ?? 70} onChange={e => set('sleepScore', Number(e.target.value || 0))} style={inputStyle} /></Field>
        <Field label="Health Score (0-100)"><input type="number" min="0" max="100" value={checkin.healthScore ?? 75} onChange={e => set('healthScore', Number(e.target.value || 0))} style={inputStyle} /></Field>
        <Field label="Weather Score (0-100)"><input type="number" min="0" max="100" value={checkin.weatherScore ?? 70} onChange={e => set('weatherScore', Number(e.target.value || 0))} style={inputStyle} /></Field>
        <Field label="Energy (1-10)"><input type="number" min="1" max="10" value={checkin.energy ?? 6} onChange={e => set('energy', Number(e.target.value || 1))} style={inputStyle} /></Field>
        <Field label="Motivation (1-10)"><input type="number" min="1" max="10" value={checkin.motivation ?? 7} onChange={e => set('motivation', Number(e.target.value || 1))} style={inputStyle} /></Field>
        <Field label="Sleep Hours"><input type="number" min="0" max="14" step="0.1" value={checkin.sleepHours ?? 7.5} onChange={e => set('sleepHours', Number(e.target.value || 0))} style={inputStyle} /></Field>
        <Field label="Soreness (1-10)"><input type="number" min="1" max="10" value={checkin.soreness ?? 3} onChange={e => set('soreness', Number(e.target.value || 1))} style={inputStyle} /></Field>
        <Field label="Stress (1-10)"><input type="number" min="1" max="10" value={checkin.stress ?? 4} onChange={e => set('stress', Number(e.target.value || 1))} style={inputStyle} /></Field>
        <Field label="Resting HR Delta (bpm)"><input type="number" min="-20" max="30" value={checkin.restingHrDelta ?? 0} onChange={e => set('restingHrDelta', Number(e.target.value || 0))} style={inputStyle} /></Field>
      </div>
      <SaveRow onSave={onSave} />
    </Card>
  );
}

// ── Lab Markers Card ──────────────────────────────────────────────────────────

const TREND_COLOR = { improving: '#4ade80', declining: '#f97316', stable: '#60a5fa' };
const ALERT_COLORS = { low: '#f97316', high: '#ef4444', optimal: '#4ade80' };

function LabMarkersCard({ labValues }) {
  if (!labValues || labValues.length === 0) return null;

  const flagged = flaggedMarkers(labValues);
  const allMarkers = Object.keys(ENDURANCE_MARKERS);
  const markersWithData = allMarkers.filter(k => labValues.some(v => v.marker === k));
  if (markersWithData.length === 0) return null;

  return (
    <Card>
      <CardLabel>Lab Markers</CardLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--sp-2)' }}>
        {markersWithData.map(key => {
          const meta = ENDURANCE_MARKERS[key];
          const trend = trendAnalysis(labValues, key);
          const flag = flagged.find(f => f.marker === key);
          const alertColor = flag ? (flag.value < meta.athleteLow ? ALERT_COLORS.low : ALERT_COLORS.high) : ALERT_COLORS.optimal;
          return (
            <div key={key} style={{ background: 'var(--bg-raised)', border: `1px solid ${alertColor}30`, borderRadius: 'var(--r-sm)', padding: 'var(--sp-2) var(--sp-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{key.replace(/_/g, ' ').toUpperCase()}</div>
                {trend && trend.trend !== 'insufficient' && <div style={{ fontSize: 10, color: TREND_COLOR[trend.trend] ?? '#6b7280', fontFamily: 'var(--font-mono)' }}>{trend.trend === 'improving' ? '↑' : '↓'}</div>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: alertColor, fontFamily: 'var(--font-display)', marginTop: 2 }}>
                {trend?.lastValue ?? '—'} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>{meta.unit}</span>
              </div>
              {flag && <div style={{ fontSize: 10, color: alertColor, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{meta.warning}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (<label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{label}</span>{children}</label>);
}
const inputStyle = { width: '100%', background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: 'var(--r-sm)', padding: '6px 8px', fontSize: 12, fontFamily: 'var(--font-body)' };
const inputStyleSm = { ...inputStyle, fontSize: 10, padding: '4px 6px' };
const smallBtnStyle = { background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', width: 24, height: 24, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };
function SaveRow({ onSave, disabled = false }) {
  return (<div style={{ marginTop: 'var(--sp-3)', display: 'flex', justifyContent: 'flex-end' }}><button onClick={onSave} disabled={disabled} style={{ background: disabled ? 'var(--bg-raised)' : 'rgba(232,168,50,0.12)', border: `1px solid ${disabled ? 'var(--border-subtle)' : 'rgba(232,168,50,0.4)'}`, borderRadius: 'var(--r-sm)', color: disabled ? 'var(--text-muted)' : 'var(--accent)', fontSize: 11, fontFamily: 'var(--font-mono)', padding: '5px 10px', cursor: disabled ? 'default' : 'pointer' }}>Save</button></div>);
}
