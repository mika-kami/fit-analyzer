/**
 * analyticsEngine.js — Pure computation for the Analytics tab.
 * CTL/ATL/TSB (Banister), Aerobic Efficiency, TE trends.
 * No React imports, no side effects.
 */

// ── Daily stress from workout history ────────────────────────────────────────
export function buildDailyStress(historyWorkouts) {
  if (!historyWorkouts?.length) return new Map();
  const map = new Map();
  for (const w of historyWorkouts) {
    if (!w.date) continue;
    const stress = w.trainingEffect?.aerobic ?? 0;
    if (stress <= 0) continue;
    // If multiple workouts on same day, sum stress
    map.set(w.date, (map.get(w.date) ?? 0) + stress);
  }
  return map;
}

// ── Exponential weighted moving average (Banister) ───────────────────────────
function ewma(dailyStress, days, tau) {
  if (!dailyStress.size) return [];

  // Find date range
  const allDates = [...dailyStress.keys()].sort();
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);

  const decay = Math.exp(-1 / tau);
  const gain = 1 - decay;
  const result = [];
  let value = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const stress = dailyStress.get(key) ?? 0;
    value = value * decay + stress * gain;
    result.push({ date: key, value: parseFloat(value.toFixed(2)) });
  }
  return result;
}

export function computeATL(dailyStress, days = 90) {
  return ewma(dailyStress, days, 7).map(p => ({ date: p.date, atl: p.value }));
}

export function computeCTL(dailyStress, days = 90) {
  return ewma(dailyStress, days, 42).map(p => ({ date: p.date, ctl: p.value }));
}

// ── TSB = CTL - ATL ─────────────────────────────────────────────────────────
export function computeTSB(ctlSeries, atlSeries) {
  if (!ctlSeries?.length || !atlSeries?.length) return [];
  const atlMap = new Map(atlSeries.map(p => [p.date, p.atl]));
  return ctlSeries.map(p => {
    const atl = atlMap.get(p.date) ?? 0;
    return {
      date: p.date,
      ctl: p.ctl,
      atl,
      tsb: parseFloat((p.ctl - atl).toFixed(2)),
    };
  });
}

// ── Form state detection ─────────────────────────────────────────────────────
export function detectFormState(tsb, ctl) {
  if (ctl < 20)
    return { label: 'Start', color: '#6b7280', description: 'Build your base' };
  if (tsb < -20)
    return { label: 'Перегрузка', color: '#ef4444', description: 'Высокий риск. Нужен отдых.' };
  if (tsb < 0)
    return { label: 'Accumulation', color: '#f97316', description: 'Fitness is growing' };
  if (tsb <= 10)
    return { label: 'Поддержание', color: '#fbbf24', description: 'Stable load' };
  return { label: 'Peak form', color: '#4ade80', description: 'Great time for racing' };
}

// ── Peak form prediction ─────────────────────────────────────────────────────
export function predictPeakForm(tsbSeries) {
  if (!tsbSeries?.length) return { date: null, daysUntil: null };

  const last = tsbSeries[tsbSeries.length - 1];
  if (!last) return { date: null, daysUntil: null };

  // Average stress over last 7 days
  const recent = tsbSeries.slice(-7);
  const stressMap = new Map();
  for (let i = 1; i < recent.length; i++) {
    // Approximate daily stress from ATL change: stress ≈ (atl - atl_prev * decay) / gain
    const decay = Math.exp(-1 / 7);
    const rawStress = (recent[i].atl - recent[i - 1].atl * decay) / (1 - decay);
    stressMap.set(recent[i].date, Math.max(0, rawStress));
  }
  const avgStress = stressMap.size
    ? [...stressMap.values()].reduce((s, v) => s + v, 0) / stressMap.size
    : 0;

  // Project forward 21 days
  let ctl = last.ctl;
  let atl = last.atl;
  const decayCTL = Math.exp(-1 / 42);
  const decayATL = Math.exp(-1 / 7);
  const gainCTL = 1 - decayCTL;
  const gainATL = 1 - decayATL;

  const today = new Date();
  for (let i = 1; i <= 21; i++) {
    ctl = ctl * decayCTL + avgStress * gainCTL;
    atl = atl * decayATL + avgStress * gainATL;
    const tsb = ctl - atl;
    if (tsb > 5) {
      const peakDate = new Date(today);
      peakDate.setDate(peakDate.getDate() + i);
      return {
        date: peakDate.toISOString().slice(0, 10),
        daysUntil: i,
      };
    }
  }
  return { date: null, daysUntil: null };
}

// ── Aerobic Efficiency (HR at Z2 speed) ──────────────────────────────────────
export function computeAET(historyWorkouts, speedBandKmhLo, speedBandKmhHi) {
  if (!historyWorkouts?.length) return [];
  const result = [];

  for (const w of historyWorkouts) {
    if (!w.timeSeries?.length || !w.date) continue;

    const pts = w.timeSeries.filter(
      p => p.speedKmh != null && p.hr != null && p.hr > 0
        && p.speedKmh >= speedBandKmhLo && p.speedKmh <= speedBandKmhHi
    );

    // Need at least 600s of data in band (timeSeries is downsampled x4, so ~150 points)
    if (pts.length < 150) continue;

    const avgHr = Math.round(pts.reduce((s, p) => s + p.hr, 0) / pts.length);
    result.push({ date: w.date, avgHr, sport: w.sport ?? w.sportLabel ?? 'Activity' });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Rolling average ──────────────────────────────────────────────────────────
export function computeRollingAvg(series, field, windowDays = 14) {
  if (!series?.length) return [];

  return series.map((item, idx) => {
    const itemDate = new Date(item.date);
    const windowStart = new Date(itemDate);
    windowStart.setDate(windowStart.getDate() - windowDays);

    const inWindow = series.filter((s, i) => {
      if (i > idx) return false;
      const d = new Date(s.date);
      return d >= windowStart && d <= itemDate;
    });

    const avg = inWindow.length
      ? parseFloat((inWindow.reduce((s, p) => s + (p[field] ?? 0), 0) / inWindow.length).toFixed(1))
      : item[field];

    return { ...item, rollingAvg: avg };
  });
}

// ── TE trend ─────────────────────────────────────────────────────────────────
export function computeTETrend(historyWorkouts) {
  if (!historyWorkouts?.length) return [];

  const points = historyWorkouts
    .filter(w => w.date && w.trainingEffect?.aerobic > 0)
    .map(w => ({
      date: w.date,
      te: w.trainingEffect.aerobic,
      sport: w.sport ?? w.sportLabel ?? 'Activity',
      id: w.id,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return computeRollingAvg(points, 'te', 14);
}


