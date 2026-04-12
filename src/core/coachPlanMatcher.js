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
import { buildDescribePrompt } from '../llm/prompts/index.js';

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
