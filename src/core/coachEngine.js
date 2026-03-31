/**
 * coachEngine.js — Phase 1 coaching primitives:
 * profile schema, readiness scoring, and training status synthesis.
 */

export const DEFAULT_ATHLETE_PROFILE = {
  targetSport: 'mixed',       // running | cycling | mixed
  primaryGoal: '',
  goalDate: '',
  weeklyHours: 6,
  constraints: '',
  injuryNotes: '',
};

export function defaultDailyCheckin(dateIso) {
  return {
    date: dateIso,
    sleepScore: 70,           // 0..100
    healthScore: 75,          // 0..100
    weatherScore: 70,         // 0..100 (how favorable conditions are today)
    energy: 6,                // 1..10
    motivation: 7,            // 1..10
    soreness: 3,              // 1..10 (higher=worse)
    stress: 4,                // 1..10 (higher=worse)
    restingHrDelta: 0,        // bpm vs normal baseline (positive=worse)
    sleepHours: 7.5,
  };
}

export function defaultWorkoutReflection(workout) {
  return {
    workoutId: workout?.id ?? null,
    date: workout?.date ?? '',
    purpose: '',
    rpe: 6,                   // 1..10
    pain: 1,                  // 1..10
    felt: '',
    notes: '',
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function computeReadinessScore(checkin) {
  if (!checkin) return { score: 50, label: 'Unknown', color: '#6b7280', reason: 'No check-in yet' };

  const sleep = clamp(checkin.sleepScore ?? 0, 0, 100);
  const health = clamp(checkin.healthScore ?? 0, 0, 100);
  const weather = clamp(checkin.weatherScore ?? 0, 0, 100);
  const energy = clamp((checkin.energy ?? 1) * 10, 0, 100);
  const motivation = clamp((checkin.motivation ?? 1) * 10, 0, 100);
  const sorenessInv = clamp(100 - ((checkin.soreness ?? 1) - 1) * (100 / 9), 0, 100);
  const stressInv = clamp(100 - ((checkin.stress ?? 1) - 1) * (100 / 9), 0, 100);
  const rhrPenalty = clamp((checkin.restingHrDelta ?? 0) * 3, 0, 30); // +10 bpm => -30
  const sleepHoursBonus = clamp(((checkin.sleepHours ?? 7) - 6) * 6, -12, 12);

  const raw =
      sleep * 0.22
    + health * 0.24
    + weather * 0.06
    + energy * 0.16
    + motivation * 0.10
    + sorenessInv * 0.10
    + stressInv * 0.12
    - rhrPenalty
    + sleepHoursBonus;

  const score = clamp(Math.round(raw), 0, 100);
  if (score >= 80) return { score, label: 'Prime', color: '#4ade80', reason: 'High readiness for quality training' };
  if (score >= 65) return { score, label: 'Good', color: '#a3e635', reason: 'Ready for productive session' };
  if (score >= 50) return { score, label: 'Moderate', color: '#fbbf24', reason: 'Keep intensity controlled' };
  if (score >= 35) return { score, label: 'Low', color: '#f97316', reason: 'Focus on recovery or easy aerobic work' };
  return { score, label: 'Critical', color: '#ef4444', reason: 'Recovery day recommended' };
}

export function computeTrainingStatus({ lastTSB, readiness }) {
  const tsb = lastTSB?.tsb ?? 0;
  const ctl = lastTSB?.ctl ?? 0;
  const r = readiness?.score ?? 50;

  if (r < 35 || tsb < -25) {
    return {
      label: 'Recovery Priority',
      color: '#ef4444',
      summary: 'Systemic fatigue is elevated. Avoid hard intervals.',
    };
  }
  if (r >= 75 && tsb >= -10 && ctl >= 20) {
    return {
      label: 'Build / Quality Window',
      color: '#4ade80',
      summary: 'Good slot for threshold/VO2 or race-specific work.',
    };
  }
  if (tsb > 10 && ctl < 20) {
    return {
      label: 'Fresh but Underloaded',
      color: '#60a5fa',
      summary: 'Increase consistent weekly volume before maximal intensity.',
    };
  }
  return {
    label: 'Steady Progress',
    color: '#fbbf24',
    summary: 'Prioritize consistency and progressive overload.',
  };
}

function recent(workouts, n = 12) {
  if (!Array.isArray(workouts)) return [];
  return [...workouts]
    .filter(w => w?.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}

function isRunWorkout(w) {
  const s = (w?.sport ?? w?.sportLabel ?? '').toLowerCase();
  return s.includes('run') || s.includes('бег');
}

function isRideWorkout(w) {
  const s = (w?.sport ?? w?.sportLabel ?? '').toLowerCase();
  return s.includes('cycl') || s.includes('bike') || s.includes('велос');
}

function mean(arr) {
  if (!arr?.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function analyzePerformanceLimiters({ workouts = [], profile, readiness, lastTSB }) {
  const window = recent(workouts, 14);
  const runs = window.filter(isRunWorkout);
  const rides = window.filter(isRideWorkout);
  const limiters = [];
  const opportunities = [];

  // Distribution / polarization sanity
  const teVals = window.map(w => w.trainingEffect?.aerobic ?? 0).filter(v => v > 0);
  const hardCount = teVals.filter(v => v >= 3.8).length;
  const hardPct = teVals.length ? (hardCount / teVals.length) * 100 : 0;
  if (teVals.length >= 6 && hardPct > 35) {
    limiters.push({
      key: 'intensity_overload',
      title: 'Intensity Distribution Too Aggressive',
      evidence: `${hardPct.toFixed(0)}% of recent sessions are high load (TE≥3.8).`,
      action: 'Shift next 7-10 days toward aerobic durability and cap hard days to 2 per week.',
    });
  } else if (teVals.length >= 6 && hardPct < 10) {
    opportunities.push({
      key: 'understimulated_intensity',
      title: 'High-End Stimulus Opportunity',
      evidence: `Only ${hardPct.toFixed(0)}% hard sessions in recent block.`,
      action: 'Introduce one quality interval workout this week when readiness is Good or Prime.',
    });
  }

  // Running limiter: cadence economy at moderate pace
  if (runs.length >= 3) {
    const pts = runs
      .map(w => ({
        cadence: w.cadence?.avg ?? 0,
        pace: w.speed?.avg > 0 ? 60 / w.speed.avg : 0, // min/km
        hr: w.heartRate?.avg ?? 0,
      }))
      .filter(x => x.cadence > 0 && x.pace > 0 && x.hr > 0);
    const avgCad = mean(pts.map(p => p.cadence));
    const avgPace = mean(pts.map(p => p.pace));
    const avgHr = mean(pts.map(p => p.hr));
    if (pts.length >= 3 && avgPace < 6.8 && avgCad < 166) {
      limiters.push({
        key: 'run_cadence_economy',
        title: 'Running Economy: Low Cadence at Work Pace',
        evidence: `Avg cadence ${avgCad.toFixed(0)} spm at ~${avgPace.toFixed(2)} min/km and ${avgHr.toFixed(0)} bpm.`,
        action: 'Add cadence drills (6-8x20s), short hill strides, and keep stride compact under fatigue.',
      });
    }
  }

  // Cycling limiter: power durability fade proxy
  if (rides.length >= 3) {
    const withPower = rides.filter(w => (w.power?.avg ?? 0) > 0 && (w.duration?.active ?? 0) > 0);
    if (withPower.length >= 3) {
      const stressProxy = withPower.map(w => (w.power.avg * (w.duration.active / 3600)));
      const first = stressProxy.slice(0, Math.ceil(stressProxy.length / 2));
      const second = stressProxy.slice(Math.ceil(stressProxy.length / 2));
      const ratio = mean(second) / Math.max(1, mean(first));
      if (ratio < 0.86) {
        limiters.push({
          key: 'bike_power_durability',
          title: 'Cycling Durability Limit',
          evidence: `Late-block power durability proxy dropped to ${(ratio * 100).toFixed(0)}% of early block.`,
          action: 'Use progressive durability intervals (pyramid / over-under) with strict fueling execution.',
        });
      } else {
        opportunities.push({
          key: 'bike_quality_window',
          title: 'Cycling Quality Window',
          evidence: `Power durability is stable (${(ratio * 100).toFixed(0)}%).`,
          action: 'You can progress threshold/VO2 density this microcycle if recovery stays high.',
        });
      }
    }
  }

  // Readiness + freshness check
  const tsb = lastTSB?.tsb ?? 0;
  if ((readiness?.score ?? 50) < 45 || tsb < -18) {
    limiters.push({
      key: 'recovery_bottleneck',
      title: 'Recovery Bottleneck',
      evidence: `Readiness ${readiness?.score ?? 50}, TSB ${tsb.toFixed(1)}.`,
      action: 'Prioritize recovery microcycle and keep intensity mostly below threshold.',
    });
  } else if ((readiness?.score ?? 50) >= 75 && tsb > -10) {
    opportunities.push({
      key: 'readiness_quality',
      title: 'High-Quality Session Opportunity',
      evidence: `Readiness ${readiness?.score ?? 50}, TSB ${tsb.toFixed(1)}.`,
      action: 'Best timing for race-specific quality workout this week.',
    });
  }

  // Soft fallback
  if (!limiters.length) {
    limiters.push({
      key: 'consistency',
      title: 'Primary Limiter: Consistency Depth',
      evidence: 'No single red flag dominates current block.',
      action: 'Maintain stable frequency and progress load in small weekly steps.',
    });
  }
  if (!opportunities.length) {
    opportunities.push({
      key: 'skill_technique',
      title: 'Opportunity: Technical Efficiency',
      evidence: 'No clear opportunity spike from current metrics.',
      action: 'Invest in neuromuscular quality: drills, cadence skills, and clean execution.',
    });
  }

  return { limiters, opportunities };
}

export function prescribeNextWorkout({ profile, readiness, trainingStatus, insights, weatherScore = 70 }) {
  const sport = profile?.targetSport === 'mixed' ? 'cycling' : (profile?.targetSport || 'cycling');
  const r = readiness?.score ?? 50;
  const isRecovery = trainingStatus?.label === 'Recovery Priority' || r < 45;
  const weatherBad = weatherScore < 45;
  const limiterKeys = new Set((insights?.limiters || []).map(x => x.key));

  if (isRecovery) {
    return {
      title: 'Regeneration Session',
      objective: 'Reduce systemic fatigue while preserving movement quality.',
      session: sport === 'running'
        ? '40-55 min easy Z1-Z2 + 6x15s relaxed strides (full recovery).'
        : '60-90 min endurance Z1-Z2, high cadence 90-95 rpm, no hard surges.',
      why: [
        'Readiness/freshness indicates recovery should be prioritized.',
        'Keeps aerobic signaling without compounding fatigue.',
      ],
    };
  }

  if (sport === 'cycling' && limiterKeys.has('bike_power_durability') && r >= 65) {
    return {
      title: 'Pyramid of Pain (Power Durability)',
      objective: 'Improve sustained power under accumulating fatigue.',
      session: weatherBad
        ? 'Indoor: 15min warm-up, then 3 blocks of 1-2-3-2-1 min @ 108-115% FTP, equal recoveries, 6 min between blocks, cool-down 15 min.'
        : 'Road/Indoor: 20min warm-up, then 3x(1-2-3-2-1 min @ 108-115% FTP, equal recoveries), 6 min easy between blocks, cool-down 15 min.',
      why: [
        'Detected durability fade in power proxy across recent rides.',
        'Pyramid shape increases metabolic pressure while controlling peak duration.',
      ],
    };
  }

  if (sport === 'running' && limiterKeys.has('run_cadence_economy') && r >= 60) {
    return {
      title: 'Economy Builder (Cadence + Threshold)',
      objective: 'Improve running economy and pacing control.',
      session: '20 min easy + drills, then 4x6 min at threshold effort (RPE 7/10) with 2 min easy jog, then 6x20s cadence-focused strides, cool-down 10 min.',
      why: [
        'Cadence/economy pattern suggests overstriding risk at work pace.',
        'Threshold blocks + short strides improve economy without maximal stress.',
      ],
    };
  }

  if (r >= 75) {
    return {
      title: 'Quality Session (Progressive)',
      objective: 'Drive adaptation with controlled high-quality work.',
      session: sport === 'running'
        ? 'Warm-up 20 min, 5x4 min VO2 effort (RPE 8/10) with 3 min easy jog, cool-down 15 min.'
        : 'Warm-up 20 min, 5x4 min VO2 power (110-120% FTP) with 4 min easy spin, cool-down 15 min.',
      why: [
        'Readiness and freshness support a strong stimulus.',
        'Current status indicates capacity for quality progression.',
      ],
    };
  }

  return {
    title: 'Aerobic Durability Session',
    objective: 'Expand base capacity and reinforce consistency.',
    session: sport === 'running'
      ? '60-80 min Z2 steady run, last 10 min slightly faster but controlled.'
      : '90-150 min Z2 ride with last 20 min upper-Z2 if legs stay smooth.',
    why: [
      'Supports long-term adaptation with low risk.',
      'Builds durability foundation for next quality block.',
    ],
  };
}

export function buildWeeklyReadinessForecast(baseCheckin) {
  const base = computeReadinessScore(baseCheckin).score;
  // Conservative 7-day readiness trend (can be replaced later with real daily inputs).
  // Slight mid-week dip and weekend rebound pattern.
  const deltas = [0, -3, -6, -4, -2, +1, +2];
  return deltas.map((d, i) => ({
    dayIndex: i,
    score: clamp(base + d, 0, 100),
  }));
}

function sessionHardness(sessionText = '') {
  const s = sessionText.toLowerCase();
  if (s.includes('vo2') || s.includes('108-115%') || s.includes('110-120%') || s.includes('threshold') || s.includes('интервал')) return 'high';
  if (s.includes('tempo') || s.includes('durability') || s.includes('порог') || s.includes('темп')) return 'medium';
  return 'low';
}

function preferredDayTypesForWorkout(workout) {
  const t = `${workout?.title || ''} ${workout?.session || ''}`.toLowerCase();
  if (t.includes('recovery') || t.includes('regeneration') || t.includes('восстанов')) return ['recovery', 'aerobic'];
  if (t.includes('pyramid') || t.includes('vo2') || t.includes('quality') || t.includes('интервал')) return ['interval', 'tempo', 'test'];
  if (t.includes('durability')) return ['long', 'aerobic', 'tempo'];
  return ['tempo', 'interval', 'aerobic', 'long'];
}

function minReadinessForHardness(h) {
  if (h === 'high') return 68;
  if (h === 'medium') return 58;
  return 45;
}

function dayTypeScore(dayType, preferred) {
  const idx = preferred.indexOf(dayType);
  return idx === -1 ? 0 : Math.max(0, 18 - idx * 4);
}

function isHardDay(day) {
  return (day?.intensity ?? 0) >= 70 || day?.type === 'interval' || day?.type === 'tempo';
}

function coherenceScore(days, chosenIndex, readinessForecast, minReadiness) {
  if (!days?.length || chosenIndex == null || chosenIndex < 0) return 0;
  const hardDays = days.filter(isHardDay).length;
  const chosenReadiness = readinessForecast?.[chosenIndex]?.score ?? 50;
  const leftHard = chosenIndex > 0 ? isHardDay(days[chosenIndex - 1]) : false;
  const rightHard = chosenIndex < days.length - 1 ? isHardDay(days[chosenIndex + 1]) : false;
  const spacingPenalty = leftHard || rightHard ? 15 : 0;
  const readinessPenalty = chosenReadiness < minReadiness ? (minReadiness - chosenReadiness) * 1.2 : 0;
  const hardPenalty = hardDays > 3 ? (hardDays - 3) * 8 : 0;

  return clamp(Math.round(100 - spacingPenalty - readinessPenalty - hardPenalty), 0, 100);
}

export function alignPrescriptionToWeekPlan({ weekDays = [], prescription, readinessForecast = [] }) {
  if (!weekDays.length || !prescription) {
    return {
      alignedDays: weekDays,
      chosenIndex: null,
      coherence: 0,
      fallbackUsed: false,
      reason: 'No plan/prescription.',
    };
  }

  const preferredTypes = preferredDayTypesForWorkout(prescription);
  const hard = sessionHardness(prescription.session || '');
  const minReady = minReadinessForHardness(hard);

  const candidates = weekDays
    .map((d, i) => {
      if (d.type === 'rest') return null;
      const readiness = readinessForecast?.[i]?.score ?? 50;
      const hardNeighbor =
        (i > 0 && isHardDay(weekDays[i - 1])) ||
        (i < weekDays.length - 1 && isHardDay(weekDays[i + 1]));
      const score =
        dayTypeScore(d.type, preferredTypes) +
        readiness * 0.7 -
        (hardNeighbor ? 12 : 0) -
        (readiness < minReady ? (minReady - readiness) * 1.4 : 0);
      return { i, day: d, readiness, score, hardNeighbor };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const chosen = candidates[0] || { i: 0, readiness: 50 };
  const fallbackUsed = chosen.readiness < minReady;
  const chosenIndex = chosen.i;
  const coherence = coherenceScore(weekDays, chosenIndex, readinessForecast, minReady);

  const assigned = {
    title: prescription.title,
    objective: prescription.objective,
    session: fallbackUsed
      ? 'Fallback: 45-75 min aerobic Z2, no hard intervals today.'
      : prescription.session,
    why: fallbackUsed
      ? [
          `Readiness ${chosen.readiness} below required ${minReady} for planned intensity.`,
          'Session was auto-downgraded to preserve adaptation and reduce risk.',
        ]
      : prescription.why,
    hardness: hard,
    fallbackUsed,
  };

  const alignedDays = weekDays.map((d, idx) => (
    idx === chosenIndex
      ? { ...d, coachSession: assigned }
      : { ...d }
  ));

  const reason = fallbackUsed
    ? `Assigned to ${alignedDays[chosenIndex]?.day}. Fallback applied due to low forecast readiness.`
    : `Assigned to ${alignedDays[chosenIndex]?.day} as best-fit quality slot.`;

  return {
    alignedDays,
    chosenIndex,
    coherence,
    fallbackUsed,
    reason,
    requiredReadiness: minReady,
    chosenReadiness: chosen.readiness,
  };
}
