import { useCallback, useMemo, useState } from 'react';
import { buildActionPrompt } from '../core/coachPrompts.js';
import { getWeather, formatWeatherForSystem } from './useOpenAI.js';

const OPENAI_URL = import.meta.env.VITE_LLM_URL ?? 'https://api.openai.com/v1/chat/completions';
const MODEL = import.meta.env.VITE_LLM_MODEL ?? 'gpt-4o-mini';
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? '';
const BASE_MAX_TOKENS = parseInt(import.meta.env.VITE_LLM_MAX_TOKENS ?? '2000', 10);

// Token budgets per action — reasoning models consume tokens before writing output
const ACTION_MAX_TOKENS = {
  plan_week:      Math.max(BASE_MAX_TOKENS, 2000),
  weekly_review:  Math.max(BASE_MAX_TOKENS, 2000),
  deep_analysis:  Math.max(BASE_MAX_TOKENS, 1500),
  analyze_ride:   Math.max(BASE_MAX_TOKENS, 1200),
  recovery_check: Math.max(BASE_MAX_TOKENS, 1200),
  nutrition:      Math.max(BASE_MAX_TOKENS, 1200),
  wearing:        Math.max(BASE_MAX_TOKENS, 800),
};

const ACTION_TTL_MS = {
  analyze_ride: 24 * 3600 * 1000,
  plan_week: 24 * 3600 * 1000,
  wearing: 6 * 3600 * 1000,
  recovery_check: 6 * 3600 * 1000,
  nutrition: 6 * 3600 * 1000,
  weekly_review: 7 * 24 * 3600 * 1000,
  deep_analysis: 24 * 3600 * 1000,
};

function makeCacheKey(userId, actionType, salt) {
  return `coach_action_cache_${userId || 'anon'}_${actionType}_${salt || 'default'}`;
}

function getCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCached(key, content, ttlMs) {
  try {
    localStorage.setItem(key, JSON.stringify({
      content,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    }));
  } catch {}
}

export function useCoachActions(userId, contextBuilder) {
  const [loadingAction, setLoadingAction] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState({});
  const hasKey = useMemo(() => API_KEY.startsWith('sk-') && API_KEY.length > 20, []);

  const runAction = useCallback(async (actionType, options = {}) => {
    const ctx = contextBuilder ? contextBuilder(options) : options;
    const salt = options.cacheSalt || ctx?.workout?.id || ctx?.workout?.date || new Date().toISOString().slice(0, 10);
    const key = makeCacheKey(userId, actionType, salt);
    const cached = getCached(key);
    if (cached?.content) {
      setResults((prev) => ({ ...prev, [actionType]: cached.content }));
      return cached.content;
    }

    if (!hasKey) {
      const msg = 'OpenAI API key is not configured.';
      setError(msg);
      return msg;
    }

    setLoadingAction(actionType);
    setError('');

    try {
      const forecastData = await getWeather(ctx?.workout ?? null);
      const forecastText = forecastData ? formatWeatherForSystem(forecastData) : null;
      const prompt = buildActionPrompt(actionType, { ...ctx, forecastText });
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          max_completion_tokens: ACTION_MAX_TOKENS[actionType] ?? BASE_MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? 'No response.';
      setResults((prev) => ({ ...prev, [actionType]: content }));
      setCached(key, content, ACTION_TTL_MS[actionType] ?? (24 * 3600 * 1000));
      return content;
    } catch (e) {
      const msg = `Error: ${e.message ?? e}`;
      setError(msg);
      return msg;
    } finally {
      setLoadingAction('');
    }
  }, [contextBuilder, hasKey, userId]);

  return { runAction, loadingAction, error, results, hasKey };
}
