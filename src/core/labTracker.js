/**
 * labTracker.js — Lab value parsing, trend analysis, and endurance-specific ranges.
 * Pure functions, no React.
 */

export const ENDURANCE_MARKERS = {
  ferritin:        { unit: 'ng/mL',  athleteLow: 30,  athleteHigh: 150, warning: 'Low ferritin impairs oxygen transport and VO2max.' },
  hemoglobin:      { unit: 'g/dL',   athleteLow: 13.5, athleteHigh: 17.5, warning: 'Low hemoglobin = reduced aerobic capacity.' },
  vitamin_d:       { unit: 'ng/mL',  athleteLow: 40,  athleteHigh: 60,  warning: 'Sub-40 linked to stress fractures and immune issues.' },
  tsh:             { unit: 'mIU/L',  athleteLow: 0.5, athleteHigh: 2.5, warning: 'Thyroid affects metabolism and recovery rate.' },
  crp:             { unit: 'mg/L',   athleteLow: 0,   athleteHigh: 1.0, warning: 'Elevated CRP = systemic inflammation. Reduce load.' },
  cortisol_am:     { unit: 'mcg/dL', athleteLow: 6,   athleteHigh: 18,  warning: 'Abnormal cortisol suggests overtraining or adrenal stress.' },
  testosterone:    { unit: 'ng/dL',  athleteLow: 300, athleteHigh: 1000, warning: 'Low T impairs recovery and adaptation.' },
  creatine_kinase: { unit: 'U/L',    athleteLow: 30,  athleteHigh: 200, warning: 'Elevated CK post-training = muscle damage. Rest.' },
  hematocrit:      { unit: '%',      athleteLow: 36,  athleteHigh: 52,  warning: 'Low hematocrit reduces oxygen-carrying capacity.' },
  b12:             { unit: 'pg/mL',  athleteLow: 300, athleteHigh: 900, warning: 'Low B12 causes fatigue and impaired nerve function.' },
};

/**
 * trendAnalysis — determine if a marker is improving or declining over time.
 */
export function trendAnalysis(labValues, marker) {
  const points = (labValues ?? [])
    .filter(v => v.marker === marker)
    .sort((a, b) => new Date(a.test_date) - new Date(b.test_date));

  if (points.length < 2) return { trend: 'insufficient', delta: 0 };

  const first = points[0].value;
  const last  = points[points.length - 1].value;
  const deltaPct = ((last - first) / first) * 100;

  const ref = ENDURANCE_MARKERS[marker];
  const isImproving = ref
    ? (first < ref.athleteLow  && last > first)   // was low, going up
    || (first > ref.athleteHigh && last < first)  // was high, going down
    || (first >= ref.athleteLow && first <= ref.athleteHigh && Math.abs(deltaPct) < 10) // was normal, staying normal
    : deltaPct > 0;

  return {
    trend:      isImproving ? 'improving' : 'declining',
    deltaPct:   parseFloat(deltaPct.toFixed(1)),
    firstValue: first,
    lastValue:  last,
    firstDate:  points[0].test_date,
    lastDate:   points[points.length - 1].test_date,
    count:      points.length,
  };
}

/**
 * flaggedMarkers — return markers outside athlete-optimal range.
 */
export function flaggedMarkers(labValues) {
  const latest = {};
  for (const v of (labValues ?? [])) {
    if (!latest[v.marker] || new Date(v.test_date) > new Date(latest[v.marker].test_date)) {
      latest[v.marker] = v;
    }
  }
  return Object.values(latest).filter(v => {
    const ref = ENDURANCE_MARKERS[v.marker];
    if (!ref) return v.is_flagged;
    return v.value < ref.athleteLow || v.value > ref.athleteHigh;
  });
}

/**
 * buildLabDigest — compact string for coach prompt inclusion.
 */
export function buildLabDigest(labValues) {
  if (!labValues?.length) return '';
  const trends = Object.keys(ENDURANCE_MARKERS)
    .map(marker => {
      const t = trendAnalysis(labValues, marker);
      if (t.trend === 'insufficient') return null;
      const ref = ENDURANCE_MARKERS[marker];
      return `${marker}: ${t.lastValue} ${ref.unit} (${t.trend}, ${t.deltaPct > 0 ? '+' : ''}${t.deltaPct}%)`;
    })
    .filter(Boolean)
    .slice(0, 5);
  return trends.length ? `lab trends: ${trends.join(', ')}` : '';
}

/**
 * parseLabValuesFromAI — extract structured lab values from AI analysis text.
 * Expected format: JSON array in the AI response.
 */
export function parseLabValuesFromAI(aiText, documentId) {
  try {
    const match = aiText.match(/"labValues"\s*:\s*(\[[\s\S]*?\])/);
    if (!match) return [];
    const raw = JSON.parse(match[1]);
    return raw.map(v => ({
      document_id:    documentId ?? null,
      test_date:      new Date().toISOString().slice(0, 10),
      marker:         String(v.marker ?? '').toLowerCase().replace(/\s+/g, '_'),
      value:          Number(v.value),
      unit:           String(v.unit ?? ''),
      reference_low:  v.refLow != null ? Number(v.refLow) : null,
      reference_high: v.refHigh != null ? Number(v.refHigh) : null,
      is_flagged:     !!v.flagged,
    })).filter(v => v.marker && Number.isFinite(v.value));
  } catch {
    return [];
  }
}
