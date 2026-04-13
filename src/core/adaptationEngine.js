/**
 * adaptationEngine.js — Dynamic per-day workout adaptation.
 *
 * Takes pre-computed signals (readiness checkin, TSB, compliance, medical flags)
 * and produces an adapted version of the next planned workout that:
 *   - Respects daily readiness (sleep, energy, soreness, stress, HR delta)
 *   - Respects training load (TSB / fatigue)
 *   - Respects execution compliance (are recent sessions being completed?)
 *   - Respects medical flags (injury notes, HR limits)
 *   - Always stays within the goal-oriented plan trajectory
 *
 * No React imports. Fully unit-testable.
 */

import { TYPE_COLOR, SESSION_INTENTS } from './trainingEngine.js';

// ─── Readiness scoring ────────────────────────────────────────────────────────

/**
 * Score today's readiness from a daily checkin object.
 * Returns { score: 0–10, factors: Array<{key, label, severity}> }
 *
 * Checkin fields:
 *   sleepScore    0–100  overall sleep quality (converted to 0–10)
 *   sleepHours    number
 *   energy        0–10
 *   soreness      0–10   (10 = very sore → reduces readiness)
 *   stress        0–10   (10 = very stressed → reduces readiness)
 *   motivation    0–10
 *   restingHrDelta bpm above normal resting HR
 *   healthScore   0–10
 */
export function scoreReadiness(checkin) {
  if (!checkin) {
    return { score: null, factors: [], label: 'No data', color: '#6b7280' };
  }

  const sleep      = Math.max(0, Math.min(10, Number(checkin.sleepScore ?? 70) / 10));
  const sleepHours = Number(checkin.sleepHours ?? 7.5);
  const energy     = Math.max(0, Math.min(10, Number(checkin.energy     ?? 6)));
  const soreness   = 10 - Math.max(0, Math.min(10, Number(checkin.soreness  ?? 3)));  // invert
  const stress     = 10 - Math.max(0, Math.min(10, Number(checkin.stress    ?? 4)));  // invert
  const motivation = Math.max(0, Math.min(10, Number(checkin.motivation ?? 7)));
  const health     = Math.max(0, Math.min(10, Number(checkin.healthScore ?? 7)));
  const hrDelta    = Number(checkin.restingHrDelta ?? 0);

  // HR elevation penalty
  const hrPenalty = hrDelta > 10 ? 2.5 : hrDelta > 6 ? 1.2 : hrDelta > 3 ? 0.5 : 0;

  // Weighted composite — sleep quality and energy weighted most heavily
  const raw =
    sleep      * 0.20 +
    energy     * 0.22 +
    soreness   * 0.18 +
    stress     * 0.12 +
    motivation * 0.13 +
    health     * 0.15;

  // Sleep hours penalty (< 6 h degrades readiness significantly)
  const sleepHrPenalty = sleepHours < 5 ? 2 : sleepHours < 6 ? 1 : sleepHours < 6.5 ? 0.4 : 0;

  const score = Math.max(0, Math.min(10, raw - hrPenalty - sleepHrPenalty));

  // Notable factors for display
  const factors = [];
  if (sleep < 4)        factors.push({ key: 'sleep',    label: 'Poor sleep quality', severity: 'high'   });
  else if (sleep < 6)   factors.push({ key: 'sleep',    label: 'Below-avg sleep',    severity: 'medium' });
  if (sleepHours < 6)   factors.push({ key: 'sleepdur', label: `Only ${sleepHours.toFixed(1)} h sleep`, severity: 'high' });
  if (energy < 4)       factors.push({ key: 'energy',   label: 'Low energy',         severity: 'high'   });
  else if (energy < 6)  factors.push({ key: 'energy',   label: 'Moderate energy',    severity: 'medium' });
  if (soreness < 4)     factors.push({ key: 'soreness', label: 'High muscle soreness',severity: 'high'  });
  else if (soreness < 6)factors.push({ key: 'soreness', label: 'Some soreness',       severity: 'medium'});
  if (stress < 4)       factors.push({ key: 'stress',   label: 'High stress',         severity: 'medium'});
  if (hrDelta > 6)      factors.push({ key: 'hr',       label: `Resting HR +${Math.round(hrDelta)} bpm`, severity: hrDelta > 10 ? 'high' : 'medium' });
  if (score >= 8.5)     factors.push({ key: 'great',    label: 'Excellent readiness', severity: 'positive' });
  else if (score >= 7)  factors.push({ key: 'good',     label: 'Good readiness',      severity: 'positive' });

  const label  = score >= 8.5 ? 'Excellent' : score >= 7 ? 'Good' : score >= 5.5 ? 'Moderate' : score >= 4 ? 'Low' : 'Very Low';
  const color  = score >= 8.5 ? '#4ade80' : score >= 7 ? '#a3e635' : score >= 5.5 ? '#fbbf24' : score >= 4 ? '#f97316' : '#ef4444';

  return { score: Math.round(score * 10) / 10, factors, label, color };
}

// ─── Type hierarchy (for up/downgrade) ───────────────────────────────────────

const TYPE_INTENSITY_RANK = {
  rest: 0, recovery: 1, aerobic: 2, long: 3, tempo: 4, interval: 5, test: 2,
};

const TYPE_DOWNGRADE = {
  interval: 'aerobic',
  tempo:    'recovery',
  long:     'aerobic',
  aerobic:  'recovery',
  recovery: 'rest',
  test:     'recovery',
  rest:     'rest',
};

// ─── Adaptation level ─────────────────────────────────────────────────────────

/**
 * Compute adaptation level from combined signals.
 *
 * @param {object} opts
 *   readinessScore   number | null  — 0–10, null if no checkin
 *   tsb              number | null  — from calcTrainingLoad; positive = fresh
 *   complianceAvg    number | null  — 0–100 average compliance score last 2 weeks
 *   lastWorkoutPain  number         — 0–10 pain reported after last workout
 *   medicalNotes     string         — injury_notes from profile (scanned for keywords)
 *   goalWeeksLeft    number | null  — weeks until goal event
 *
 * @returns {{ level, volumeFactor, downgradeType, reason, color }}
 *   level: 'rest' | 'reduce' | 'maintain' | 'promote'
 */
export function computeAdaptationLevel({
  readinessScore = null,
  tsb = null,
  complianceAvg = null,
  lastWorkoutPain = 0,
  medicalNotes = '',
  goalWeeksLeft = null,
}) {
  const rs   = readinessScore;
  const tsbN = Number.isFinite(Number(tsb)) ? Number(tsb) : null;
  const pain = Number(lastWorkoutPain ?? 0);

  // ── Safety stops (always override) ────────────────────────────────────────
  if (pain >= 7) {
    return {
      level: 'rest', volumeFactor: 0, downgradeType: true,
      reason: `Pain level ${pain}/10 in last workout — mandatory rest to prevent injury`,
      color: '#ef4444',
    };
  }

  // Check medical notes for acute injury keywords
  const injuryKeywords = ['pain', 'injury', 'injured', 'inflammation', 'sprain', 'fracture', 'stress fracture'];
  const hasMedicalStop = injuryKeywords.some(k => (medicalNotes ?? '').toLowerCase().includes(k));
  if (hasMedicalStop) {
    return {
      level: 'reduce', volumeFactor: 0.70, downgradeType: true,
      reason: 'Medical notes indicate active injury — session intensity and volume reduced',
      color: '#f97316',
    };
  }

  // Very high fatigue (TSB heavily negative) — override readiness
  if (tsbN !== null && tsbN < -28) {
    return {
      level: 'rest', volumeFactor: 0, downgradeType: true,
      reason: `Heavy accumulated fatigue (TSB ${tsbN.toFixed(0)}) — rest day to recover before next block`,
      color: '#ef4444',
    };
  }

  // ── No checkin → conservative default ────────────────────────────────────
  if (rs === null) {
    if (tsbN !== null && tsbN < -18) {
      return {
        level: 'reduce', volumeFactor: 0.80, downgradeType: false,
        reason: 'High training load detected (no readiness data) — session volume reduced as precaution',
        color: '#f97316',
      };
    }
    return {
      level: 'maintain', volumeFactor: 1.0, downgradeType: false,
      reason: 'No readiness data — following plan as scheduled',
      color: '#6b7280',
    };
  }

  // ── Force rest ────────────────────────────────────────────────────────────
  if (rs <= 2.5 || (tsbN !== null && tsbN < -28)) {
    return {
      level: 'rest', volumeFactor: 0, downgradeType: true,
      reason: rs <= 2.5
        ? `Very low readiness (${rs}/10) — skip training today and prioritize recovery`
        : `Extreme fatigue (TSB ${tsbN.toFixed(0)}) — mandatory rest`,
      color: '#ef4444',
    };
  }

  // ── Significant reduction ─────────────────────────────────────────────────
  if (rs <= 4.0 || (tsbN !== null && tsbN < -20)) {
    const tsbNote = tsbN !== null && tsbN < -20 ? ` (TSB ${tsbN.toFixed(0)})` : '';
    return {
      level: 'reduce', volumeFactor: 0.70, downgradeType: true,
      reason: `Low readiness ${rs}/10${tsbNote} — downgrade session type and reduce volume to 70%`,
      color: '#f97316',
    };
  }

  // ── Mild reduction ────────────────────────────────────────────────────────
  if (rs <= 5.5 || (tsbN !== null && tsbN < -12)) {
    const tsbNote = tsbN !== null && tsbN < -12 ? ` · fatigue load (TSB ${tsbN.toFixed(0)})` : '';
    return {
      level: 'reduce', volumeFactor: 0.82, downgradeType: false,
      reason: `Moderate readiness ${rs}/10${tsbNote} — reduce volume by ~18%, keep session type`,
      color: '#fbbf24',
    };
  }

  // ── Promotion: great readiness + fresh legs + consistent compliance ───────
  // Only promote if we're not in taper (goal within 3 weeks)
  const inTaper = goalWeeksLeft != null && goalWeeksLeft <= 3;
  const goodCompliance = complianceAvg == null || complianceAvg >= 75;
  if (rs >= 8.5 && (tsbN === null || tsbN >= 5) && goodCompliance && !inTaper) {
    return {
      level: 'promote', volumeFactor: 1.08, downgradeType: false,
      reason: `High readiness ${rs}/10 and fresh legs (TSB ${tsbN != null ? tsbN.toFixed(0) : '?'}) — slight volume boost`,
      color: '#4ade80',
    };
  }

  // ── Maintain ──────────────────────────────────────────────────────────────
  return {
    level: 'maintain', volumeFactor: 1.0, downgradeType: false,
    reason: rs >= 7
      ? `Good readiness (${rs}/10) — follow the plan as scheduled`
      : `Readiness ${rs}/10 — follow the plan at normal intensity`,
    color: rs >= 7 ? '#4ade80' : '#60a5fa',
  };
}

// ─── Day adaptation ───────────────────────────────────────────────────────────

/**
 * Produce an adapted version of a planned day.
 *
 * @param {object} plannedDay   — from mesocycle.weeks[n].days[n]
 * @param {object} adaptation   — from computeAdaptationLevel
 * @param {object} sportObj     — { sport, hasWattmeter, ftp, medical }
 * @returns {object}            — adapted day (same shape as plannedDay)
 */
export function adaptDay(plannedDay, adaptation, sportObj) {
  if (!plannedDay) return null;

  const { level, volumeFactor, downgradeType } = adaptation;

  // ── Force rest ────────────────────────────────────────────────────────────
  if (level === 'rest' || plannedDay.type === 'rest') {
    if (plannedDay.type === 'rest') return plannedDay; // already rest
    return {
      ...plannedDay,
      type:        'rest',
      label:       'Rest day (adapted)',
      desc:        'Full rest based on today\'s readiness signals. Prioritise sleep, hydration, and light stretching or mobility work.',
      targetKm:    0,
      intensity:   0,
      adapted:     true,
      adaptedFrom: plannedDay.type,
      color:       TYPE_COLOR.rest,
      intent:      SESSION_INTENTS.rest,
    };
  }

  // ── Derive adapted type ───────────────────────────────────────────────────
  let adaptedType = plannedDay.type;
  if (downgradeType && TYPE_DOWNGRADE[adaptedType]) {
    adaptedType = TYPE_DOWNGRADE[adaptedType];
  }

  // ── Scale volume ──────────────────────────────────────────────────────────
  const originalKm = plannedDay.targetKm ?? 0;
  const scaledKm   = Math.max(0, Math.round(originalKm * volumeFactor));
  const isAdapted  = level !== 'maintain';
  const typeChanged = adaptedType !== plannedDay.type;

  // ── Build label ───────────────────────────────────────────────────────────
  let label = plannedDay.label;
  if (typeChanged) {
    const tLabel = adaptedType.charAt(0).toUpperCase() + adaptedType.slice(1);
    label = `${tLabel} (${scaledKm} km) — adapted`;
  } else if (isAdapted) {
    // Try to replace the km figure in the existing label first; fall back to appending %
    const replaced = plannedDay.label.replace(/\b\d+\s*km\b/, `${scaledKm} km`);
    label = replaced !== plannedDay.label ? replaced : `${plannedDay.label} (${Math.round(volumeFactor * 100)}%)`;
  }

  // ── Build description ─────────────────────────────────────────────────────
  // NOTE: sport templates take WEEK km, not session km, so we never call
  // T[type](scaledKm) here — that would produce wildly wrong session distances.
  // Instead patch the original description's km reference if the type is unchanged,
  // or provide a simple type-appropriate description when the type has changed.
  let desc = plannedDay.desc;
  if (typeChanged) {
    const descMap = {
      recovery: `${scaledKm} km easy recovery — keep HR in Z1, fully conversational pace. Focus on flushing the legs and loosening up.`,
      aerobic:  `${scaledKm} km aerobic Z2 — comfortable pace, HR 65–75% max. No efforts above Z2.`,
      rest:     'Full rest. Prioritise sleep, hydration, and light mobility work.',
    };
    desc = descMap[adaptedType] ?? `${scaledKm} km ${adaptedType} session — adapted from original ${plannedDay.type} plan.`;
  } else if (isAdapted && originalKm > 0 && desc) {
    // Replace the session km figure in the description
    desc = desc.replace(new RegExp(`\\b${originalKm}\\b`, 'g'), String(scaledKm));
  }

  return {
    ...plannedDay,
    type:        adaptedType,
    targetKm:    scaledKm,
    label,
    desc,
    color:       TYPE_COLOR[adaptedType] ?? plannedDay.color,
    intent:      SESSION_INTENTS[adaptedType] ?? plannedDay.intent,
    adapted:     isAdapted,
    adaptedFrom: isAdapted ? plannedDay.type : undefined,
  };
}

// ─── Find next planned day ────────────────────────────────────────────────────

/**
 * Find the next non-rest planned day that hasn't been completed yet.
 * Returns the day augmented with weekIndex and phase, or null.
 */
export function findNextPlannedDay(mesocycle, historyWorkouts = [], todayIso) {
  if (!mesocycle?.weeks?.length) return null;
  const done = new Set((historyWorkouts ?? []).map(w => w?.date).filter(Boolean));

  for (const week of mesocycle.weeks) {
    for (const day of week.days ?? []) {
      if (!day?.dateIso) continue;
      if (day.type === 'rest') continue;
      if (day.dateIso < todayIso) continue;
      if (done.has(day.dateIso)) continue;
      return { ...day, weekIndex: week.weekIndex, phase: week.phase };
    }
  }
  return null;
}

// ─── Goal trajectory check ────────────────────────────────────────────────────

/**
 * Assess whether the plan is on track to achieve the goal.
 *
 * Returns {
 *   onTrack: boolean,
 *   completionRate: number,    — % of planned sessions completed so far
 *   weeksLeft: number | null,
 *   missedSessions: number,
 *   message: string,
 * }
 */
export function assessGoalTrajectory(mesocycle, historyWorkouts = [], todayIso) {
  if (!mesocycle?.weeks?.length) {
    return { onTrack: true, completionRate: null, weeksLeft: null, missedSessions: 0, message: '' };
  }

  const goalDate   = mesocycle?.meta?.goalDate ?? null;
  const weeksLeft  = goalDate
    ? Math.max(0, Math.ceil((new Date(goalDate) - new Date(todayIso)) / (7 * 86400000)))
    : null;

  const done = new Set((historyWorkouts ?? []).map(w => w?.date).filter(Boolean));

  let plannedPast = 0;
  let completedPast = 0;
  let missedSessions = 0;

  for (const week of mesocycle.weeks) {
    for (const day of week.days ?? []) {
      if (!day?.dateIso || day.type === 'rest') continue;
      if (day.dateIso >= todayIso) continue;
      plannedPast++;
      if (done.has(day.dateIso)) completedPast++;
      else missedSessions++;
    }
  }

  const completionRate = plannedPast > 0 ? Math.round((completedPast / plannedPast) * 100) : null;
  const onTrack = completionRate == null || completionRate >= 70;

  let message = '';
  if (completionRate != null) {
    if (completionRate < 50) message = `Only ${completionRate}% of planned sessions completed — at risk of not reaching your goal`;
    else if (completionRate < 70) message = `${completionRate}% completion — goal achievable with consistent training`;
    else if (completionRate < 90) message = `${completionRate}% on track — keep the momentum`;
    else message = `${completionRate}% — excellent adherence, well positioned for goal`;
  }

  return { onTrack, completionRate, weeksLeft, missedSessions, message };
}
