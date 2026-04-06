import { buildHistoryDigest, buildWorkoutSnapshot } from './coachDigest.js';

const BASE_PERSONA = 'You are a direct, data-driven endurance coach. Be concise, specific, and end with clear next actions.';

function weatherLine(weather) {
  if (!weather) return 'Weather: unavailable.';
  return `Weather: ${weather.tempC}°C, feels ${weather.feelsLikeC ?? weather.tempC}°C, wind ${weather.windKmh} km/h ${weather.windDir || ''}.`;
}

export function buildActionPrompt(actionType, ctx) {
  const workout = ctx?.workout || null;
  const recent = ctx?.recentWorkouts || [];
  const readiness = ctx?.readiness;
  const athleteDigest = ctx?.athleteDigest || 'Athlete digest unavailable.';
  const weather = ctx?.weather || null;
  const coachTake = ctx?.coachTake || null;

  const snapshot = buildWorkoutSnapshot(workout);
  const trend = buildHistoryDigest(recent.slice(0, 10));

  if (actionType === 'analyze_ride') {
    return `${BASE_PERSONA}\n${snapshot}\n${trend}\nAnalyze this workout in 4 short bullet points: what worked, what failed, risk, do-next.`;
  }

  if (actionType === 'plan_week') {
    return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\n${trend}\nReadiness: ${readiness?.score ?? 'n/a'} (${readiness?.label || 'unknown'}).\n${weatherLine(weather)}\nBuild a practical 7-day plan with day-by-day session goals.`;
  }

  if (actionType === 'wearing') {
    return `${BASE_PERSONA}\n${weatherLine(weather)}\nSport: ${workout?.sportLabel || ctx?.targetSport || 'endurance training'}.\nGive clothing and gear recommendation for today's session in 3 bullets.`;
  }

  if (actionType === 'recovery_check') {
    const last3 = recent.slice(0, 3).map((w) => buildWorkoutSnapshot(w)).join('\n');
    return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\nReadiness: ${readiness?.score ?? 'n/a'} (${readiness?.label || 'unknown'}).\nLast sessions:\n${last3}\nAssess recovery status and what to do in next 24-48h.`;
  }

  if (actionType === 'nutrition') {
    return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\n${snapshot}\n${weatherLine(weather)}\nCreate pre/during/post fueling plan with quantities and timing.`;
  }

  if (actionType === 'weekly_review') {
    return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\n${trend}\nProvide weekly review: wins, misses, trends, and 3 priorities for next week.`;
  }

  if (actionType === 'deep_analysis') {
    return `${BASE_PERSONA}\n${snapshot}\n${trend}\n${coachTake ? `Deterministic coach take: ${coachTake.verdict} ${coachTake.next}` : ''}\nGive a deeper analysis and specific training prescription.`;
  }

  return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\n${snapshot}\n${trend}\nAnswer the user's request with concrete coaching actions.`;
}
