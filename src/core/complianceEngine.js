/**
 * complianceEngine.js — Plan vs actual workout compliance scoring.
 * Pure functions, no React, fully unit-testable.
 */

// Expected zone distributions per session type
const TYPE_ZONE_TARGETS = {
  rest:     null,
  recovery: { easyMin: 80, hiMax: 5  },   // Z1+Z2 ≥ 80%, Z4+Z5 ≤ 5%
  aerobic:  { easyMin: 75, hiMax: 10 },   // Z1+Z2 ≥ 75%
  long:     { easyMin: 70, hiMax: 10 },   // Z1+Z2 ≥ 70%
  tempo:    { easyMin: 30, hiMax: 15, tempoMin: 25, tempoMax: 45 }, // Z3 25-45%
  interval: { hiMin: 20  },               // Z4+Z5 ≥ 20%
  test:     null,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * findPlannedDay — looks up a planned day from a mesocycle by ISO date.
 * This is the ONLY place plan-day lookups happen — always from mesocycle.
 */
export function findPlannedDay(mesocycle, workoutDateIso) {
  if (!mesocycle?.weeks?.length) return null;
  for (const week of mesocycle.weeks) {
    const day = week.days.find(d => d.dateIso === workoutDateIso);
    if (day) return { ...day, weekIndex: week.weekIndex, phase: week.phase };
  }
  return null;
}

/**
 * computeCompliance — compare a planned day to an actual workout.
 * Returns { score: 0..100, verdict, details }.
 */
export function computeCompliance(plannedDay, actualWorkout) {
  if (!plannedDay || !actualWorkout) return null;

  if (plannedDay.type === 'rest') {
    return {
      score: 100,
      verdict: 'nailed_it',
      details: { note: 'Rest day — no workout planned' },
    };
  }

  const planned_km = plannedDay.targetKm ?? 0;
  const actual_km  = (actualWorkout.distance ?? 0) / 1000;
  const hrZones    = actualWorkout.hrZones ?? [];

  // Zone pct helpers
  const zonePct = (id) => {
    const z = hrZones.find(z => z.id === id);
    return z?.pct ?? 0;
  };
  const z1 = zonePct('z1');
  const z2 = zonePct('z2');
  const z3 = zonePct('z3');
  const z4 = zonePct('z4');
  const z5 = zonePct('z5');
  const easyPct = z1 + z2;
  const hiPct   = z4 + z5;

  let score = 0;

  // 1. Distance compliance (30 pts)
  let distPts = 0;
  if (planned_km > 0) {
    const distDelta = Math.abs(actual_km - planned_km) / planned_km;
    if (distDelta <= 0.15) distPts = 30;
    else if (distDelta <= 0.30) distPts = 15;
    else distPts = 0;
  } else {
    distPts = 30; // no distance target = full marks
  }
  score += distPts;

  // 2. Intensity / zone match (30 pts)
  let zonePts = 0;
  const target = TYPE_ZONE_TARGETS[plannedDay.type] ?? null;
  if (target) {
    let matches = 0;
    let checks  = 0;
    if (target.easyMin != null) { checks++; if (easyPct >= target.easyMin) matches++; }
    if (target.hiMax   != null) { checks++; if (hiPct   <= target.hiMax)   matches++; }
    if (target.hiMin   != null) { checks++; if (hiPct   >= target.hiMin)   matches++; }
    if (target.tempoMin != null) { checks++; if (z3 >= target.tempoMin && z3 <= target.tempoMax) matches++; }
    zonePts = checks > 0 ? Math.round((matches / checks) * 30) : 30;
  } else {
    zonePts = 30; // no zone target = full marks
  }
  score += zonePts;

  // 3. HR zone fidelity (20 pts) — deviation from expected easy pct
  let fidelityPts = 20;
  if (target?.easyMin != null) {
    const delta = easyPct - target.easyMin;
    if (delta < -20) fidelityPts = 0;
    else if (delta < -10) fidelityPts = 10;
    else fidelityPts = 20;
  }
  score += fidelityPts;

  // 4. Execution quality (20 pts) — pacing via lap data
  let qualityPts = 10; // baseline
  const pacing = actualWorkout.pacingAnalysis;
  if (pacing) {
    if (pacing.splitType === 'negative') qualityPts = 20;
    else if (pacing.splitType === 'even') qualityPts = 15;
    else qualityPts = 5;
    // Zone creep penalty for easy days
    if ((plannedDay.type === 'recovery' || plannedDay.type === 'aerobic') && hiPct > 15) {
      qualityPts = Math.max(0, qualityPts - 10);
    }
  }
  score += qualityPts;

  score = Math.min(100, Math.max(0, score));
  const verdict = score >= 80 ? 'nailed_it' : score >= 60 ? 'close' : 'off_target';

  return {
    score,
    verdict,
    details: {
      plan: {
        type: plannedDay.type ?? null,
        label: plannedDay.aiTitle || plannedDay.label || plannedDay.type || null,
        desc: plannedDay.desc ?? '',
        targetKm: planned_km,
        day: plannedDay.day ?? null,
        dateIso: plannedDay.dateIso ?? null,
      },
      distanceDelta: {
        planned: planned_km,
        actual:  parseFloat(actual_km.toFixed(2)),
        pct:     planned_km > 0 ? Math.round((actual_km / planned_km) * 100) : null,
      },
      intensityMatch: {
        planned: plannedDay.type,
        easyPct: Math.round(easyPct),
        hiPct:   Math.round(hiPct),
        matched: zonePts >= 20,
      },
      zoneFidelity: {
        plannedEasyPct: target?.easyMin ?? null,
        actualEasyPct:  Math.round(easyPct),
        delta:          target?.easyMin != null ? Math.round(easyPct - target.easyMin) : null,
      },
    },
  };
}

/**
 * computeWeeklyCompliance — aggregate compliance for a mesocycle week.
 */
export function computeWeeklyCompliance(mesocycleWeek, historyWorkouts) {
  if (!mesocycleWeek?.days?.length) return null;
  const plannedDays = mesocycleWeek.days.filter(d => d.type !== 'rest');
  if (!plannedDays.length) return { completionRate: 100, avgScore: 100, missedDays: 0, overreachDays: 0 };

  const completed = plannedDays.filter(d =>
    historyWorkouts.some(w => w.date === d.dateIso)
  );

  const scores = completed
    .map(d => {
      const w = historyWorkouts.find(w => w.date === d.dateIso);
      return w?.complianceResult?.score ?? null;
    })
    .filter(s => s != null);

  const overreachDays = completed.filter(d => {
    const w = historyWorkouts.find(w => w.date === d.dateIso);
    const te = w?.trainingEffect?.aerobic ?? 0;
    return te > (d.intensity ?? 0) * 0.05;
  }).length;

  return {
    completionRate: Math.round((completed.length / plannedDays.length) * 100),
    avgScore:       scores.length ? Math.round(mean(scores)) : null,
    missedDays:     plannedDays.length - completed.length,
    overreachDays,
  };
}

/**
 * computeExecutionTrend — aggregate recent planned-session execution quality.
 * Used by analytics and as an input signal for future-plan updates.
 *
 * @param {object[]} historyWorkouts
 * @param {number} lookbackDays
 * @returns {{
 *   plannedSessions: number,
 *   avgScore: number|null,
 *   offTargetSessions: number,
 *   executionLabel: string,
 *   adaptationFactor: number
 * }}
 */
export function computeExecutionTrend(historyWorkouts = [], lookbackDays = 28) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const plannedSessions = (historyWorkouts ?? [])
    .filter((w) => w?.date && new Date(w.date) >= cutoff)
    .filter((w) => w?.complianceResult?.score != null);

  if (!plannedSessions.length) {
    return {
      plannedSessions: 0,
      avgScore: null,
      offTargetSessions: 0,
      executionLabel: 'Unknown',
      adaptationFactor: 1.0,
    };
  }

  const scores = plannedSessions.map((w) => Number(w.complianceResult.score) || 0);
  const avgScore = Math.round(mean(scores));
  const offTargetSessions = plannedSessions.filter((w) => {
    const score = Number(w?.complianceResult?.score ?? 100);
    const verdict = w?.complianceResult?.verdict;
    return verdict === 'off_target' || score < 60;
  }).length;

  let adaptationFactor = 1.0;
  if (avgScore < 50) adaptationFactor = 0.82;
  else if (avgScore < 60) adaptationFactor = 0.88;
  else if (avgScore < 70) adaptationFactor = 0.94;
  else if (avgScore < 80) adaptationFactor = 0.98;
  else if (avgScore >= 90 && offTargetSessions === 0 && plannedSessions.length >= 4) adaptationFactor = 1.03;

  // Penalize repeated off-target outcomes to reduce future load progression.
  adaptationFactor -= Math.min(0.08, offTargetSessions * 0.02);
  adaptationFactor = clamp(Number(adaptationFactor.toFixed(2)), 0.8, 1.05);

  const executionLabel = avgScore >= 85
    ? 'Excellent'
    : avgScore >= 70
      ? 'Solid'
      : avgScore >= 55
        ? 'Needs Adjustment'
        : 'High Risk';

  return {
    plannedSessions: plannedSessions.length,
    avgScore,
    offTargetSessions,
    executionLabel,
    adaptationFactor,
  };
}
