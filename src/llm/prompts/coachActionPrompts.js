import { buildHistoryDigest, buildWorkoutSnapshot } from '../../core/coachDigest.js';

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
  const forecastText = ctx?.forecastText || null;
  const coachTake = ctx?.coachTake || null;

  const weatherSection = forecastText || weatherLine(weather);
  const snapshot = buildWorkoutSnapshot(workout);
  const trend = buildHistoryDigest(recent.slice(0, 10));

  if (actionType === 'analyze_ride') {
    return `${BASE_PERSONA}\n${snapshot}\n${trend}\nAnalyze this workout in 4 short bullet points: what worked, what failed, risk, do-next.`;
  }

  if (actionType === 'plan_week') {
    const planDigest = ctx?.planDigest || '';
    const hasPlan = planDigest.length > 0;

    if (hasPlan) {
      return `${BASE_PERSONA}
Athlete: ${athleteDigest}
${trend}
Readiness: ${readiness?.score ?? 'n/a'} (${readiness?.label || 'unknown'}).
${weatherSection}

THIS WEEK'S PLAN (computed by training engine — do NOT regenerate):
${planDigest}

Walk the athlete through this week's plan. For each training day:
- Confirm the session type and target makes sense given current TSB and readiness
- Give 1–2 concrete execution tips (HR zone, pace, cadence, or RPE)
- Flag any day that looks misaligned with today's readiness or weather

Keep it under 200 words. Be direct. End with one sentence on what to focus on most this week.`;
    }

    return `${BASE_PERSONA}
Athlete: ${athleteDigest}
${trend}
Readiness: ${readiness?.score ?? 'n/a'} (${readiness?.label || 'unknown'}).
${weatherSection}
No training plan is active yet. Suggest a practical 7-day structure with session types and rough targets. Keep it under 150 words.`;
  }

  if (actionType === 'wearing') {
    return `${BASE_PERSONA}\n${weatherSection}\nSport: ${workout?.sportLabel || ctx?.targetSport || 'endurance training'}.\nGive clothing and gear recommendation for today's session in 3 bullets.`;
  }

  if (actionType === 'recovery_check') {
    const last3 = recent.slice(0, 3).map((w) => buildWorkoutSnapshot(w)).join('\n');
    return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\nReadiness: ${readiness?.score ?? 'n/a'} (${readiness?.label || 'unknown'}).\nLast sessions:\n${last3}\nAssess recovery status and what to do in next 24-48h.`;
  }

  if (actionType === 'nutrition') {
    return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\n${snapshot}\n${weatherSection}\nCreate pre/during/post fueling plan with quantities and timing.`;
  }

  if (actionType === 'weekly_review') {
    return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\n${trend}\nProvide weekly review: wins, misses, trends, and 3 priorities for next week.`;
  }

  if (actionType === 'deep_analysis') {
    return `${BASE_PERSONA}\n${snapshot}\n${trend}\n${coachTake ? `Deterministic coach take: ${coachTake.verdict} ${coachTake.next}` : ''}\nGive a deeper analysis and specific training prescription.`;
  }

  return `${BASE_PERSONA}\nAthlete: ${athleteDigest}\n${snapshot}\n${trend}\nAnswer the user's request with concrete coaching actions.`;
}
