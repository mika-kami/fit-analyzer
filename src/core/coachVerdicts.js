/**
 * buildAutoVerdict — deterministic 2-line verdict, zero API cost.
 * Returns { line1, line2 } — always present regardless of API availability.
 */
export function buildAutoVerdict(workout, complianceResult) {
  if (!workout) return null;

  const te       = Number(workout?.trainingEffect?.aerobic ?? 0);
  const z1       = Number(workout?.hrZones?.[0]?.pct ?? 0);
  const z2       = Number(workout?.hrZones?.[1]?.pct ?? 0);
  const easyPct  = Math.round(z1 + z2);
  const distKm   = ((workout?.distance ?? 0) / 1000).toFixed(1);
  const verdict  = complianceResult?.verdict ?? null;
  const score    = complianceResult?.score ?? null;

  let line1, line2;

  if (te >= 4.5) {
    line1 = `Maximal effort — TE ${te.toFixed(1)}, significant fitness stimulus`;
    line2 = 'Prioritize 48+ h recovery before next hard session';
  } else if (te >= 4.0) {
    line1 = `High-load session — TE ${te.toFixed(1)}, ${distKm} km`;
    line2 = 'Quality work done — recovery is now the training';
  } else if (easyPct >= 80 && te <= 3.0) {
    line1 = `Clean aerobic session — ${easyPct}% in Z1-Z2`;
    line2 = 'Good polarization. Maintain this pattern.';
  } else if (easyPct < 55) {
    line1 = `Too much middle intensity — only ${easyPct}% easy`;
    line2 = 'Junk miles risk. Next session: go easier or go harder.';
  } else {
    line1 = `Solid session — TE ${te.toFixed(1)}, ${distKm} km`;
    line2 = 'Consistent work. Stay on plan.';
  }

  if (verdict === 'off_target' && score != null) {
    line2 = `Plan compliance ${score}% — review pacing or distance target`;
  } else if (verdict === 'nailed_it') {
    line2 += ' — nailed the plan.';
  }

  return { line1, line2, deterministic: true };
}

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
