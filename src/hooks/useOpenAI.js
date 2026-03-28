/** useOpenAI.js — Chat hook: OpenAI GPT-4o mini. Key from VITE_OPENAI_API_KEY env var. */

import { useState, useCallback } from 'react';

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
      `  - ${r.date}: ${r.sport}, ${(r.distance / 1000).toFixed(1)} км, ТЭ ${r.trainingEffect?.aerobic?.toFixed(1) ?? '—'}, ${r.load?.label ?? '—'}`
    ).join('\n');
    return `\nПоследние ${recent.length} тренировок из истории:\n${lines}`;
  })();

  const powerLine = w.power ? `Мощность: ср. ${w.power.avg} Вт\n` : '';
  const hrZones = w.hrZones.map(z => `${z.id.toUpperCase()} ${z.pct}% (${z.minutes} мин)`).join(', ');

  return `Ты — профессиональный тренер по видам спорта на выносливость, аналитик спортивных данных и консультант по спортивному снаряжению с глубокой экспертизой в:
- Спортивной медицине и физиологии (ЧСС, мощность, зоны нагрузки, восстановление, травмы)
- Стратегиях тренировок (периодизация, прогрессия нагрузки, соотношение работы и отдыха)
- Беге, велоспорте, триатлоне, плавании и других видах на выносливость
- Настройке и подборе снаряжения (обувь, одежда, велосипед, экипировка)
- Регулярно изучаешь актуальные научные исследования в области спортивной медицины и физиологии.

ДАННЫЕ ПОСЛЕДНЕЙ ТРЕНИРОВКИ
Дата: ${w.date} в ${w.startTime}
Вид: ${w.sportLabel}${w.bike ? ` (${w.bike})` : ''}
Дистанция: ${(w.distance / 1000).toFixed(2)} км
Активное время: ${fmtD(w.duration.active)}, полное: ${fmtD(w.duration.total)}, паузы: ${Math.round(w.duration.pause / 60)} мин
Калории: ${w.calories} ккал
ЧСС: ср. ${w.heartRate.avg} уд/мин, макс. ${w.heartRate.max} уд/мин
Скорость: ср. ${w.speed.avg} км/ч, макс. ${w.speed.max} км/ч
Набор высоты: +${w.elevation.ascent} м / −${w.elevation.descent} м
${powerLine}Тренировочный эффект: аэробный ${w.trainingEffect.aerobic}/5, анаэробный ${w.trainingEffect.anaerobic}/5
Зоны ЧСС: ${hrZones}
Нагрузка: ${w.load?.label ?? '—'}
${recentBlock}

ЗОНЫ КОМПЕТЕНТНОСТИ
По этим темам давай конкретные практические советы, ссылаясь на цифры из тренировки выше:

🏃 Анализ тренировки — зоны ЧСС, тренировочный эффект, нагрузка, соотношение аэроб/анаэроб, рекомендации по следующей сессии и восстановлению.
🩺 Травмы и здоровье — причины болей, протоколы восстановления, когда направить к врачу. Не ставь диагнозов — объясняй симптомы и вероятные сценарии.
🚲 Велосипед и давление в шинах — давление по типу покрышки, весу, покрытию, погоде; посадка, трансмиссия, тормоза.
👟 Обувь — подбор, шнуровка, стельки, износ, переход между типами.
👕 Одежда и экипировка — слои, материалы, настройка датчиков, профилактика натёртостей.

Отвечай строго по-русски, кратко и конкретно — цифры, диапазоны, протоколы. Без воды.`;
}

export function useOpenAI(workout, recentWorkoutsFn) {
  const [messages,    setMessages]    = useState([]);
  const [isStreaming, setIsStreaming]  = useState(false);

  const hasKey = API_KEY.startsWith('sk-') && API_KEY.length > 20;

  const send = useCallback(async (userText) => {
    if (!userText.trim() || isStreaming) return;
    if (!hasKey) {
      setMessages(prev => [...prev,
        { role: 'user', content: userText.trim() },
        { role: 'assistant', content: 'OpenAI API ключ не настроен. Добавь VITE_OPENAI_API_KEY в .env файл.' },
      ]);
      return;
    }

    const trimmed = userText.trim();
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
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
          model: MODEL, max_completion_tokens: MAX_TOKENS, stream: false,
          messages: [{ role: 'system', content: systemPrompt }, ...historyForApi],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content ?? 'Нет ответа.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка: ${e.message ?? e}` }]);
    } finally {
      setIsStreaming(false);
    }
  }, [hasKey, isStreaming, messages, workout, recentWorkoutsFn]);

  const clearHistory = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, hasKey, send, clearHistory };
}
