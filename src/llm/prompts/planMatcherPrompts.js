const SESSION_LABELS = {
  rest: 'Rest',
  recovery: 'Easy recovery',
  aerobic: 'Aerobic base',
  tempo: 'Tempo',
  interval: 'Intervals',
  long: 'Long run/ride',
  race: 'Race',
  crossTrain: 'Cross-training',
};

function serialiseDay(d, i) {
  const label = SESSION_LABELS[d.type] ?? d.type;
  const parts = [
    label,
    d.targetKm ? `${d.targetKm}km` : '',
    d.targetMins ? `${d.targetMins}min` : '',
    d.intensity != null ? `load${d.intensity}` : '',
    d.phase ? `phase:${d.phase}` : '',
    d.feel ? `feel:${d.feel}` : '',
  ].filter(Boolean).join(' ');
  return `${i}|${d.day}|${parts}`;
}

export function buildDescribePrompt(weekDays, ctx) {
  const plan = weekDays.map(serialiseDay).join('\n');
  const weather = ctx.weather
    ? `${ctx.weather.tempC}°C, wind ${ctx.weather.windKmh}km/h`
    : 'unknown';

  const sport = (ctx.sport ?? 'running').toLowerCase();
  const isCycling = sport.includes('cycl') || sport.includes('bike');

  const sportLine = isCycling
    ? 'SPORT: cycling. All sessions are on the bike. Use cycling-specific cues only.'
    : 'SPORT: running. All sessions are on foot. Use running-specific cues only.';

  const cueExamples = isCycling
    ? '["HR under 140", "cadence 88-92 rpm", "keep power Z2 150-180W"]'
    : '["HR under 140", "conversational pace", "cadence 170+ spm"]';

  return `Endurance coach. Describe each training day below for the athlete.
Athlete: ${ctx.athleteDigest || 'No profile.'}
Recent trend: ${ctx.historyDigest || 'No recent history.'}
TSB: ${(ctx.tsb ?? 0).toFixed(1)} | Readiness: ${ctx.readiness?.label ?? 'unknown'} | Weather: ${weather}
${sportLine}

Plan (index|day|type km min load phase feel):
${plan}

Return ONLY a JSON array — one object per day including rest days:
[
  {
    "index": 0,
    "title": "Easy 45min Z2 ride",
    "why": "TSB positive — build base without digging a hole",
    "cues": ${cueExamples},
    "fueling": ["500ml water pre-ride", "no carbs needed sub-60min", "protein within 30min after"]
  }
]

Rules:
- title: ≤ 8 words. Must reflect the sport (e.g. "ride", "run", not generic). Rest days: "Full rest" or "Active recovery walk"
- why: ≤ 15 words. Reference TSB, phase, readiness, or recent load
- cues: 2–3 execution cues ≤ 8 words each. ${isCycling ? 'Cycling only: power (W or %FTP), cadence (rpm), HR zone. No pace or stride cues.' : 'Running only: HR, pace (min/km), cadence (spm), RPE. No power or rpm cues.'}
- fueling: 2–3 items ≤ 10 words each. Cover pre/during/post. Include hydration volumes where useful (factor in weather). Rest days: recovery nutrition only
- No markdown, no extra keys, no preamble`;
}
