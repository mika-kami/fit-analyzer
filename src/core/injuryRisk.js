/**
 * injuryRisk.js — ACWR and monotony-based injury risk modeling.
 * Gabbett (2016): safe ACWR range 0.8–1.3; >1.5 = high injury risk.
 * Pure functions, no React.
 */

function dailyLoad(historyWorkouts, daysBack, fromIso) {
  const from = new Date(fromIso + 'T00:00:00Z');
  const loads = [];
  for (let d = 0; d < daysBack; d++) {
    const dt = new Date(from);
    dt.setUTCDate(from.getUTCDate() - d);
    const iso = dt.toISOString().slice(0, 10);
    const w = historyWorkouts.find(w => w.date === iso);
    loads.push(w ? (w.trainingEffect?.aerobic ?? 0) : 0);
  }
  return loads;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

/**
 * computeACWR — acute (7-day) to chronic (28-day) workload ratio.
 * Returns series of daily ACWR values for the past `days`.
 */
export function computeACWR(historyWorkouts, days = 90) {
  const today = new Date().toISOString().slice(0, 10);
  const result = [];

  for (let d = 0; d < days; d++) {
    const dt = new Date(today + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() - d);
    const iso = dt.toISOString().slice(0, 10);

    const acute   = mean(dailyLoad(historyWorkouts, 7, iso));
    const chronic = mean(dailyLoad(historyWorkouts, 28, iso));
    const acwr    = chronic > 0 ? parseFloat((acute / chronic).toFixed(2)) : null;

    result.unshift({ date: iso, acute: parseFloat(acute.toFixed(2)), chronic: parseFloat(chronic.toFixed(2)), acwr });
  }

  return result;
}

/**
 * computeMonotony — training variation over 7 days.
 * High monotony (>2.0) = repetitive training = higher injury risk.
 */
export function computeMonotony(historyWorkouts) {
  const today = new Date().toISOString().slice(0, 10);
  const loads = dailyLoad(historyWorkouts, 7, today);
  const m   = mean(loads);
  const sd  = stddev(loads);
  const monotony = sd > 0 ? parseFloat((m / sd).toFixed(2)) : 0;
  const weeklyLoad = loads.reduce((s, v) => s + v, 0);
  const strain = parseFloat((weeklyLoad * monotony).toFixed(2));

  return {
    monotony,
    strain,
    weeklyLoad: parseFloat(weeklyLoad.toFixed(2)),
    variation:  monotony < 1.0 ? 'good' : monotony < 2.0 ? 'moderate' : 'poor',
  };
}

/**
 * currentACWR — just the latest ACWR value.
 */
export function currentACWR(historyWorkouts) {
  const today = new Date().toISOString().slice(0, 10);
  const acute   = mean(dailyLoad(historyWorkouts, 7, today));
  const chronic = mean(dailyLoad(historyWorkouts, 28, today));
  return chronic > 0 ? parseFloat((acute / chronic).toFixed(2)) : null;
}

/**
 * acwrRiskLabel — human-readable risk assessment.
 */
export function acwrRiskLabel(acwr) {
  if (acwr == null)  return { label: 'Unknown',   color: '#6b7280', risk: 'unknown' };
  if (acwr < 0.8)    return { label: 'Detraining', color: '#60a5fa', risk: 'low'    };
  if (acwr <= 1.3)   return { label: 'Safe zone',  color: '#4ade80', risk: 'safe'   };
  if (acwr <= 1.5)   return { label: 'Caution',    color: '#fbbf24', risk: 'medium' };
  return               { label: 'Danger zone', color: '#ef4444', risk: 'high'   };
}
