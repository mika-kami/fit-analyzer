/** useOpenAI.js — Chat hook: OpenAI GPT-4o mini. Key from VITE_OPENAI_API_KEY env var. */

import { useState, useCallback, useEffect } from 'react';
import { buildHistoryDigest, buildWorkoutSnapshot } from '../core/coachDigest.js';

const OPENAI_URL = import.meta.env.VITE_LLM_URL ?? 'https://api.openai.com/v1/chat/completions';
const MODEL = import.meta.env.VITE_LLM_MODEL ?? 'gpt-4o-mini';
const MAX_TOKENS = parseInt(import.meta.env.VITE_LLM_MAX_TOKENS ?? '900', 10);
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? '';
const OW_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY ?? '';

const HISTORY_WINDOW = 6;
const HISTORY_RECAP_THRESHOLD = 8;

// ── Weather helpers ───────────────────────────────────────────────────────────

function windDirection(deg) {
  if (deg == null || Number.isNaN(deg)) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function pickDailyForecastFrom3h(list = [], dayIndex = 0) {
  if (!list.length) return null;
  const target = new Date();
  target.setHours(12, 0, 0, 0);
  target.setDate(target.getDate() + dayIndex);
  const targetMs = target.getTime();
  const sameDay = list.filter((item) => {
    const dt = new Date((item.dt ?? 0) * 1000);
    return dt.getFullYear() === target.getFullYear()
      && dt.getMonth() === target.getMonth()
      && dt.getDate() === target.getDate();
  });
  if (!sameDay.length) return null;
  let best = sameDay[0];
  let bestDiff = Math.abs((best.dt ?? 0) * 1000 - targetMs);
  for (let i = 1; i < sameDay.length; i += 1) {
    const diff = Math.abs((sameDay[i].dt ?? 0) * 1000 - targetMs);
    if (diff < bestDiff) {
      best = sameDay[i];
      bestDiff = diff;
    }
  }
  const windMs = Number(best?.wind?.speed ?? 0);
  return {
    tempC: Math.round(best?.main?.temp ?? 0),
    feelsLikeC: Math.round(best?.main?.feels_like ?? best?.main?.temp ?? 0),
    humidity: best?.main?.humidity ?? null,
    windKmh: Math.round(windMs * 3.6),
    windDir: windDirection(best?.wind?.deg),
    weatherLabel: best?.weather?.[0]?.main ?? '',
    weatherDesc: best?.weather?.[0]?.description ?? '',
  };
}

let _weatherCache = { data: null, ts: 0, key: '' };

export async function getWeather(workout) {
  if (!OW_KEY) return null;
  const points = workout?.timeSeries ?? [];
  const gps = points.find((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  let locKey;
  const params = {};
  if (gps) {
    locKey = `${gps.lat.toFixed(2)},${gps.lon.toFixed(2)}`;
    params.lat = String(gps.lat);
    params.lon = String(gps.lon);
  } else {
    const city = (() => {
      try {
        return localStorage.getItem('plan_weather_city') || 'Prague';
      } catch {
        return 'Prague';
      }
    })();
    locKey = `city:${city}`;
    params.q = city;
  }
  const age = Date.now() - _weatherCache.ts;
  if (_weatherCache.data && _weatherCache.key === locKey && age < 30 * 60 * 1000) return _weatherCache.data;
  try {
    const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', OW_KEY);
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[useOpenAI] OpenWeather error:', json?.message || res.status);
      return null;
    }
    const list = Array.isArray(json?.list) ? json.list : [];
    const location = json?.city?.name || '';
    const days = Array.from({ length: 5 }, (_, i) => pickDailyForecastFrom3h(list, i)).filter(Boolean);
    const result = days.length ? { location, days } : null;
    _weatherCache = { data: result, ts: Date.now(), key: locKey };
    return result;
  } catch (e) {
    console.warn('[useOpenAI] Weather fetch failed:', e);
    return null;
  }
}

// ── Prompt formatters ─────────────────────────────────────────────────────────

export function formatWeatherForSystem(weatherData) {
  if (!weatherData?.days?.length) return '';
  const now = new Date();
  const lines = weatherData.days.map((d, i) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + i);
    const dayLabel = i === 0
      ? `Today (${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`
      : i === 1
        ? `Tomorrow (${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`
        : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `  ${dayLabel}: ${d.tempC}°C (feels ${d.feelsLikeC}°C), ${d.weatherDesc || d.weatherLabel}, wind ${d.windKmh} km/h ${d.windDir}${d.humidity != null ? `, humidity ${d.humidity}%` : ''}`;
  }).join('\n');
  return `LIVE WEATHER FORECAST (${weatherData.location}, OpenWeather):\n${lines}`;
}

function formatWeatherReminder(weatherData) {
  if (!weatherData?.days?.length) return null;
  const now = new Date();
  const lines = weatherData.days.slice(0, 3).map((d, i) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + i);
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayLabel}: ${d.tempC}°C (feels ${d.feelsLikeC}°C), ${d.weatherDesc || d.weatherLabel}, wind ${d.windKmh} km/h ${d.windDir}`;
  }).join('; ');
  return `[SYSTEM UPDATE] Fresh weather for ${weatherData.location}: ${lines}.`;
}

function buildWorkoutDetails(workout, detailFlags) {
  if (!workout) return '';
  const lines = [];
  const zones = workout?.hrZones ?? [];
  const hasZones = zones.length > 0;
  const hasElevation = Number.isFinite(workout?.elevation?.ascent) || Number.isFinite(workout?.elevation?.descent);
  const hasPower = Number.isFinite(workout?.power?.avg) || Number.isFinite(workout?.power?.max);
  const hasCadence = Number.isFinite(workout?.cadence?.avg);
  const hasSpeed = Number.isFinite(workout?.speed?.avg);

  if (detailFlags.zones && hasZones) {
    const hrZones = zones.map((z) => `${String(z.id || '').toUpperCase()} ${z.pct ?? 0}% (${z.minutes ?? 0} min)`).join(', ');
    lines.push(`HR zones: ${hrZones}`);
  }
  if (detailFlags.elevation && hasElevation) {
    lines.push(`Elevation: +${workout?.elevation?.ascent ?? 0} m / -${workout?.elevation?.descent ?? 0} m`);
  }
  if (detailFlags.power && hasPower) {
    lines.push(`Power: avg ${workout?.power?.avg ?? '—'} W, max ${workout?.power?.max ?? '—'} W`);
  }
  if (detailFlags.cadence && hasCadence) {
    lines.push(`Cadence: avg ${workout.cadence.avg} rpm${Number.isFinite(workout?.cadence?.max) ? `, max ${workout.cadence.max}` : ''}`);
  }
  if (detailFlags.speed && hasSpeed) {
    const speedLine = `Speed: avg ${workout.speed.avg} km/h${Number.isFinite(workout?.speed?.max) ? `, max ${workout.speed.max} km/h` : ''}`;
    lines.push(speedLine);
    const isRun = String(workout?.sportLabel ?? workout?.sport ?? '').toLowerCase().includes('run');
    if (isRun && Number(workout?.speed?.avg) > 0) {
      lines.push(`Pace: ${(60 / Number(workout.speed.avg)).toFixed(2)} min/km avg`);
    }
  }
  if (!lines.length) return '';
  return `WORKOUT DETAILS:\n${lines.map((line) => `  - ${line}`).join('\n')}`;
}

function detectRelevantContext(userMessage) {
  const text = String(userMessage || '').toLowerCase();
  const weather = /(weather|forecast|temp|temperature|rain|wind|humidity|heat|cold|jacket|layer|clothing|gear)/i.test(text);
  const medical = /(medical|injury|pain|doctor|supplement|medication|asthma|iron|ferritin|bloodwork|ecg|illness)/i.test(text);
  const history = /(plan|next week|weekly|week|trend|progress|plateau|regress|volume|consisten|ctl|atl|tsb|periodiz)/i.test(text);
  const workout = /(workout|session|ride|run|cycling|training|heart rate|hr|zone|te|training effect|recovery day|analy[sz]e)/i.test(text);

  const workoutDetails = {
    zones: /(zones?|z1|z2|z3|z4|z5|polariz)/i.test(text),
    elevation: /(elevation|climb|ascent|vam|hill)/i.test(text),
    power: /(power|watts?|ftp)/i.test(text),
    cadence: /(cadence|rpm|turnover)/i.test(text),
    speed: /(speed|pace|km\/h|min\/km)/i.test(text),
  };

  return {
    weather,
    medical,
    history,
    workout,
    workoutDetails,
    any: weather || medical || history || workout,
    anyWorkoutDetail: Object.values(workoutDetails).some(Boolean),
  };
}

function buildConversationRecap(messages) {
  if (!messages?.length) return '';
  const chunks = messages
    .filter((m) => m?.role === 'user' || m?.role === 'assistant')
    .slice(-8)
    .map((m) => {
      const raw = String(m?.content ?? '').replace(/\s+/g, ' ').trim();
      const clip = raw.length > 60 ? `${raw.slice(0, 60)}...` : raw;
      return `${m.role}: ${clip}`;
    })
    .filter(Boolean);
  if (!chunks.length) return '';
  return `[CONVERSATION RECAP] Earlier in this chat: ${chunks.join('; ')}`;
}

function buildSystemPrompt({
  workout,
  athleteDigest,
  weatherData,
  includeWeather,
  includeWorkout,
  includeWorkoutDetails,
  includeHistory,
  historyDigest,
  detailFlags,
  includeMedicalFocus,
}) {
  const COACH_IDENTITY = `You are a harsh-but-fair endurance coach. Be direct, use numbers when available, and always prescribe clear next actions.
Answer in English or Russian, matching the user's language.`;

  const sections = [COACH_IDENTITY];
  sections.push(`ATHLETE DIGEST:\n${athleteDigest || 'Athlete digest unavailable.'}`);

  if (includeMedicalFocus) {
    sections.push('MEDICAL FOCUS: User asked a medical/injury topic. Prioritize safety and practical accommodations.');
  }
  if (includeWeather && weatherData) {
    sections.push(formatWeatherForSystem(weatherData));
  }
  if (includeWorkout) {
    sections.push(buildWorkoutSnapshot(workout));
  }
  if (includeWorkout && includeWorkoutDetails) {
    const detailBlock = buildWorkoutDetails(workout, detailFlags);
    if (detailBlock) sections.push(detailBlock);
  }
  if (includeHistory && historyDigest) {
    sections.push(`TRAINING TREND:\n${historyDigest}`);
  }

  if (!workout && !includeHistory) {
    sections.push('No workout is currently loaded. You can still advise on planning, fueling, recovery, and gear.');
  }

  return sections.filter(Boolean).join('\n\n');
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOpenAI(workout, recentWorkoutsFn, getChatHistory, saveChatMessage, athleteDigest, options = {}) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const hasKey = API_KEY.startsWith('sk-') && API_KEY.length > 20;
  const mode = options?.mode === 'workout' ? 'workout' : 'global';
  const attachedWorkout = options?.attachedWorkout ?? null;
  const contextWorkout = attachedWorkout || workout || null;
  const conversationWorkoutId = mode === 'global' ? null : (workout?.id ?? null);

  useEffect(() => {
    let alive = true;
    if (!getChatHistory) return;
    getChatHistory(conversationWorkoutId)
      .then((rows) => {
        if (!alive) return;
        const mapped = (rows ?? []).filter((m) => m?.role && m?.content).map((m) => ({ role: m.role, content: m.content }));
        setMessages(mapped);
      })
      .catch(() => {
        if (alive) setMessages([]);
      });
    return () => { alive = false; };
  }, [getChatHistory, conversationWorkoutId]);

  const send = useCallback(async (userText) => {
    if (!userText.trim() || isStreaming) return;

    if (!hasKey) {
      const userMsg = { role: 'user', content: userText.trim() };
      const assistantMsg = { role: 'assistant', content: 'OpenAI API key is not configured. Add VITE_OPENAI_API_KEY to .env.' };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      if (saveChatMessage) {
        await saveChatMessage('user', userMsg.content, conversationWorkoutId);
        await saveChatMessage('assistant', assistantMsg.content, conversationWorkoutId);
      }
      return;
    }

    const trimmed = userText.trim();
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    if (saveChatMessage) await saveChatMessage('user', trimmed, conversationWorkoutId);
    setIsStreaming(true);

    try {
      const contextFlags = detectRelevantContext(trimmed);
      const includeWorkout = contextFlags.workout || (!contextFlags.any && !!contextWorkout);
      const includeHistory = contextFlags.history;
      const includeWeather = contextFlags.weather;
      const includeWorkoutDetails = includeWorkout && contextFlags.anyWorkoutDetail;
      const includeMedicalFocus = contextFlags.medical;

      const weatherData = includeWeather ? await getWeather(contextWorkout) : null;
      const recent = recentWorkoutsFn ? recentWorkoutsFn(10) : [];
      const historyDigest = includeHistory ? buildHistoryDigest(recent) : '';

      const systemPrompt = buildSystemPrompt({
        workout: contextWorkout,
        athleteDigest: athleteDigest || '',
        weatherData,
        includeWeather,
        includeWorkout,
        includeWorkoutDetails,
        includeHistory,
        historyDigest,
        detailFlags: contextFlags.workoutDetails,
        includeMedicalFocus,
      });

      const priorHistory = messages.filter((m) => !m.streaming).map(({ role, content }) => ({ role, content }));
      let recap = '';
      let historyForApi = priorHistory;

      if (priorHistory.length > HISTORY_RECAP_THRESHOLD) {
        const older = priorHistory.slice(0, -HISTORY_WINDOW);
        historyForApi = priorHistory.slice(-HISTORY_WINDOW);
        recap = buildConversationRecap(older);
      }

      if (includeWeather) {
        const weatherReminder = formatWeatherReminder(weatherData);
        if (weatherReminder) historyForApi.push({ role: 'system', content: weatherReminder });
      }

      historyForApi.push({ role: 'user', content: trimmed });

      const payloadMessages = [{ role: 'system', content: systemPrompt }];
      if (recap) payloadMessages.push({ role: 'system', content: recap });
      if (mode === 'global' && attachedWorkout) {
        payloadMessages.push({
          role: 'system',
          content: `[CONTEXT] Attached workout for reference: ${buildWorkoutSnapshot(attachedWorkout)}`,
        });
      }
      payloadMessages.push(...historyForApi);

      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          max_completion_tokens: MAX_TOKENS,
          stream: false,
          messages: payloadMessages,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content ?? 'No response.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      if (saveChatMessage) await saveChatMessage('assistant', reply, conversationWorkoutId);
    } catch (e) {
      const errText = `Error: ${e.message ?? e}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: errText }]);
      if (saveChatMessage) await saveChatMessage('assistant', errText, conversationWorkoutId);
    } finally {
      setIsStreaming(false);
    }
  }, [hasKey, isStreaming, saveChatMessage, conversationWorkoutId, messages, contextWorkout, recentWorkoutsFn, athleteDigest, mode, attachedWorkout]);

  const clearHistory = useCallback(() => setMessages([]), []);
  const inject = useCallback((role, content) => {
    setMessages((prev) => [...prev, { role, content }]);
  }, []);
  return { messages, isStreaming, hasKey, send, clearHistory, inject };
}
