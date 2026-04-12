export function buildCoachSystemPrompt({
  athleteDigest,
  weatherBlock,
  workoutSnapshot,
  workoutDetails,
  historyDigest,
  includeMedicalFocus,
  planDigest,
}) {
  const coachIdentity = `You are a harsh-but-fair endurance coach. Be direct, use numbers when available, and always prescribe clear next actions.
Answer in English or Russian, matching the user's language.`;

  const sections = [coachIdentity];
  sections.push(`ATHLETE DIGEST:\n${athleteDigest || 'Athlete digest unavailable.'}`);

  if (planDigest) {
    sections.push(
      `CURRENT WEEK PLAN (authoritative — computed by training engine):\n${planDigest}\n\nIMPORTANT: When the athlete asks about this week's training or what to do on any day, you MUST refer to this plan. Do NOT generate a new weekly schedule. You may explain, adjust intensity advice, or suggest swaps — but the session types and structure are fixed unless the athlete explicitly asks for a full plan replacement.`
    );
  }

  if (includeMedicalFocus) {
    sections.push('MEDICAL FOCUS: User asked a medical/injury topic. Prioritize safety and practical accommodations.');
  }
  if (weatherBlock) {
    sections.push(weatherBlock);
  }
  if (workoutSnapshot) {
    sections.push(workoutSnapshot);
  }
  if (workoutDetails) {
    sections.push(workoutDetails);
  }
  if (historyDigest) {
    sections.push(`TRAINING TREND:\n${historyDigest}`);
  }
  if (!workoutSnapshot && !historyDigest) {
    sections.push('No workout is currently loaded. You can still advise on planning, fueling, recovery, and gear.');
  }

  return sections.filter(Boolean).join('\n\n');
}

export function buildAutoVerdictPrompt({ snap, complianceSummary }) {
  return `Coach. Session: ${snap}. ${complianceSummary}. Return JSON: { line1: '≤12 words — what happened', line2: '≤12 words — what to do next' }`;
}

export function buildDeepAnalysisPrompt({
  sport,
  date,
  distKm,
  durationMin,
  avgHr,
  maxHr,
  avgSpeedKmh,
  ascentM,
  powerLine,
  aerobicTe,
  anaerobicTe,
  z1,
  z2,
  z3,
  z4,
  z5,
  complianceSummary,
}) {
  return `You are an elite endurance coach. Analyze this workout in depth and return a JSON object.

WORKOUT DATA:
- Sport: ${sport}
- Date: ${date}
- Distance: ${distKm} km
- Duration: ${durationMin} min
- Avg HR: ${avgHr} bpm, Max HR: ${maxHr} bpm
- Avg speed: ${avgSpeedKmh} km/h
- Ascent: ${ascentM} m
${powerLine ? `- ${powerLine}` : ''}
- Aerobic TE: ${aerobicTe}/5, Anaerobic TE: ${anaerobicTe}/5
- HR zones: Z1 ${z1.toFixed(0)}%, Z2 ${z2.toFixed(0)}%, Z3 ${z3.toFixed(0)}%, Z4 ${z4.toFixed(0)}%, Z5 ${z5.toFixed(0)}%
- ${complianceSummary}

Return ONLY valid JSON (no prose outside):
{
  "analysis": "4–6 sentences of expert coaching analysis: intensity distribution, metabolic stimulus, execution quality, aerobic vs anaerobic balance, what was done well and what to improve",
  "conclusions": ["actionable coaching conclusion 1", "conclusion 2", "conclusion 3"]
}`;
}

export function buildConversationRecap(messages) {
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

export const PLAN_CHANGE_APPENDIX = '\n\nWhen the athlete asks to skip or swap a session: name the specific day and session type, state the training impact in ≤ 10 words (e.g. "drops this week\'s interval stimulus"), then offer the best alternative. Never silently agree to drop a key session.';
