/**
 * coachPlanMatcher.js
 *
 * The algo (trainingEngine.js) owns the plan entirely:
 * type, intensity, targetKm, load phase, TSB, everything.
 *
 * This module does ONE thing:
 *   → Feed the fully-computed plan to the AI and get back a
 *     per-day coaching brief that explains what to do and why.
 *
 * AI is a narrator. It never changes numbers.
 */

import { buildHistoryDigest } from './coachDigest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Serialise a plan day into a dense single-line string the model can read fast
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_LABELS = {
  rest:       'Rest',
  recovery:   'Easy recovery',
  aerobic:    'Aerobic base',
  tempo:      'Tempo',
  interval:   'Intervals',
  long:       'Long run/ride',
  race:       'Race',
  crossTrain: 'Cross-training',
};

function serialiseDay(d, i) {
  const label = SESSION_LABELS[d.type] ?? d.type;
  const parts = [
    label,
    d.targetKm   ? `${d.targetKm}km`   : '',
    d.targetMins ? `${d.targetMins}min` : '',
    d.intensity  != null ? `load${d.intensity}` : '',
    d.phase      ? `phase:${d.phase}`  : '',
    d.feel       ? `feel:${d.feel}`    : '',
  ].filter(Boolean).join(' ');
  return `${i}|${d.day}|${parts}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} weekDays  - fully computed days from trainingEngine
 * @param {object}   ctx       - { athleteDigest, historyDigest, tsb, readiness, weather }
 */
export function buildDescribePrompt(weekDays, ctx) {
  const plan    = weekDays.map(serialiseDay).join('\n');
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

// ─────────────────────────────────────────────────────────────────────────────
// LLM call
// ─────────────────────────────────────────────────────────────────────────────

const LLM_URL = import.meta.env.VITE_LLM_URL  ?? 'https://api.openai.com/v1/chat/completions';
const MODEL   = import.meta.env.VITE_LLM_MODEL ?? 'gpt-4o-mini';
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? '';

// 7 days × ~80 tokens output + headroom for reasoning models
const MAX_TOKENS = parseInt(import.meta.env.VITE_LLM_MAX_TOKENS ?? '2000', 10);

async function callLLM(prompt) {
  const res = await fetch(LLM_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model:                 MODEL,
      max_completion_tokens: MAX_TOKENS,
      messages:              [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = await res.json();
  const raw  = data?.choices?.[0]?.message?.content ?? '';
  return raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Attach — algo data is never mutated
// ─────────────────────────────────────────────────────────────────────────────

function attachDescriptions(weekDays, descriptions) {
  const map = new Map(descriptions.map(d => [Number(d.index), d]));
  return weekDays.map((day, i) => {
    const desc = map.get(i);
    if (!desc) return day;
    return {
      ...day,
      // Pure display fields — nothing the algo computed is touched
      aiTitle:   desc.title  ?? null,
      aiCues:    Array.isArray(desc.cues)    ? desc.cues    : [],
      aiFueling: Array.isArray(desc.fueling) ? desc.fueling : [],
      aiWhy:     desc.why    ?? null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach AI-generated coaching descriptions to a fully-computed week plan.
 * The algo output is preserved exactly — only display fields are added.
 * Falls back to the original days silently on any failure.
 *
 * @param   {object[]} weekDays  - days from trainingEngine.generateTrainingPlan()
 * @param   {object}   ctx       - build with buildDescribeContext()
 * @returns {Promise<object[]>}
 */
export async function describeWeekPlan(weekDays, ctx) {
  if (!weekDays?.length) return weekDays ?? [];
  try {
    const prompt = buildDescribePrompt(weekDays, ctx);
    const json   = await callLLM(prompt);
    const descs  = JSON.parse(json);
    if (!Array.isArray(descs)) throw new TypeError('Expected array');
    return attachDescriptions(weekDays, descs);
  } catch (err) {
    console.warn('[coachPlanMatcher] describe failed, using raw plan:', err.message);
    return weekDays;
  }
}

/**
 * Assemble the context object from app state.
 *
 * @param {object} param0
 * @returns {object}
 */
export function buildDescribeContext({
  athleteDigest  = '',
  recentWorkouts = [],
  readiness      = null,
  load           = null,
  weather        = null,
  sport          = 'running',
}) {
  return {
    athleteDigest,
    historyDigest: buildHistoryDigest(recentWorkouts.slice(0, 6)),
    tsb:           load?.tsb ?? 0,
    readiness,
    weather,
    sport,
  };
}