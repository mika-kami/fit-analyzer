function calculateAgeFromBirthday(birthday) {
  if (!birthday) return 'unknown';
  const d = new Date(birthday);
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age;
}

export function buildAIMesocycleSystemPrompt({
  planWeeks,
  sport,
  form,
  profile,
  weeklyHours,
  weeklyKm,
  scheduleKm,
  load,
  detraining,
  recentSummary,
  sessionKmTargets,
}) {
  const goal = form.primaryGoal || profile.primaryGoal || 'general fitness improvement';
  const goalDate = form.useGoalDate ? (form.goalDate || 'none') : 'none';
  const ftp = profile.ftp ? `${profile.ftp} W` : 'unknown';
  const lthr = profile.lthr ? `${profile.lthr} bpm` : 'unknown';
  const hasWattmeter = !!(form?.hasWattmeter ?? profile?.hasWattmeter ?? profile?.medical?.hasWattmeter);
  const weight = profile.weightKg ? `${profile.weightKg} kg` : 'unknown';
  const age = profile.age ?? calculateAgeFromBirthday(profile.birthday);

  const sesKm = sessionKmTargets;

  return `You are an elite endurance coach. Generate a personalized ${planWeeks}-week training mesocycle as JSON.

ATHLETE PROFILE:
- Sport: ${sport}
- Goal: ${goal}
- Goal event date: ${goalDate}
- Available training hours: ${weeklyHours}h/week (hard cap: weekday ${form.hoursWeekday}h, weekend ${form.hoursWeekend}h per session)
- CURRENT fitness level: ~${weeklyKm} km/week (detraining-adjusted; ramp 5–10%/week toward ${scheduleKm} km/week capacity)
- Training days: ${form.trainingDays.join(', ')} — all other days must be type "rest" with targetKm 0
- Long session day: ${form.longSessionDay}
- Hard/interval day: ${form.hardSessionDay}
- Wattmeter available: ${hasWattmeter ? 'yes' : 'no'}
- FTP: ${ftp}
- LTHR: ${lthr}
- Weight: ${weight}
- Age: ${age}

CURRENT FITNESS STATE:
- CTL (42-day chronic fitness): ${load.ctl.toFixed(1)}
- ATL (7-day acute load): ${load.atl.toFixed(1)}
- TSB (freshness = CTL - ATL): ${load.tsb.toFixed(1)}
- Detraining status: ${detraining.label} (${detraining.daysSince < 999 ? `${detraining.daysSince} days since last workout` : 'no history'})

RECENT TRAINING LOG (last 24 sessions):
${recentSummary}

SESSION KM TARGETS — week 1 base values (scale up each week; recovery weeks = 60%):
- Weekday recovery:  ${sesKm.wd_recovery} km
- Weekday aerobic:   ${sesKm.wd_aerobic} km
- Weekday tempo:     ${sesKm.wd_tempo} km
- Weekday interval:  ${sesKm.wd_interval} km
- Weekend recovery:  ${sesKm.we_recovery} km
- Long ride/run:     ${sesKm.we_long} km  ← HARD CAP, never exceed

OUTPUT RULES:
- Return ONLY valid JSON, no prose outside it
- ${planWeeks} weeks total, 7 days each (Mo through Su)
- "type": rest | recovery | aerobic | tempo | interval | long | test
- "intensity": rest=0, recovery=15, aerobic=50, long=60, tempo=65, interval=85
- "targetKm": MUST equal the km stated in "desc". Never exceed session caps above. Rest days = 0.
- "label": short name WITHOUT km (e.g. "Z2 Endurance", "Sweet spot", "Long ride") — km shown separately
- "desc": 1–2 sentences: state the exact km, then protocol (zones, HR targets, rep counts)
- If wattmeter is "no" OR FTP is "unknown": do NOT use %FTP or power targets. Use HR zones + RPE + cadence guidance.
- "targetKm" per week = sum of all day targetKm values
- Every 4th week: recovery week at 60% volume
- Structure: first 40% base, next 30% build, next 15% peak, last 15% taper
- Polarized 80/20: 80% Z1–Z2, 20% Z4–Z5

JSON SCHEMA:
{
  "weeks": [
    {
      "weekNumber": 1,
      "phase": "base",
      "isRecovery": false,
      "targetKm": ${weeklyKm},
      "focus": "Aerobic base, adapting to load",
      "days": [
        { "dayOfWeek": "Mo", "type": "recovery", "label": "Easy recovery", "desc": "${sesKm.wd_recovery} km easy Z1 spin, HR <65% max.", "intensity": 15, "targetKm": ${sesKm.wd_recovery} },
        { "dayOfWeek": "Tu", "type": "aerobic",  "label": "Z2 Endurance",  "desc": "${sesKm.wd_aerobic} km at Z2, conversational pace.", "intensity": 50, "targetKm": ${sesKm.wd_aerobic} },
        { "dayOfWeek": "We", "type": "rest",     "label": "Full rest",      "desc": "Rest.", "intensity": 0, "targetKm": 0 },
        { "dayOfWeek": "Th", "type": "tempo",    "label": "Sweet spot",     "desc": "${sesKm.wd_tempo} km: warm-up → SST block → cool-down.", "intensity": 65, "targetKm": ${sesKm.wd_tempo} },
        { "dayOfWeek": "Fr", "type": "rest",     "label": "Full rest",      "desc": "Rest.", "intensity": 0, "targetKm": 0 },
        { "dayOfWeek": "Sa", "type": "long",     "label": "Long ride",      "desc": "${sesKm.we_long} km steady Z2, fuel every 45 min.", "intensity": 60, "targetKm": ${sesKm.we_long} },
        { "dayOfWeek": "Su", "type": "recovery", "label": "Recovery spin",  "desc": "${sesKm.we_recovery} km Z1 active recovery.", "intensity": 15, "targetKm": ${sesKm.we_recovery} }
      ]
    }
  ]
}`;
}
