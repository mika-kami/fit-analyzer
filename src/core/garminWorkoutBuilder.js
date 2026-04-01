/**
 * garminWorkoutBuilder.js — Convert a training plan day into Garmin structured workout JSON.
 * Pure JS, no React, no external dependencies.
 */

const SPORT_TYPE = {
  cycling: { sportTypeId: 2, sportTypeKey: 'cycling' },
  running: { sportTypeId: 1, sportTypeKey: 'running' },
  other:   { sportTypeId: 0, sportTypeKey: 'generic' },
};

function hrZoneBounds(maxHr) {
  return {
    z1: { lo: Math.round(maxHr * 0.50), hi: Math.round(maxHr * 0.60) },
    z2: { lo: Math.round(maxHr * 0.60), hi: Math.round(maxHr * 0.70) },
    z3: { lo: Math.round(maxHr * 0.70), hi: Math.round(maxHr * 0.80) },
    z4: { lo: Math.round(maxHr * 0.80), hi: Math.round(maxHr * 0.90) },
    z5: { lo: Math.round(maxHr * 0.90), hi: maxHr },
  };
}

// stepTypeKey constants: warmup=1, cooldown=2, interval=3, recovery=4, rest=5, repeat=6, other=7
function makeStep(order, stepTypeId, stepTypeKey, durationSec, zoneIdLo, zoneIdHi) {
  if (zoneIdHi === undefined) zoneIdHi = zoneIdLo;
  return {
    type: 'ExecutableStepDTO',
    stepOrder: order,
    stepType: { stepTypeId, stepTypeKey },
    endCondition: { conditionTypeId: 2, conditionTypeKey: 'time' },
    endConditionValue: durationSec,
    targetType: { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.zone' },
    targetValueOne: zoneIdLo,
    targetValueTwo: zoneIdHi,
    description: '',
  };
}

function makeRepeat(order, iterations, steps) {
  return {
    type: 'RepeatGroupDTO',
    stepOrder: order,
    numberOfIterations: iterations,
    workoutSteps: steps,
    smartRepeat: false,
  };
}

function buildSteps(type, label, totalDurationSec) {
  const isVO2 = /vo[₂2]/i.test(label || '');

  switch (type) {
    case 'recovery': {
      return [makeStep(1, 7, 'other', totalDurationSec, 1)];
    }

    case 'aerobic': {
      const warmup = 15 * 60;
      const cooldown = 15 * 60;
      const main = Math.max(totalDurationSec - warmup - cooldown, 10 * 60);
      return [
        makeStep(1, 1, 'warmup',   warmup,   1),
        makeStep(2, 3, 'interval', main,      2),
        makeStep(3, 2, 'cooldown', cooldown,  1),
      ];
    }

    case 'long': {
      const warmup = 20 * 60;
      const cooldown = 20 * 60;
      const main = Math.max(totalDurationSec - warmup - cooldown, 15 * 60);
      return [
        makeStep(1, 1, 'warmup',   warmup,   1),
        makeStep(2, 3, 'interval', main,      2),
        makeStep(3, 2, 'cooldown', cooldown,  1),
      ];
    }

    case 'tempo': {
      return [
        makeStep(1, 1, 'warmup',   15 * 60, 1, 2),
        makeStep(2, 3, 'interval', 25 * 60, 3),
        makeStep(3, 2, 'cooldown', 15 * 60, 1),
      ];
    }

    case 'interval': {
      if (isVO2) {
        return [
          makeStep(1, 1, 'warmup', 15 * 60, 1, 2),
          makeRepeat(2, 5, [
            makeStep(1, 3, 'interval', 4 * 60, 5),
            makeStep(2, 4, 'recovery', 4 * 60, 1),
          ]),
          makeStep(3, 2, 'cooldown', 15 * 60, 1),
        ];
      }
      return [
        makeStep(1, 1, 'warmup', 15 * 60, 1, 2),
        makeRepeat(2, 4, [
          makeStep(1, 3, 'interval', 8 * 60, 4),
          makeStep(2, 4, 'recovery', 4 * 60, 1),
        ]),
        makeStep(3, 2, 'cooldown', 15 * 60, 1),
      ];
    }

    case 'test': {
      return [makeStep(1, 7, 'other', totalDurationSec, 1, 2)];
    }

    default:
      return [makeStep(1, 7, 'other', totalDurationSec, 1)];
  }
}

function estimateDurationSec(type, label, targetKm, sport) {
  const avgSpeedKmh = sport === 'running' ? 11 : 20;
  const fromDistance = targetKm > 0 ? Math.round((targetKm / avgSpeedKmh) * 3600) : 0;

  // For structured workouts, compute from the step durations
  switch (type) {
    case 'tempo':    return 55 * 60;  // 15 + 25 + 15
    case 'interval': {
      const isVO2 = /vo[₂2]/i.test(label || '');
      if (isVO2) return (15 + 5 * (4 + 4) + 15) * 60; // 70 min
      return (15 + 4 * (8 + 4) + 15) * 60; // 78 min
    }
    default:
      return fromDistance || 60 * 60; // fallback 1hr
  }
}

export function buildGarminWorkout(day, maxHr = 180) {
  if (!day || day.type === 'rest') return null;

  const sport = day.sport || 'cycling';
  const sportType = SPORT_TYPE[sport] || SPORT_TYPE.other;
  const totalSec = estimateDurationSec(day.type, day.label, day.targetKm, sport);
  const steps = buildSteps(day.type, day.label, totalSec);

  return {
    sportType,
    workoutName: day.label || 'Workout',
    description: day.desc || '',
    estimatedDurationInSecs: totalSec,
    estimatedDistanceInMeters: (day.targetKm || 0) * 1000,
    workoutSegments: [{
      segmentOrder: 1,
      sportType,
      workoutSteps: steps,
    }],
  };
}


