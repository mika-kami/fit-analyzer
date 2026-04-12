/**
 * gearModel.js - Gear defaults, matching, derived usage totals, and warnings.
 * Pure functions only.
 */

export const GEAR_DEFAULTS = {
  shoes:            { sport: 'running', maxKm: 700, warning: 'Running shoes lose cushioning as mileage builds.' },
  insoles:          { sport: 'running', maxKm: 500, warning: 'Insoles usually wear out before shoes.' },
  bike:             { sport: 'cycling', maxKm: null, serviceKm: null, warning: null },
  tires:            { sport: 'cycling', maxKm: 5000, warning: 'Tire grip and puncture resistance degrade over time.' },
  chain:            { sport: 'cycling', maxKm: 3000, warning: 'A worn chain accelerates cassette wear.' },
  cassette:         { sport: 'cycling', maxKm: 12000, warning: 'Cassette wear grows quickly once the chain is overdue.' },
  crankset:         { sport: 'cycling', maxKm: 25000, warning: 'Crankset wear progresses with mileage and drivetrain stress.' },
  brakes:           { sport: 'cycling', maxKm: 8000, warning: 'Brake pads and braking surface wear over distance.' },
  chain_cleaning:   { sport: 'cycling', maxKm: null, serviceKm: 300, warning: 'Chain cleaning service is due.' },
  chain_waxing:     { sport: 'cycling', maxKm: null, serviceKm: 500, warning: 'Chain waxing refresh is due.' },
  brakes_service:   { sport: 'cycling', maxKm: null, serviceKm: 2000, warning: 'Brake inspection or service is due.' },
  shifting_service: { sport: 'cycling', maxKm: null, serviceKm: 1500, warning: 'Shifting adjustment is due.' },
  helmet:           { sport: 'cycling', maxKm: null, serviceKm: null, warning: null },
};

export const GEAR_TYPE_OPTIONS = Object.keys(GEAR_DEFAULTS);

function isCyclingSport(sportLabel = '') {
  const s = String(sportLabel || '').toLowerCase();
  return (
    s.includes('cycl') ||
    s.includes('bike') ||
    s.includes('road') ||
    s.includes('ride') ||
    s.includes('velo') ||
    s.includes('mtb') ||
    s.includes('gravel') ||
    s.includes('spin')
  );
}

function isHikingSport(sportLabel = '') {
  const s = String(sportLabel || '').toLowerCase();
  return (
    s.includes('hik') ||
    s.includes('walk') ||
    s.includes('trek') ||
    s.includes('mountaineer')
  );
}

function isRunningSport(sportLabel = '') {
  const s = String(sportLabel || '').toLowerCase();
  return (
    s.includes('run') ||
    s.includes('jog') ||
    s.includes('tread')
  );
}

function classifyWorkoutKind(sportLabel = '') {
  if (isCyclingSport(sportLabel)) return 'cycling';
  if (isHikingSport(sportLabel)) return 'hiking';
  if (isRunningSport(sportLabel)) return 'running';
  return 'other';
}

function typeSupportsWorkout(type, workoutKind) {
  const cyclingOnlyTypes = new Set([
    'bike',
    'tires',
    'chain',
    'cassette',
    'crankset',
    'brakes',
    'chain_cleaning',
    'chain_waxing',
    'brakes_service',
    'shifting_service',
    'helmet',
  ]);
  if (cyclingOnlyTypes.has(type)) return workoutKind === 'cycling';
  if (type === 'shoes' || type === 'insoles') return workoutKind === 'running' || workoutKind === 'hiking';
  return true;
}

function itemSportMatches(itemSport, workoutKind, sportLabel) {
  const sport = String(itemSport || '').trim().toLowerCase();
  if (!sport) return true;
  if (sport === 'cycling') return workoutKind === 'cycling';
  if (sport === 'running') return workoutKind === 'running' || workoutKind === 'hiking';
  if (sport === 'hiking') return workoutKind === 'hiking';
  if (sport === 'swimming') return String(sportLabel || '').toLowerCase().includes('swim');
  return String(sportLabel || '').toLowerCase().includes(sport);
}

function matchesSport(item, sportLabel) {
  const workoutKind = classifyWorkoutKind(sportLabel);
  if (!typeSupportsWorkout(item?.type, workoutKind)) return false;
  return itemSportMatches(item?.sport, workoutKind, sportLabel);
}

function bikeMatches(item, workout) {
  if (!item.bike_name) return true;
  const workoutBike = String(workout?.bike ?? '').trim().toLowerCase();
  return !!workoutBike && workoutBike === String(item.bike_name).trim().toLowerCase();
}

function workoutGearIds(workout) {
  const ids = workout?.gearIds ?? workout?.summary_json?.gearIds ?? [];
  return Array.isArray(ids) ? ids : [];
}

export function normalizeGearItem(item) {
  const preset = GEAR_DEFAULTS[item?.type] || {};
  return {
    id: item?.id,
    name: item?.name ?? '',
    type: item?.type ?? 'shoes',
    sport: item?.sport ?? preset.sport ?? 'running',
    brand: item?.brand ?? '',
    bike_name: item?.bike_name ?? '',
    parent_gear_id: item?.parent_gear_id ?? null,
    notes: item?.notes ?? '',
    default_for_new: !!item?.default_for_new,
    max_distance_m: item?.max_distance_m ?? (preset.maxKm ? preset.maxKm * 1000 : null),
    service_interval_m: item?.service_interval_m ?? (preset.serviceKm ? preset.serviceKm * 1000 : null),
    is_retired: !!item?.is_retired,
    added_at: item?.added_at ?? new Date().toISOString(),
    total_distance_m: item?.total_distance_m ?? 0,
    total_sessions: item?.total_sessions ?? 0,
  };
}

export function gearStatus(item) {
  const thresholdM = item.service_interval_m || item.max_distance_m;
  const usedM = item.total_distance_m ?? 0;
  if (!thresholdM || item.is_retired) return { pct: null, alert: 'none', kind: 'info', remainingKm: null };

  const pct = (usedM / thresholdM) * 100;
  const alert = pct >= 100 ? 'overdue' : pct >= 90 ? 'soon' : pct >= 75 ? 'watch' : 'none';
  return {
    pct: Math.round(pct),
    alert,
    kind: item.service_interval_m ? 'service' : 'lifecycle',
    remainingKm: Math.max(0, Math.round((thresholdM - usedM) / 1000)),
  };
}

export function matchGearToWorkout(gear, sportLabel, workout = null) {
  return (gear ?? []).filter((g) => {
    if (g.is_retired) return false;
    if (!matchesSport(g, sportLabel)) return false;
    if (!bikeMatches(g, workout)) return false;
    return true;
  });
}

export function defaultGearForWorkout(gear, workout) {
  return matchGearToWorkout(gear, workout?.sport ?? workout?.sportLabel, workout)
    .filter((g) => g.default_for_new);
}

export function deriveGearStats(gear, workouts = []) {
  const totals = new Map();
  for (const item of gear ?? []) totals.set(item.id, { distance: 0, sessions: 0 });

  for (const workout of workouts ?? []) {
    const ids = workoutGearIds(workout);
    const seen = new Set();
    for (const id of ids) {
      if (!totals.has(id) || seen.has(id)) continue;
      const entry = totals.get(id);
      entry.distance += Math.round(workout?.distance ?? 0);
      entry.sessions += 1;
      seen.add(id);
    }
  }

  return (gear ?? []).map((item) => {
    const normalized = normalizeGearItem(item);
    const total = totals.get(item.id) || { distance: 0, sessions: 0 };
    return {
      ...normalized,
      total_distance_m: total.distance,
      total_sessions: total.sessions,
    };
  });
}

export function primaryGearForWorkout(gear, sportLabel, workout = null) {
  const candidates = matchGearToWorkout(gear, sportLabel, workout);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (b.total_sessions ?? 0) - (a.total_sessions ?? 0))[0];
}
