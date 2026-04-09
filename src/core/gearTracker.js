/**
 * gearTracker.js — Equipment mileage tracking and replacement thresholds.
 * Pure functions, no React.
 */

export const GEAR_DEFAULTS = {
  shoes:   { maxKm: 700,  warning: 'Running shoes lose ~40% cushioning by 700km.' },
  bike:    { maxKm: null, warning: null },
  tires:   { maxKm: 5000, warning: 'Road tires: grip degrades after 5000km.' },
  chain:   { maxKm: 3000, warning: 'Chain stretch increases cassette wear.' },
  insoles: { maxKm: 500,  warning: 'Insole support degrades faster than shoes.' },
  helmet:  { maxKm: null, warning: null },
};

export const GEAR_SPORT = {
  shoes:   'running',
  bike:    'cycling',
  tires:   'cycling',
  chain:   'cycling',
  insoles: 'running',
  helmet:  'cycling',
};

/**
 * gearStatus — compute usage percentage and alert level for a gear item.
 */
export function gearStatus(item) {
  const maxM = item.max_distance_m;
  const usedM = item.total_distance_m ?? 0;
  if (!maxM || item.is_retired) return { pct: null, alert: 'none' };

  const pct = (usedM / maxM) * 100;
  const alert = pct >= 100 ? 'overdue' : pct >= 90 ? 'soon' : pct >= 75 ? 'watch' : 'none';
  return { pct: Math.round(pct), alert, remainingKm: Math.max(0, Math.round((maxM - usedM) / 1000)) };
}

/**
 * matchGearToWorkout — find active gear that matches a workout's sport.
 */
export function matchGearToWorkout(gear, sportLabel) {
  const s = (sportLabel ?? '').toLowerCase();
  const isCycling = s.includes('cycl') || s.includes('bike');
  const isRunning = s.includes('run') || s.includes('hik') || s.includes('walk');

  return (gear ?? []).filter(g => {
    if (g.is_retired) return false;
    if (isCycling && g.sport === 'cycling') return true;
    if (isRunning  && g.sport === 'running') return true;
    return false;
  });
}

/**
 * primaryGearForWorkout — pick the most recently used active gear for a sport.
 */
export function primaryGearForWorkout(gear, sportLabel) {
  const candidates = matchGearToWorkout(gear, sportLabel);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.total_sessions ?? 0) - (a.total_sessions ?? 0))[0];
}
