function daysSince(isoDate) {
  if (!isoDate) return null;
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  dt.setHours(0, 0, 0, 0);
  return Math.round((now - dt) / 86400000);
}

export function generateCoachAlerts({ profile, weather, history, readiness, prescription, load }) {
  const alerts = [];
  const medical = profile?.medical ?? {};
  const todaySport = String(prescription?.session || profile?.targetSport || '').toLowerCase();
  const todayHasWorkout = prescription?.type && prescription.type !== 'rest';

  if (medical.ironDeficiency && todayHasWorkout) {
    alerts.push('Iron deficiency flagged: keep supplementation timing consistent before training.');
  }

  if ((weather?.windKmh ?? 0) > 20 && (todaySport.includes('cycl') || todaySport.includes('bike'))) {
    alerts.push('Wind above 20 km/h: prefer sheltered route or indoor trainer.');
  }

  const bloodworkAge = daysSince(medical.lastBloodwork);
  if (bloodworkAge != null && bloodworkAge > 120) {
    alerts.push('Last bloodwork is 4+ months old: consider a retest window.');
  }

  if (medical.asthma && Number.isFinite(weather?.tempC) && weather.tempC < 5) {
    alerts.push('Cold-air asthma risk: longer warm-up and cover airway in low temperatures.');
  }

  if ((load?.tsb ?? 0) < -15) {
    alerts.push('TSB indicates fatigue: keep intensity controlled and prioritize recovery.');
  }

  const recent = Array.isArray(history) ? history : [];
  const lastWorkoutDate = recent[0]?.date || null;
  const idleDays = daysSince(lastWorkoutDate);
  if (idleDays != null && idleDays > 5) {
    alerts.push('No sessions for 5+ days: ease back in to avoid detraining shock.');
  }

  const intensity = String(prescription?.intensity || '').toLowerCase();
  if ((readiness?.score ?? 50) < 40 && (intensity.includes('high') || intensity.includes('hard'))) {
    alerts.push('Readiness is low for high intensity today: downgrade to easy aerobic or recovery.');
  }

  return alerts.slice(0, 4);
}

export function buildDailyBriefing({ readiness, weather, prescription, history, profile, weekPlan, trainingStatus, load }) {
  const recent = Array.isArray(history) ? history : [];
  const sport = String(profile?.targetSport ?? 'mixed').toLowerCase();
  const matchesSport = (w) => {
    if (sport === 'mixed') return true;
    const s = String(w?.sport ?? w?.sportLabel ?? '').toLowerCase();
    return s.includes(sport) || (sport === 'cycling' && (s.includes('cycl') || s.includes('bike') || s.includes('ride'))) || (sport === 'running' && (s.includes('run') || s.includes('trail')));
  };
  const sessions7d = recent.filter((w) => daysSince(w?.date) != null && daysSince(w.date) <= 7 && matchesSport(w));
  const weekDistanceKm = sessions7d.reduce((sum, w) => sum + (Number(w?.distance ?? 0) / 1000), 0);
  const weekDone = sessions7d.length;
  const weekTargetSessions = Number(weekPlan?.targetSessions ?? 5);
  const weekTargetKm = Number(weekPlan?.targetKm ?? Math.max(80, (profile?.weeklyHours ?? 6) * 20));

  const todaySession = prescription?.session || 'Easy aerobic session';
  const why = prescription?.evidence || trainingStatus?.summary || 'Steady progression with controlled load.';

  const alerts = generateCoachAlerts({ profile, weather, history: recent, readiness, prescription, load });

  return {
    readinessLabel: readiness?.label || 'Unknown',
    readinessScore: readiness?.score ?? 50,
    trainingStatus: trainingStatus?.label || 'Steady Progress',
    tsb: load?.tsb ?? 0,
    weatherText: weather ? `${weather.tempC}°C, wind ${weather.windKmh} km/h ${weather.windDir || ''}`.trim() : 'Weather unavailable',
    todaySession,
    why,
    alerts,
    weekSummary: `${weekDone}/${weekTargetSessions} sessions · ${Math.round(weekDistanceKm)} km / ${Math.round(weekTargetKm)} km target`,
  };
}
