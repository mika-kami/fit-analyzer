export function buildCoachTake(workout) {
  if (!workout) return { verdict: 'No workout loaded.', next: 'Load a session to get a deterministic coach take.' };

  const z1 = Number(workout?.hrZones?.[0]?.pct ?? 0);
  const z2 = Number(workout?.hrZones?.[1]?.pct ?? 0);
  const easyPct = Math.round(z1 + z2);
  const te = Number(workout?.trainingEffect?.aerobic ?? 0);
  const recovery = Number(workout?.load?.recoveryDays ?? 1);

  let verdict;
  if (easyPct >= 70 && te <= 3.4) {
    verdict = `Solid aerobic control: ${easyPct}% in Z1-Z2 with TE ${te.toFixed(1)}.`;
  } else if (te >= 4.0) {
    verdict = `High stress session (TE ${te.toFixed(1)}): quality was there, but fatigue cost is significant.`;
  } else if (easyPct < 55) {
    verdict = `Too much middle intensity (${easyPct}% easy): this trends toward junk-load accumulation.`;
  } else {
    verdict = `Balanced session with moderate load (TE ${te.toFixed(1)}).`;
  }

  const next = recovery >= 2
    ? `Recovery focus for ${recovery} days: easy Z1/Z2 only, no hard intervals.`
    : `Recovery 1 day, then resume planned progression.`;

  return { verdict, next };
}
