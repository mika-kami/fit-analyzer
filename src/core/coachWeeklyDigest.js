export function buildWeeklyDigest(workouts = []) {
  const list = (Array.isArray(workouts) ? workouts : []).filter(Boolean);
  if (!list.length) {
    return {
      sessions: 0,
      distanceKm: 0,
      avgTe: 0,
      hardSessions: 0,
      sports: {},
    };
  }

  const sports = {};
  let distanceKm = 0;
  let teSum = 0;
  let teCount = 0;
  let hardSessions = 0;

  for (const w of list) {
    const sport = String(w?.sport ?? w?.sportLabel ?? 'other').toLowerCase();
    sports[sport] = (sports[sport] ?? 0) + 1;
    distanceKm += Number(w?.distance ?? 0) / 1000;
    const te = Number(w?.trainingEffect?.aerobic ?? 0);
    if (te > 0) {
      teSum += te;
      teCount += 1;
      if (te >= 3.5) hardSessions += 1;
    }
  }

  return {
    sessions: list.length,
    distanceKm: Number(distanceKm.toFixed(1)),
    avgTe: teCount ? Number((teSum / teCount).toFixed(1)) : 0,
    hardSessions,
    sports,
  };
}
