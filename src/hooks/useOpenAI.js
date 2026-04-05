/** useOpenAI.js — Chat hook: OpenAI GPT-4o mini. Key from VITE_OPENAI_API_KEY env var. */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const OPENAI_URL = import.meta.env.VITE_LLM_URL        ?? 'https://api.openai.com/v1/chat/completions';
const MODEL      = import.meta.env.VITE_LLM_MODEL      ?? 'gpt-4o-mini';
const MAX_TOKENS = parseInt(import.meta.env.VITE_LLM_MAX_TOKENS ?? '900', 10);
const API_KEY    = import.meta.env.VITE_OPENAI_API_KEY  ?? '';
const OW_KEY     = import.meta.env.VITE_OPENWEATHER_API_KEY ?? '';

// ── Weather helpers ───────────────────────────────────────────────────────────

function windDirection(deg) {
  if (deg == null || Number.isNaN(deg)) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function pickDailyForecastFrom3h(list = [], dayIndex = 0) {
  if (!list.length) return null;
  const target = new Date();
  target.setHours(12, 0, 0, 0);
  target.setDate(target.getDate() + dayIndex);
  const targetMs = target.getTime();

  const sameDay = list.filter(item => {
    const dt = new Date((item.dt ?? 0) * 1000);
    return dt.getFullYear() === target.getFullYear() &&
           dt.getMonth()    === target.getMonth()    &&
           dt.getDate()     === target.getDate();
  });
  if (!sameDay.length) return null;

  let best = sameDay[0];
  let bestDiff = Math.abs((best.dt ?? 0) * 1000 - targetMs);
  for (let i = 1; i < sameDay.length; i++) {
    const diff = Math.abs((sameDay[i].dt ?? 0) * 1000 - targetMs);
    if (diff < bestDiff) { best = sameDay[i]; bestDiff = diff; }
  }

  const windMs = Number(best?.wind?.speed ?? 0);
  return {
    tempC:        Math.round(best?.main?.temp ?? 0),
    feelsLikeC:   Math.round(best?.main?.feels_like ?? best?.main?.temp ?? 0),
    humidity:     best?.main?.humidity ?? null,
    windKmh:      Math.round(windMs * 3.6),
    windDir:      windDirection(best?.wind?.deg),
    weatherLabel: best?.weather?.[0]?.main ?? '',
    weatherDesc:  best?.weather?.[0]?.description ?? '',
  };
}

// Module-level cache: avoids re-fetching on every send()
let _weatherCache = { data: null, ts: 0, key: '' };

/** Fetch 5-day/3h forecast. Cached for 30 min per location key. */
async function getWeather(workout) {
  if (!OW_KEY) return null;

  const points = workout?.timeSeries ?? [];
  const gps = points.find(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  let locKey;
  const params = {};
  if (gps) {
    locKey = `${gps.lat.toFixed(2)},${gps.lon.toFixed(2)}`;
    params.lat = String(gps.lat);
    params.lon = String(gps.lon);
  } else {
    const city = (() => { try { return localStorage.getItem('plan_weather_city') || 'Prague'; } catch { return 'Prague'; } })();
    locKey = `city:${city}`;
    params.q = city;
  }

  const age = Date.now() - _weatherCache.ts;
  if (_weatherCache.data && _weatherCache.key === locKey && age < 30 * 60 * 1000) {
    return _weatherCache.data;
  }

  try {
    const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', OW_KEY);

    const res  = await fetch(url.toString());
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return null;
    }

    const list     = Array.isArray(json?.list) ? json.list : [];
    const location = json?.city?.name || '';
    const days     = Array.from({ length: 5 }, (_, i) => pickDailyForecastFrom3h(list, i)).filter(Boolean);
    const result   = days.length ? { location, days } : null;

    _weatherCache = { data: result, ts: Date.now(), key: locKey };
    return result;
  } catch (e) {
    return null;
  }
}

// ── Weather text formatters ───────────────────────────────────────────────────

function formatWeatherForSystem(weatherData) {
  if (!weatherData?.days?.length) return '';
  const now = new Date();
  const lines = weatherData.days.map((d, i) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + i);
    const dayLabel = i === 0
      ? `Today (${dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })})`
      : i === 1
        ? `Tomorrow (${dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })})`
        : dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    return `  ${dayLabel}: ${d.tempC}°C (feels like ${d.feelsLikeC}°C), ${d.weatherDesc || d.weatherLabel}, wind ${d.windKmh} km/h ${d.windDir}${d.humidity != null ? `, humidity ${d.humidity}%` : ''}`;
  }).join('\n');
  return `WEATHER FORECAST for ${weatherData.location} (live OpenWeather data):
${lines}

IMPORTANT: You have real weather data above. When the user asks about weather, clothing, or conditions — use THESE numbers directly. Never say you don't have forecast data. Never ask the user to provide weather.`;
}

/** Short weather reminder injected as a late system message to override stale chat history. */
function formatWeatherReminder(weatherData) {
  if (!weatherData?.days?.length) return null;
  const now = new Date();
  const lines = weatherData.days.slice(0, 3).map((d, i) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + i);
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-US', { weekday:'short' });
    return `${dayLabel}: ${d.tempC}°C (feels ${d.feelsLikeC}°C), ${d.weatherDesc || d.weatherLabel}, wind ${d.windKmh} km/h ${d.windDir}, humidity ${d.humidity ?? '—'}%`;
  }).join('; ');
  return `[SYSTEM UPDATE] Fresh weather for ${weatherData.location}: ${lines}. Use this data in your next answer. Do not say you lack weather info — you have it right here.`;
}

// ── System prompt builder ─────────────────────────────────────────────────────

function formatMedicalBlock(profile) {
  const m = profile?.medical;
  if (!m) return '';
  const lines = [];

  if (m.restingHr) lines.push(`Resting HR: ${m.restingHr} bpm`);
  if (m.maxHrTested) lines.push(`Max HR (tested): ${m.maxHrTested} bpm`);
  if (m.bloodPressure) lines.push(`Blood pressure: ${m.bloodPressure}`);
  if (m.knownCardiacConditions) lines.push(`Cardiac: ${m.knownCardiacConditions}`);
  if (m.asthma) lines.push('Asthma: YES');
  if (m.exerciseInducedBronchoconstriction) lines.push('Exercise-induced bronchoconstriction: YES');
  if (m.respiratoryNotes) lines.push(`Respiratory: ${m.respiratoryNotes}`);
  if (m.currentInjuries) lines.push(`Current injuries: ${m.currentInjuries}`);
  if (m.pastSurgeries) lines.push(`Past surgeries: ${m.pastSurgeries}`);
  if (m.chronicConditions) lines.push(`Chronic conditions: ${m.chronicConditions}`);
  if (m.mobilityLimitations) lines.push(`Mobility limits: ${m.mobilityLimitations}`);
  if (m.diabetes && m.diabetes !== 'none') lines.push(`Diabetes: ${m.diabetes}`);
  if (m.thyroidCondition) lines.push(`Thyroid: ${m.thyroidCondition}`);
  if (m.ironDeficiency) lines.push('Iron deficiency: YES');
  if (m.currentMedications) lines.push(`Medications: ${m.currentMedications}`);
  if (m.supplements) lines.push(`Supplements: ${m.supplements}`);
  if (m.allergies) lines.push(`Allergies: ${m.allergies}`);
  if (m.smokingStatus && m.smokingStatus !== 'never') lines.push(`Smoking: ${m.smokingStatus}`);
  if (m.sleepDisorders) lines.push(`Sleep disorders: ${m.sleepDisorders}`);
  if (m.vo2maxTested) lines.push(`VO2max (tested): ${m.vo2maxTested} ml/kg/min`);
  if (m.lactateThreshold) lines.push(`Lactate threshold: ${m.lactateThreshold}`);
  if (m.lastStressTest) lines.push(`Last stress test: ${m.lastStressTest}`);
  if (m.lastBloodwork) lines.push(`Last bloodwork: ${m.lastBloodwork}`);
  if (m.lastEcg) lines.push(`Last ECG: ${m.lastEcg}`);
  if (m.doctorNotes) lines.push(`Doctor/athlete notes: ${m.doctorNotes}`);

  if (profile?.injuryNotes) lines.push(`Injury notes: ${profile.injuryNotes}`);
  if (profile?.constraints) lines.push(`Training constraints: ${profile.constraints}`);

  if (!lines.length) return '';

  return `\n\nATHLETE MEDICAL PROFILE:
${lines.map(l => '  ' + l).join('\n')}
IMPORTANT: Factor this medical information into ALL training advice. Adjust intensity limits, recovery times, medication interactions (e.g. beta-blockers affect HR zones), injury accommodations, and flag any safety concerns proactively. If the athlete has conditions that contraindicate certain exercises, say so clearly.`;
}

async function fetchMedicalDocSummaries(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('medical_documents')
      .select('file_name, category, document_date, description, key_findings')
      .eq('user_id', userId)
      .neq('key_findings', '')
      .order('document_date', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.warn('[useOpenAI] Failed to fetch medical docs:', e);
    return [];
  }
}

function formatMedicalDocsBlock(docs) {
  if (!docs?.length) return '';
  const lines = docs.map(d => {
    const parts = [];
    if (d.category && d.category !== 'other') parts.push(`[${d.category.replace(/_/g, ' ')}]`);
    if (d.document_date) parts.push(d.document_date);
    if (d.file_name) parts.push(d.file_name);
    if (d.description) parts.push(`— ${d.description}`);
    return `  ${parts.join(' ')}: ${d.key_findings}`;
  }).join('\n');
  return `\n\nMEDICAL RECORDS (key findings from uploaded documents):\n${lines}\nFactor these lab results, diagnoses, and clinical findings into your training and nutrition advice.`;
}

function buildSystemPrompt(workout, recentWorkoutsFn, weatherData, athleteProfile, medDocs) {
  const weatherBlock = formatWeatherForSystem(weatherData);
  const medicalBlock = formatMedicalBlock(athleteProfile);
  const medDocsBlock = formatMedicalDocsBlock(medDocs);

  const preamble = `You are an expert endurance sports coach, sports data analyst, and gear advisor.

${weatherBlock}${medicalBlock}${medDocsBlock}`;

  if (!workout) {
    return `${preamble}

Answer in English or Russian, depending on the user's initial message, concise and practical, with concrete numbers and clear action steps.`;
  }

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

  return `${preamble}

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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOpenAI(workout, recentWorkoutsFn, getChatHistory, saveChatMessage, athleteProfile, userId) {
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

    try {
      // Fetch weather synchronously — guaranteed before prompt is built
      const weatherData = await getWeather(workout);

      const medDocs = await fetchMedicalDocSummaries(userId);
      const systemPrompt = buildSystemPrompt(workout, recentWorkoutsFn, weatherData, athleteProfile, medDocs);

      // Build message array from persisted chat history
      const historyForApi = messages
        .filter(m => !m.streaming)
        .map(({ role, content }) => ({ role, content }));

      // Inject a fresh weather reminder right before the new user message.
      // This overrides any stale conversation context where the model previously
      // claimed it didn't have weather data.
      const weatherReminder = formatWeatherReminder(weatherData);
      if (weatherReminder) {
        historyForApi.push({ role: 'system', content: weatherReminder });
      }

      historyForApi.push({ role: 'user', content: trimmed });

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
  }, [hasKey, isStreaming, messages, workout, recentWorkoutsFn, saveChatMessage, workoutId, athleteProfile, userId]);

  const clearHistory = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, hasKey, send, clearHistory };
}