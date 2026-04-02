/** useOpenAI.js — Chat hook: OpenAI GPT-4o mini. Key from VITE_OPENAI_API_KEY env var. */

import { useState, useCallback, useEffect } from 'react';

const OPENAI_URL = import.meta.env.VITE_LLM_URL        ?? 'https://api.openai.com/v1/chat/completions';
const MODEL      = import.meta.env.VITE_LLM_MODEL      ?? 'gpt-4o-mini';
const MAX_TOKENS = parseInt(import.meta.env.VITE_LLM_MAX_TOKENS ?? '900', 10);
const API_KEY    = import.meta.env.VITE_OPENAI_API_KEY  ?? '';

function buildSystemPrompt(workout, recentWorkoutsFn) {
  if (!workout) return 'You are a sports coach. Answer in Russian.';

  const w = workout;
  const fmtD = s => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  const recentBlock = (() => {
    const recent = recentWorkoutsFn ? recentWorkoutsFn(10) : [];
    if (recent.length <= 1) return '';
    const lines = recent.slice(0, 10).map(r =>
      `  - ${r.date}: ${r.sport}, ${(r.distance / 1000).toFixed(1)} km, TE ${r.trainingEffect?.aerobic?.toFixed(1) ?? '—'}, ${r.load?.label ?? '—'}`
    ).join('\n');
    return `\nRecent ${recent.length} workouts from history:\n${lines}`;
  })();

  const powerLine = w.power ? `Power: avg ${w.power.avg} W\n` : '';
  const hrZones = w.hrZones.map(z => `${z.id.toUpperCase()} ${z.pct}% (${z.minutes} min)`).join(', ');

  return `You are an expert endurance sports coach, sports data analyst, and gear advisor.

LATEST WORKOUT DATA
Date: ${w.date} at ${w.startTime}
Sport: ${w.sportLabel}${w.bike ? ` (${w.bike})` : ''}
Distance: ${(w.distance / 1000).toFixed(2)} km
Active time: ${fmtD(w.duration.active)}, total: ${fmtD(w.duration.total)}, pauses: ${Math.round(w.duration.pause / 60)} min
Calories: ${w.calories} kcal
Heart rate: avg ${w.heartRate.avg} bpm, max ${w.heartRate.max} bpm
Speed: avg ${w.speed.avg} km/h, max ${w.speed.max} km/h
Elevation: +${w.elevation.ascent} m / −${w.elevation.descent} m
${powerLine}Training Effect: aerobic ${w.trainingEffect.aerobic}/5, anaerobic ${w.trainingEffect.anaerobic}/5
HR Zones: ${hrZones}
Load: ${w.load?.label ?? '—'}
${recentBlock}

Answer in English or Russian, depending on the user's initial message, concise and practical, with concrete numbers and clear action steps.`;
}

export function useOpenAI(workout, recentWorkoutsFn, getChatHistory, saveChatMessage) {
  const [messages,    setMessages]    = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const hasKey = API_KEY.startsWith('sk-') && API_KEY.length > 20;
  const workoutId = workout?.id ?? null;

  useEffect(() => {
    let alive = true;
    if (!getChatHistory) return;

    getChatHistory(workoutId)
      .then((rows) => {
        if (!alive) return;
        const mapped = (rows ?? [])
          .filter(m => m?.role && m?.content)
          .map(m => ({ role: m.role, content: m.content }));
        setMessages(mapped);
      })
      .catch(() => {
        if (alive) setMessages([]);
      });

    return () => { alive = false; };
  }, [getChatHistory, workoutId]);

  const send = useCallback(async (userText) => {
    if (!userText.trim() || isStreaming) return;

    if (!hasKey) {
      const userMsg = { role: 'user', content: userText.trim() };
      const assistantMsg = { role: 'assistant', content: 'OpenAI API key is not configured. Add VITE_OPENAI_API_KEY to .env.' };
      setMessages(prev => [...prev, userMsg, assistantMsg]);
      if (saveChatMessage) {
        await saveChatMessage('user', userMsg.content, workoutId);
        await saveChatMessage('assistant', assistantMsg.content, workoutId);
      }
      return;
    }

    const trimmed = userText.trim();
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    if (saveChatMessage) await saveChatMessage('user', trimmed, workoutId);
    setIsStreaming(true);

    const systemPrompt  = buildSystemPrompt(workout, recentWorkoutsFn);
    const historyForApi = messages
      .filter(m => !m.streaming)
      .map(({ role, content }) => ({ role, content }));
    historyForApi.push({ role: 'user', content: trimmed });

    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          max_completion_tokens: MAX_TOKENS,
          stream: false,
          messages: [{ role: 'system', content: systemPrompt }, ...historyForApi],
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content ?? 'No response.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      if (saveChatMessage) await saveChatMessage('assistant', reply, workoutId);
    } catch (e) {
      const errText = `Error: ${e.message ?? e}`;
      setMessages(prev => [...prev, { role: 'assistant', content: errText }]);
      if (saveChatMessage) await saveChatMessage('assistant', errText, workoutId);
    } finally {
      setIsStreaming(false);
    }
  }, [hasKey, isStreaming, messages, workout, recentWorkoutsFn, saveChatMessage, workoutId]);

  const clearHistory = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, hasKey, send, clearHistory };
}

