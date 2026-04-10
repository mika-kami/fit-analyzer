import { calcTrainingLoad } from './trainingEngine.js';
import { buildLabDigest } from './labTracker.js';
import { detectMedicationImpact } from './workoutAnalyzer.js';

function clean(value) {
  if (value == null) return '';
  return String(value).trim();
}

function pushIf(arr, value) {
  const next = clean(value);
  if (next) arr.push(next);
}

function normalizeSportName(workout) {
  const s = clean(workout?.sport ?? workout?.sportLabel) || 'other';
  const lower = s.toLowerCase();
  if (lower.includes('cycl') || lower.includes('bike') || lower.includes('road')) return 'cycling';
  if (lower.includes('run')) return 'running';
  if (lower.includes('hik')) return 'hiking';
  if (lower.includes('walk')) return 'walking';
  if (lower.includes('swim')) return 'swimming';
  if (lower.includes('strength') || lower.includes('gym')) return 'strength';
  return s;
}

function fmtDate(isoDate) {
  const date = clean(isoDate);
  if (!date) return '';
  return date;
}

function fmtDistanceKm(distanceM) {
  if (!Number.isFinite(distanceM)) return null;
  return (distanceM / 1000).toFixed(1);
}

function fmtDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function buildAthleteDigest(profile = {}, medDocs = [], labValues = []) {
  const medical = profile?.medical ?? {};
  const parts = [];

  pushIf(parts, profile?.targetSport ? `${profile.targetSport} focus` : '');
  if (Number.isFinite(Number(profile?.weeklyHours)) && Number(profile.weeklyHours) > 0) {
    parts.push(`~${Number(profile.weeklyHours)} h/week`);
  }
  pushIf(parts, profile?.primaryGoal ? `goal: ${profile.primaryGoal}` : '');
  pushIf(parts, profile?.goalDate ? `goal date ${profile.goalDate}` : '');
  pushIf(parts, medical?.restingHr ? `resting HR ${medical.restingHr}` : '');
  pushIf(parts, medical?.maxHrTested ? `max HR ${medical.maxHrTested}` : '');
  pushIf(parts, medical?.bloodPressure ? `BP ${medical.bloodPressure}` : '');

  if (medical?.asthma) parts.push('asthma');
  if (medical?.exerciseInducedBronchoconstriction) parts.push('exercise-induced bronchoconstriction');
  if (medical?.ironDeficiency) parts.push('iron deficiency');
  if (medical?.diabetes && medical.diabetes !== 'none') parts.push(`diabetes ${medical.diabetes}`);

  pushIf(parts, medical?.knownCardiacConditions ? `cardiac: ${medical.knownCardiacConditions}` : '');
  pushIf(parts, medical?.currentInjuries ? `injuries: ${medical.currentInjuries}` : '');
  pushIf(parts, profile?.injuryNotes ? `injury notes: ${profile.injuryNotes}` : '');
  pushIf(parts, medical?.chronicConditions ? `chronic: ${medical.chronicConditions}` : '');
  pushIf(parts, profile?.constraints ? `constraints: ${profile.constraints}` : '');
  pushIf(parts, medical?.currentMedications ? `meds: ${medical.currentMedications}` : '');
  pushIf(parts, medical?.supplements ? `supplements: ${medical.supplements}` : '');
  pushIf(parts, medical?.lastStressTest ? `last stress test ${medical.lastStressTest}` : '');
  pushIf(parts, medical?.lastBloodwork ? `last bloodwork ${medical.lastBloodwork}` : '');
  pushIf(parts, medical?.lastEcg ? `last ECG ${medical.lastEcg}` : '');

  const findings = (Array.isArray(medDocs) ? medDocs : [])
    .map((d) => clean(d?.key_findings ?? d))
    .filter(Boolean)
    .slice(0, 3);
  if (findings.length) parts.push(`medical findings: ${findings.join(' | ')}`);

  // Medication impact note
  const medImpact = detectMedicationImpact(medical);
  if (medImpact) pushIf(parts, medImpact.note);

  // Lab trends
  const labDigest = buildLabDigest(labValues);
  if (labDigest) pushIf(parts, labDigest);

  if (!parts.length) return 'Athlete digest: no profile details provided yet.';
  return `Athlete digest: ${parts.join('. ')}.`;
}

export function buildWorkoutSnapshot(workout) {
  if (!workout) return 'Workout: none loaded.';
  const date = fmtDate(workout?.date);
  const sport = clean(workout?.sportLabel ?? workout?.sport) || 'Activity';
  const distance = fmtDistanceKm(workout?.distance);
  const active = fmtDuration(workout?.duration?.active);
  const avgHr = Number.isFinite(workout?.heartRate?.avg) ? Math.round(workout.heartRate.avg) : null;
  const te = Number.isFinite(workout?.trainingEffect?.aerobic) ? workout.trainingEffect.aerobic.toFixed(1) : null;
  const z1 = Number(workout?.hrZones?.[0]?.pct ?? 0);
  const z2 = Number(workout?.hrZones?.[1]?.pct ?? 0);
  const recoveryDays = Number.isFinite(workout?.load?.recoveryDays) ? workout.load.recoveryDays : null;

  const fields = [];
  if (date) fields.push(date);
  fields.push(sport);
  if (distance) fields.push(`${distance} km`);
  if (active) fields.push(`${active} active`);
  if (avgHr != null) fields.push(`avg HR ${avgHr}`);
  if (te != null) fields.push(`TE ${te}/5 aerobic`);
  fields.push(`Z1-Z2 ${Math.round(z1 + z2)}%`);
  if (workout?.load?.label) fields.push(`load ${workout.load.label.toLowerCase()}`);
  if (recoveryDays != null) fields.push(`recovery ${recoveryDays}d`);
  return `Workout snapshot: ${fields.join(', ')}.`;
}

export function buildHistoryDigest(recentWorkouts = []) {
  const list = Array.isArray(recentWorkouts) ? recentWorkouts.filter(Boolean).slice(0, 10) : [];
  if (!list.length) return 'Recent training: no sessions in history.';

  const sportCounts = new Map();
  const teValues = [];
  let hardSessions = 0;
  let totalDistanceM = 0;
  const seenDates = new Set();

  for (const w of list) {
    const sport = normalizeSportName(w);
    sportCounts.set(sport, (sportCounts.get(sport) ?? 0) + 1);
    const te = Number(w?.trainingEffect?.aerobic);
    if (Number.isFinite(te) && te > 0) {
      teValues.push(te);
      if (te >= 3.5) hardSessions += 1;
    }
    const dist = Number(w?.distance ?? 0);
    if (Number.isFinite(dist) && dist > 0) totalDistanceM += dist;
    if (clean(w?.date)) seenDates.add(w.date);
  }

  const distribution = [...sportCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sport, count]) => `${count} ${sport}`)
    .join(', ');
  const avgTe = teValues.length ? (teValues.reduce((a, b) => a + b, 0) / teValues.length).toFixed(1) : 'n/a';
  const load = calcTrainingLoad(list);
  const volumeKm = totalDistanceM / 1000;
  const spanDays = Math.max(seenDates.size, 7);
  const weeklyVolume = spanDays > 0 ? (volumeKm * (7 / spanDays)) : volumeKm;

  return `Last ${list.length} sessions: ${distribution}. Avg TE ${avgTe}/5. Hard sessions ${hardSessions}. CTL ${load.ctl.toFixed(1)}, ATL ${load.atl.toFixed(1)}, TSB ${load.tsb.toFixed(1)}. Weekly volume ~${weeklyVolume.toFixed(1)} km.`;
}

/**
 * Serialise active week plan days into a compact one-liner for the system prompt.
 * ~60–80 tokens for a full 7-day week. Called inside useOpenAI before each LLM request.
 *
 * @param {object[]} weekDays - days array from mesocycle.weeks[currentWeekIndex].days
 * @returns {string}
 */
export function buildPlanDigest(weekDays) {
  if (!Array.isArray(weekDays) || !weekDays.length) return '';
  const lines = weekDays.map(d => {
    const parts = [
      d.aiTitle ?? d.type,
      d.targetKm   ? `${d.targetKm}km`   : '',
      d.targetMins ? `${d.targetMins}min` : '',
    ].filter(Boolean).join(' ');
    return `${d.day}(${d.dateIso ?? d.date ?? ''}): ${parts}`;
  });
  return lines.join('; ');
}