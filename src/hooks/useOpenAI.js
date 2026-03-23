/** useOpenAI.js — Chat hook: OpenAI primary → Anthropic fallback. Includes history context. */

import { useState, useCallback } from 'react';

/**
 * useOpenAI — chat hook with OpenAI primary + Anthropic fallback.
 * OpenAI fetch is attempted first; if it fails (network block, bad key),
 * falls back silently to Anthropic API which always works in artifact sandbox.
 */

const OPENAI_URL    = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_OAI     = 'gpt-4o-mini';
const MODEL_ANT     = 'claude-haiku-4-5-20251001';
const CHAT_MAX_TOKENS = 900;

function buildSystemPrompt(workout, recentWorkoutsFn) {
  if (!workout) return 'You are a sports coach. Answer in Russian.';
  const w = workout;
  const fmtD = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return `${h}:${String(m).padStart(2,'0')}`; };
  return `Ты — профессиональный тренер по видам спорта на выносливость и аналитик спортивных данных.
Данные последней тренировки:
Дата: ${w.date} в ${w.startTime}
Вид: ${w.sportLabel}${w.bike ? ` (${w.bike})` : ''}
Дистанция: ${(w.distance/1000).toFixed(2)} км
Активное время: ${fmtD(w.duration.active)}, полное: ${fmtD(w.duration.total)}, паузы: ${Math.round(w.duration.pause/60)} мин
Калории: ${w.calories} ккал
ЧСС: ср. ${w.heartRate.avg} уд/мин, макс. ${w.heartRate.max} уд/мин
Скорость: ср. ${w.speed.avg} км/ч, макс. ${w.speed.max} км/ч
Набор: +${w.elevation.ascent} м / −${w.elevation.descent} м
${w.power ? `Мощность: ср. ${w.power.avg} Вт` : ''}
Тренировочный эффект: аэробный ${w.trainingEffect.aerobic}/5, анаэробный ${w.trainingEffect.anaerobic}/5
Зоны ЧСС: ${w.hrZones.map(z=>`${z.id.toUpperCase()} ${z.pct}% (${z.minutes} мин)`).join(', ')}
Нагрузка: ${w.load?.label ?? '—'}

${(() => {
    const recent = recentWorkoutsFn ? recentWorkoutsFn(10) : [];
    if (recent.length <= 1) return '';
    const lines = recent.slice(0, 10).map(r =>
      `  - ${r.date}: ${r.sport}, ${(r.distance/1000).toFixed(1)}км, ТЭ ${r.trainingEffect?.aerobic?.toFixed(1)}, ${r.load?.label}`
    ).join('\n');
    return `\nПоследние ${recent.length} тренировок из истории:\n${lines}`;
  })()}

Отвечай строго по-русски, кратко, как опытный тренер. Без воды.`;
}

async function callOpenAI(apiKey, systemPrompt, history) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL_OAI, max_tokens: CHAT_MAX_TOKENS, stream: false,
      messages: [{ role: 'system', content: systemPrompt }, ...history] }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error?.message ?? `HTTP ${res.status}`); }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? 'Нет ответа.';
}

async function callAnthropic(systemPrompt, history) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL_ANT, max_tokens: CHAT_MAX_TOKENS,
      system: systemPrompt, messages: history }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error?.message ?? `HTTP ${res.status}`); }
  const data = await res.json();
  return data?.content?.find(b => b.type === 'text')?.text ?? 'Нет ответа.';
}

export function useOpenAI(workout, recentWorkoutsFn) {
  const [messages,    setMessages]    = useState([]);
  const [isStreaming, setIsStreaming]  = useState(false);
  const [apiKey,      _setApiKey]     = useState('');
  const [isKeySet,    setIsKeySet]    = useState(false);
  const [provider,    setProvider]    = useState('anthropic');

  const greet = useCallback((prov) => {
    const dist = workout ? (workout.distance/1000).toFixed(1)+' км' : '—';
    const via  = prov === 'openai' ? 'OpenAI GPT-4o mini' : 'встроенный ИИ (Claude)';
    setMessages([{ role: 'assistant', content: `Привет! Работаю через ${via}. Вижу тренировку: ${workout?.sportLabel ?? 'активность'}, ${dist}. Задавайте вопросы!` }]);
  }, [workout]);

  const setApiKey = useCallback((key) => {
    _setApiKey(key);
    if (key.startsWith('sk-') && key.length > 20) {
      setIsKeySet(true); setProvider('openai'); greet('openai');
    }
  }, [greet]);

  const useAnthropicFallback = useCallback(() => {
    setIsKeySet(true); setProvider('anthropic'); greet('anthropic');
  }, [greet]);

  const clearKey    = useCallback(() => { _setApiKey(''); setIsKeySet(false); setProvider('anthropic'); setMessages([]); }, []);
  const clearHistory = useCallback(() => setMessages([]), []);

  const send = useCallback(async (userText) => {
    if (!userText.trim() || isStreaming) return;
    const trimmed = userText.trim();
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setIsStreaming(true);

    const systemPrompt  = buildSystemPrompt(workout, recentWorkoutsFn);
    const historyForApi = messages
      .filter(m => !m.streaming)
      .map(({ role, content }) => ({ role, content }));
    historyForApi.push({ role: 'user', content: trimmed });

    try {
      let reply;
      if (provider === 'openai' && apiKey) {
        try {
          reply = await callOpenAI(apiKey, systemPrompt, historyForApi);
        } catch (_oaiErr) {
          // OpenAI unreachable — fall back to Anthropic silently
          setProvider('anthropic');
          reply = await callAnthropic(systemPrompt, historyForApi);
        }
      } else {
        reply = await callAnthropic(systemPrompt, historyForApi);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка: ${e.message ?? e}` }]);
    } finally {
      setIsStreaming(false);
    }
  }, [apiKey, isStreaming, messages, workout, provider]);

  return { messages, isStreaming, apiKey, isKeySet, provider, setApiKey, useAnthropicFallback, clearKey, send, clearHistory };
}