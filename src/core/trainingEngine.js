/**
 * trainingEngine.js — Scientific training plan generator.
 * Detraining model (Mujika & Padilla 2000), ATL/CTL/TSB (Banister 1991),
 * sport-specific volume floors, 8 phase templates.
 * No React dependencies. Fully unit-testable.
 */

// ─── Training plan engine ────────────────────────────────────────────────────
//
// Scientific basis:
//   - Detaining research: Mujika & Padilla (2000) — VO2max drops ~6% after 2 weeks,
//     performance-relevant losses start at 10-14 days of inactivity.
//   - ATL/CTL/TSB model (Banister 1991, Coggan): 7-day exponential avg = acute load,
//     42-day avg = chronic load (fitness), TSB = CTL - ATL = "freshness".
//   - 10% rule: weekly volume increases ≤ 10% to prevent overuse injury.
//   - Polarised training (Seiler 2010): ~80% low, ~20% high intensity for endurance.
//   - Rebuild phases after detraining use progressive overload starting at 50-60%
//     of previous volume.

// ─── Session intent metadata ──────────────────────────────────────────────────
// Added to each plan day so compliance and pacing engines know what was intended.
export const SESSION_INTENTS = {
  rest:     { maxHr: null,          targetZone: null,     pacingStrategy: null       },
  recovery: { maxHr: 'z1_ceiling',  targetZone: 'z1',     pacingStrategy: 'even'     },
  aerobic:  { maxHr: 'z2_ceiling',  targetZone: 'z1-z2',  pacingStrategy: 'even'     },
  tempo:    { maxHr: 'z3_ceiling',  targetZone: 'z3',     pacingStrategy: 'even'     },
  interval: { maxHr: null,          targetZone: 'z4-z5',  pacingStrategy: 'intervals'},
  long:     { maxHr: 'z2_ceiling',  targetZone: 'z1-z2',  pacingStrategy: 'negative_split' },
  test:     { maxHr: null,          targetZone: 'z1-z2',  pacingStrategy: 'even'     },
};

export const TYPE_COLOR = {
  rest:     '#374151',
  recovery: '#4ade80',
  aerobic:  '#a3e635',
  tempo:    '#fbbf24',
  interval: '#f97316',
  long:     '#60a5fa',
  test:     '#a855f7',
};

export const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

// ── ATL / CTL / TSB calculation ───────────────────────────────────────────────
export function calcTrainingLoad(historyWorkouts) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const _localIso = (d) => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };

  // Build a daily TE map for the past 42 days
  const teByDay = {};
  for (const w of historyWorkouts) {
    teByDay[w.date] = (w.trainingEffect?.aerobic ?? 0);
  }

  // ATL: 7-day simple average (acute)
  // CTL: 42-day simple average (chronic fitness)
  let atl = 0, ctl = 0;
  let atlDays = 0, ctlDays = 0;

  for (let d = 0; d < 42; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - d);
    const iso = _localIso(dt);
    const te  = teByDay[iso] ?? 0;
    if (d < 7)  { atl += te; atlDays++; }
    ctl += te; ctlDays++;
  }

  atl = atlDays > 0 ? atl / atlDays : 0;
  ctl = ctlDays > 0 ? ctl / ctlDays : 0;
  const tsb = ctl - atl; // positive = fresh, negative = fatigued

  return { atl, ctl, tsb };
}

// ── Detraining assessment ─────────────────────────────────────────────────────
export function assessDetraining(historyWorkouts) {
  if (!historyWorkouts.length) {
    return { daysSince: 999, phase: 'base_rebuild', label: 'No history — starting from base', factor: 0.40 };
  }

  const sorted = [...historyWorkouts].sort((a,b) => b.date.localeCompare(a.date));
  const lastDate = new Date(sorted[0].date);
  lastDate.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const daysSince = Math.round((today - lastDate) / 86400000);

  if (daysSince <= 3)  return { daysSince, phase: 'active',        label: 'Active period',           factor: 1.00 };
  if (daysSince <= 7)  return { daysSince, phase: 'slight',        label: 'Slight detraining (≤7 d)',  factor: 0.90 };
  if (daysSince <= 14) return { daysSince, phase: 'moderate',      label: 'Moderate detraining (≤14)', factor: 0.75 };
  if (daysSince <= 30) return { daysSince, phase: 'significant',   label: 'Significant detraining (≤30)',  factor: 0.55 };
  if (daysSince <= 90) return { daysSince, phase: 'base_rebuild',  label: 'Base rebuilding (>30)',  factor: 0.40 };
  return                       { daysSince, phase: 'full_restart', label: 'Full restart (>90 d)', factor: 0.30 };
}

// ── Zone balance analysis (last 4 weeks) ─────────────────────────────────────
export function analyzeRecentZones(historyWorkouts) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
  const recent = historyWorkouts.filter(w => new Date(w.date) >= cutoff);
  if (!recent.length) return { hiZonePct: 0, loZonePct: 0, balance: 'unknown' };

  let loSecs = 0, hiSecs = 0;
  for (const w of recent) {
    const zones = w.hrZones ?? [];
    for (const z of zones) {
      if (z.id === 'z1' || z.id === 'z2') loSecs += z.seconds ?? 0;
      if (z.id === 'z4' || z.id === 'z5') hiSecs += z.seconds ?? 0;
    }
  }
  const total = loSecs + hiSecs || 1;
  const loZonePct = loSecs / total * 100;
  const hiZonePct = hiSecs / total * 100;

  if (hiZonePct > 30) return { loZonePct, hiZonePct, balance: 'overreached' };
  if (loZonePct > 85) return { loZonePct, hiZonePct, balance: 'too_easy'    };
  return                     { loZonePct, hiZonePct, balance: 'polarised'   };
}

// ── Weekly volume reference (avg of last 4 active weeks) ─────────────────────
export function refWeeklyKm(historyWorkouts) {
  if (!historyWorkouts.length) return 0;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
  const recent = historyWorkouts.filter(w => new Date(w.date) >= cutoff);
  if (!recent.length) return 0;
  const totalKm = recent.reduce((s,w) => s + (w.distance ?? 0) / 1000, 0);
  return totalKm / 4; // per week average
}

// ── Day template library ──────────────────────────────────────────────────────

// ── Sport-specific config ─────────────────────────────────────────────────────
export function sportConfig(workout) {
  const s = (workout?.sport ?? workout?.sportLabel ?? '').toLowerCase();
  const isCycling = s.includes('cycl') || s.includes('bike') || s.includes('велос') || s.includes('road');
  const isRun     = s.includes('run') || s.includes('бег');

  if (isCycling) return {
    sport:        'cycling',
    // Weekly km floors per detraining phase (road cycling)
    weekFloors:   { full_restart:80, base_rebuild:100, significant:120, moderate:150, slight:170, active:180, overreached:80, too_easy:200 },
    // Typical elite/enthusiast reference week if no history
    defaultWeek:  200,
    unit:         'km',
    // Day labels and descriptions specific to road cycling
    templates: {
      rest:     ()     => ({ type:'rest',     label:'Full rest',            intensity:0,  targetKm:0, desc:'Complete rest. Stretching, sleep, hydration.' }),
      recovery: (weekKm) => {
        const s   = Math.max(30, Math.round(weekKm * 0.18));
        const h   = (s / 22).toFixed(1);
        return { type:'recovery', label:`Recovery ride (${s} km)`, intensity:15, targetKm:s,
          desc:`${s} km (~${h}h) Z1 only. HR <60% max, cadence 90+, flat terrain. No effort above Z1 — this actively aids recovery.` };
      },
      aerobic: (weekKm) => {
        const s = Math.round(weekKm * 0.55);
        const h = (s / 27).toFixed(1);
        return { type:'aerobic', label:`Z2 Endurance (${s} km)`, intensity:50, targetKm:s,
          desc:`${s} km (~${h}h) at Z2. HR 60–70%, cadence 85–95, fully conversational. Fuel every 45 min for rides over 90 min.` };
      },
      long: (weekKm) => {
        const s    = Math.round(weekKm * 0.80);
        const hNum = s / 25;
        const h    = hNum.toFixed(1);
        const gels = Math.max(1, Math.round(hNum * 60 / 45));
        return { type:'long', label:`Long ride (${s} km)`, intensity:60, targetKm:s,
          desc:`${s} km (~${h}h) steady Z2. No hard efforts. Fuel: 1 gel + 500 ml water every 45 min (~${gels} gels). Sit up and save legs in the final 30 min.` };
      },
      tempo: (weekKm) => {
        const s       = Math.round(weekKm * 0.45);
        const totMin  = Math.round(s / 25 * 60);
        const workMin = Math.max(20, totMin - 30);
        let label, desc;
        if (workMin < 45) {
          label = `Sweet spot — 1×${workMin} min SST (${s} km)`;
          desc  = `${s} km total: 15 min Z2 warm-up → 1×${workMin} min sweet spot (88–93% FTP, HR ~78–85% max) → 15 min Z1 cool-down.`;
        } else if (workMin < 70) {
          const blk = Math.round(workMin / 2);
          label = `Sweet spot — 2×${blk} min SST (${s} km)`;
          desc  = `${s} km total: 15 min Z2 warm-up → 2×${blk} min SST (5 min Z1 between) → Z2 endurance → 15 min cool-down.`;
        } else {
          const blk = Math.round(workMin / 3);
          label = `Sweet spot — 3×${blk} min SST (${s} km)`;
          desc  = `${s} km total: 15 min Z2 warm-up → 3×${blk} min SST (5 min Z1 between) → Z2 endurance to complete distance → 15 min cool-down.`;
        }
        return { type:'tempo', label, intensity:65, targetKm:s, desc };
      },
      interval: (weekKm) => {
        const s       = Math.round(weekKm * 0.38);
        const totMin  = Math.round(s / 25 * 60);
        const workMin = Math.max(30, totMin - 35);
        let sets, repMin, recMin;
        if (workMin < 50)       { sets = 3; repMin = 10; recMin = 5; }
        else if (workMin < 80)  { sets = 2; repMin = 20; recMin = 5; }
        else if (workMin < 110) { sets = 3; repMin = 15; recMin = 5; }
        else                    { sets = 4; repMin = 15; recMin = 5; }
        return { type:'interval',
          label:  `FTP intervals — ${sets}×${repMin} min (${s} km)`, intensity:85, targetKm:s,
          desc:   `${s} km total: 20 min Z2 warm-up → ${sets}×${repMin} min @FTP (${recMin} min Z1 recovery) → Z2 endurance to complete distance → 15 min cool-down.` };
      },
      vo2: (weekKm) => {
        const s       = Math.round(weekKm * 0.32);
        const totMin  = Math.round(s / 25 * 60);
        const workMin = Math.max(24, totMin - 35);
        let sets, repMin, recMin;
        if (workMin < 45)      { sets = 4; repMin = 4; recMin = 4; }
        else if (workMin < 65) { sets = 5; repMin = 5; recMin = 5; }
        else if (workMin < 85) { sets = 6; repMin = 5; recMin = 5; }
        else                   { sets = 5; repMin = 6; recMin = 6; }
        return { type:'interval',
          label: `VO₂max — ${sets}×${repMin} min Z5 (${s} km)`, intensity:90, targetKm:s,
          desc:  `${s} km total: 20 min Z2 warm-up → ${sets}×${repMin} min @VO₂max (>106% FTP / >90% HRmax, ${recMin} min Z1 recovery) → Z2 endurance to complete distance → 15 min cool-down.` };
      },
      hills: (weekKm) => {
        const s       = Math.round(weekKm * 0.38);
        const totMin  = Math.round(s / 22 * 60); // hilly = slower avg
        const workMin = Math.max(25, totMin - 30);
        const climbMin = Math.min(8, Math.round(workMin / (workMin < 60 ? 5 : workMin < 90 ? 7 : 10)));
        const reps     = Math.round(workMin / (climbMin + climbMin * 0.8)); // climb + ~same descent recovery
        const repsC    = Math.max(4, Math.min(12, reps));
        return { type:'tempo',
          label: `Climbing repeats — ${repsC}×${climbMin} min (${s} km)`, intensity:78, targetKm:s,
          desc:  `${s} km total: 15 min Z2 warm-up → ${repsC} climbs of ${climbMin} min Z3–Z4 (cadence 55–65, seated), coast descent for recovery → Z2 home. Hilly route.` };
      },
      test: (weekKm) => {
        const s = Math.round(weekKm * 0.35);
        return { type:'test', label:`FTP test ride (${s} km)`, intensity:35, targetKm:s,
          desc:   `${s} km: 30 min Z2 warm-up → 5 min all-out → 5 min easy → 20 min time-trial effort at maximal sustainable power (record avg power + HR) → easy Z1 home. Do not eat for 2h before.` };
      },
    },
  };

  if (isRun) return {
    sport:       'running',
    weekFloors:  { full_restart:25, base_rebuild:30, significant:35, moderate:40, slight:45, active:50, overreached:25, too_easy:55 },
    defaultWeek: 50,
    unit:        'km',
    templates: {
      rest: () => ({ type:'rest', label:'Full rest', intensity:0, targetKm:0,
        desc:'Complete rest. Light stretching, foam rolling, and extra sleep are welcome.' }),

      recovery: (weekKm) => {
        const s   = Math.max(4, Math.round(weekKm * 0.12));
        const min = Math.round(s / 6.5 * 60); // ~6.5 min/km easy pace
        return { type:'recovery', label:`Easy recovery run (${s} km)`, intensity:15, targetKm:s,
          desc:`${s} km (~${min} min) at a truly easy Z1 pace (HR <65% max). Should feel effortless — hold a full conversation throughout. No watch pressure.` };
      },

      aerobic: (weekKm) => {
        const s   = Math.max(6, Math.round(weekKm * 0.20));
        const min = Math.round(s / 5.5 * 60); // ~5.5 min/km aerobic
        return { type:'aerobic', label:`Aerobic Z2 run (${s} km)`, intensity:50, targetKm:s,
          desc:`${s} km (~${min} min) at a comfortable Z2 pace (HR 65–75% max, nasal breathing). The cornerstone of aerobic development — keep it honest: slow down on hills.` };
      },

      long: (weekKm) => {
        const s      = Math.max(10, Math.round(weekKm * 0.30));
        const minNum = s / 5.5 * 60;
        const min    = Math.round(minNum);
        const gels   = Math.max(0, Math.round((minNum - 60) / 45)); // gel every 45 min after first hour
        const gelNote = gels > 0 ? ` Fuel: 1 gel every 45 min after the first hour (~${gels} total).` : '';
        return { type:'long', label:`Long run (${s} km)`, intensity:60, targetKm:s,
          desc:`${s} km (~${min} min) at easy-to-moderate Z2 pace (30–60 s/km slower than marathon effort).${gelNote} Walk uphills if needed — time on feet matters more than pace.` };
      },

      tempo: (weekKm) => {
        const s       = Math.max(6, Math.round(weekKm * 0.16));
        const totMin  = Math.round(s / 5.0 * 60); // tempo avg ~5 min/km
        const workMin = Math.max(15, totMin - 20); // subtract 10+10 min warm/cool
        let label, desc;
        if (workMin < 25) {
          label = `Threshold run — 1×${workMin} min (${s} km)`;
          desc  = `${s} km total: 2 km easy warm-up jog → ${workMin} min continuous at threshold pace (Z3, comfortably hard — can speak 2–3 words) → 2 km easy cool-down.`;
        } else if (workMin < 45) {
          const blk = Math.round(workMin / 2);
          label = `Tempo run — 2×${blk} min (${s} km)`;
          desc  = `${s} km total: 2 km warm-up → 2×${blk} min at threshold pace (Z3, ~10 km race effort), 3 min easy jog between → 2 km cool-down. Stay relaxed — tempo is controlled discomfort.`;
        } else {
          const blk = Math.round(workMin / 3);
          label = `Tempo cruise — 3×${blk} min (${s} km)`;
          desc  = `${s} km total: 2 km warm-up → 3×${blk} min at threshold/comfortably hard pace (Z3), 3 min jog recovery between → easy running to complete distance → 2 km cool-down.`;
        }
        return { type:'tempo', label, intensity:65, targetKm:s, desc };
      },

      interval: (weekKm) => {
        const s       = Math.max(5, Math.round(weekKm * 0.14));
        const totMin  = Math.round(s / 5.0 * 60);
        const workMin = Math.max(20, totMin - 24); // ~12 min warm + 12 min cool
        // Each 1 km rep takes ~4 min at Z4 + 2 min recovery = 6 min per rep
        const reps    = Math.max(3, Math.min(10, Math.round(workMin / 6)));
        const repDist = reps <= 4 ? '1200 m' : reps <= 7 ? '1 km' : '800 m';
        const recNote = reps <= 4 ? '90 s' : '2 min';
        return { type:'interval', label:`Intervals Z4 — ${reps}×${repDist} (${s} km)`, intensity:85, targetKm:s,
          desc:`${s} km total: 2 km warm-up → ${reps}×${repDist} at 5 km race effort (Z4 / ~90–95% HRmax), ${recNote} jog recovery between → 2 km cool-down. Last rep should feel like you could do one more.` };
      },

      vo2: (weekKm) => {
        const s       = Math.max(4, Math.round(weekKm * 0.11));
        const totMin  = Math.round(s / 5.0 * 60);
        const workMin = Math.max(16, totMin - 24);
        // VO2max: 3–5 min reps with equal recovery. Classic Billat: 3×, 4×, 5×3 min or 4×4 min
        let sets, repMin, recMin;
        if (workMin < 28)      { sets = 4; repMin = 3; recMin = 3; }
        else if (workMin < 40) { sets = 5; repMin = 3; recMin = 3; }
        else if (workMin < 50) { sets = 4; repMin = 4; recMin = 4; }
        else                   { sets = 5; repMin = 4; recMin = 4; }
        return { type:'interval', label:`VO₂max — ${sets}×${repMin} min Z5 (${s} km)`, intensity:90, targetKm:s,
          desc:`${s} km total: 2 km warm-up → ${sets}×${repMin} min at VO₂max effort (1500 m race pace / >95% HRmax, ${recMin} min easy jog recovery) → 2 km cool-down. Legs should feel heavy after rep 3 — that's the stimulus.` };
      },

      hills: (weekKm) => {
        const s       = Math.max(5, Math.round(weekKm * 0.13));
        const totMin  = Math.round(s / 5.5 * 60);
        const workMin = Math.max(20, totMin - 24);
        // Hill reps: 30–60 s sprints, walk/jog back ~90 s recovery
        const repSec  = workMin < 30 ? 30 : workMin < 50 ? 45 : 60;
        const cycleMin = (repSec + 90) / 60; // uphill sprint + jog back
        const reps    = Math.max(6, Math.min(15, Math.round(workMin / cycleMin)));
        return { type:'tempo', label:`Hill repeats — ${reps}×${repSec} s (${s} km)`, intensity:78, targetKm:s,
          desc:`${s} km total: 2 km easy warm-up → ${reps} hill sprints of ${repSec} s at 5 km effort (Z3–Z4, drive knees, short stride) — jog back down for recovery → 2 km cool-down. Builds leg strength and running economy.` };
      },

      test: (weekKm) => {
        const s = Math.max(5, Math.round(weekKm * 0.14));
        return { type:'test', label:`Baseline run (${s} km)`, intensity:35, targetKm:s,
          desc:`${s} km: 2 km easy warm-up → run a 3 km effort at a controlled hard pace (record avg HR + split times) → 2 km easy cool-down. Used to calibrate zones — consistent conditions required (same route, rested legs).` };
      },
    },
  };

  // Generic fallback (mixed / cross-training)
  return {
    sport:       'other',
    weekFloors:  { full_restart:30, base_rebuild:40, significant:50, moderate:60, slight:70, active:80, overreached:30, too_easy:90 },
    defaultWeek: 60,
    unit:        'km',
    templates: {
      rest:     () => ({ type:'rest',     label:'Full rest',              intensity:0,  targetKm:0,                  desc:'Complete rest. Stretching, mobility, or light walk only.' }),
      recovery: (km) => { const s=Math.round(km*0.16); return { type:'recovery', label:`Easy Z1 session (${s} km)`, intensity:15, targetKm:s, desc:`${s} km at minimal effort (HR <65% max). Active recovery — the goal is circulation and loosening up, not fitness.` }; },
      aerobic:  (km) => { const s=Math.round(km*0.22); return { type:'aerobic',  label:`Aerobic Z2 (${s} km)`,      intensity:50, targetKm:s, desc:`${s} km at comfortable Z2 (HR 65–75% max). Foundational aerobic work — maintain conversational effort throughout.` }; },
      long:     (km) => { const s=Math.round(km*0.32); return { type:'long',     label:`Long Z2 (${s} km)`,         intensity:60, targetKm:s, desc:`${s} km at easy-moderate Z2. Builds aerobic base. Stay in Z2 — if HR drifts above 75% max, slow down.` }; },
      tempo:    (km) => { const s=Math.round(km*0.22); return { type:'tempo',    label:`Tempo Z3 (${s} km)`,        intensity:65, targetKm:s, desc:`${s} km: 10–15 min Z2 warm-up → main block at Z3 (70–80% HR max, comfortably hard) → 10 min cool-down.` }; },
      interval: (km) => { const s=Math.round(km*0.18); return { type:'interval', label:`Intervals Z4 (${s} km)`,   intensity:85, targetKm:s, desc:`${s} km: warm-up → repeated hard efforts at Z4 (80–90% HR max) with Z1 recovery between → cool-down.` }; },
      vo2:      (km) => { const s=Math.round(km*0.14); return { type:'interval', label:`VO₂max Z5 (${s} km)`,      intensity:90, targetKm:s, desc:`${s} km: warm-up → short maximal efforts at Z5 (>90% HR max) with full recovery between → cool-down.` }; },
      hills:    (km) => { const s=Math.round(km*0.18); return { type:'tempo',    label:`Strength Z3–Z4 (${s} km)`, intensity:78, targetKm:s, desc:`${s} km: warm-up → repeated strength-focused efforts (hills, resistance) at Z3–Z4 → easy cool-down.` }; },
      test:     (km) => { const s=Math.round(km*0.16); return { type:'test',     label:`Baseline session (${s} km)`,intensity:35, targetKm:s, desc:`${s} km: easy warm-up → controlled effort at a consistent pace — record avg HR and speed/power to calibrate zones.` }; },
    },
  };
}

// ── Plan templates per phase (sport-agnostic, use cfg.templates) ──────────────
export const PHASE_PLANS = {
  full_restart: (T, km) => [
    T.rest(km), T.test(km), T.rest(km),
    T.recovery(km), T.rest(km), T.aerobic(km), T.rest(km),
  ],
  base_rebuild: (T, km) => [
    T.rest(km), T.recovery(km), T.aerobic(km),
    T.rest(km), T.recovery(km), T.long(km), T.rest(km),
  ],
  significant: (T, km) => [
    T.recovery(km), T.aerobic(km), T.rest(km),
    T.aerobic(km), T.rest(km), T.long(km), T.recovery(km),
  ],
  moderate: (T, km) => [
    T.recovery(km), T.aerobic(km), T.tempo(km),
    T.rest(km), T.aerobic(km), T.long(km), T.recovery(km),
  ],
  slight: (T, km) => [
    T.rest(km), T.aerobic(km), T.tempo(km),
    T.rest(km), T.interval(km), T.long(km), T.recovery(km),
  ],
  overreached: (T, km) => [
    T.rest(km), T.recovery(km), T.recovery(km),
    T.rest(km), T.aerobic(km), T.aerobic(km), T.rest(km),
  ],
  active: (T, km) => [
    T.rest(km), T.aerobic(km), T.tempo(km),
    T.rest(km), T.interval(km), T.long(km), T.recovery(km),
  ],
  too_easy: (T, km) => [
    T.aerobic(km), T.hills(km), T.rest(km),
    T.interval(km), T.aerobic(km), T.long(km), T.recovery(km),
  ],
};


// ── Mesocycle helpers ─────────────────────────────────────────────────────────

function _addDaysToIso(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function phaseForWeek(weekIndex, totalWeeks) {
  if (totalWeeks <= 0) return 'base';
  const ratio = weekIndex / totalWeeks;
  if (ratio < 0.40) return 'base';
  if (ratio < 0.70) return 'build';
  if (ratio < 0.85) return 'peak';
  return 'taper';
}

export function isRecoveryWeek(weekIndex) {
  return (weekIndex + 1) % 4 === 0;
}

export function computeWeekVolume(weekIndex, totalWeeks, peakKm) {
  // peakKm = baseKm * 1.25, so 0.80 * peakKm = baseKm (current training volume)
  if (isRecoveryWeek(weekIndex)) return Math.round(peakKm * 0.60);
  const phase = phaseForWeek(weekIndex, totalWeeks);
  if (phase === 'taper') {
    const taperStart = Math.floor(totalWeeks * 0.85);
    const taperPos   = weekIndex - taperStart;
    const factors    = [0.80, 0.65, 0.50, 0.35];
    return Math.round(peakKm * (factors[Math.min(taperPos, factors.length - 1)] ?? 0.35));
  }
  const baseEnd  = Math.floor(totalWeeks * 0.40);
  const buildEnd = Math.floor(totalWeeks * 0.70);
  if (phase === 'base') {
    // Start at 0.80 (= baseKm), build to 0.88
    const pos = weekIndex / Math.max(baseEnd, 1);
    return Math.round(peakKm * (0.80 + pos * 0.08));
  }
  if (phase === 'build') {
    // 0.88 → 0.96
    const pos = (weekIndex - baseEnd) / Math.max(buildEnd - baseEnd, 1);
    return Math.round(peakKm * (0.88 + pos * 0.08));
  }
  // peak: 0.96 → 1.00
  const peakEnd = Math.floor(totalWeeks * 0.85);
  const pos = (weekIndex - buildEnd) / Math.max(peakEnd - buildEnd, 1);
  return Math.round(peakKm * (0.96 + pos * 0.04));
}

export const PHASE_COLORS = {
  base:     '#60a5fa',
  build:    '#f97316',
  peak:     '#ef4444',
  taper:    '#4ade80',
  recovery: '#6b7280',
};

export const PHASE_LABELS = {
  base:     'Base Building',
  build:    'Build Phase',
  peak:     'Peak Phase',
  taper:    'Taper',
  recovery: 'Recovery',
};

function _templateKeyForPhase(phase, load, zones) {
  if (phase === 'base')     return 'base_rebuild';
  if (phase === 'build')    return (load?.tsb < -20 || zones?.balance === 'overreached') ? 'overreached' : 'active';
  if (phase === 'peak')     return load?.tsb < -20 ? 'overreached' : 'too_easy';
  if (phase === 'taper')    return 'significant';
  return 'base_rebuild';
}

function _generateWeekDays(workout, historyWorkouts, weekStartIso, weekVolKm, phase) {
  const cfg         = sportConfig(workout);
  const T           = cfg.templates;
  const load        = calcTrainingLoad(historyWorkouts);
  const zones       = analyzeRecentZones(historyWorkouts);
  const templateKey = _templateKeyForPhase(phase, load, zones);
  const planFn      = PHASE_PLANS[templateKey] ?? PHASE_PLANS.base_rebuild;
  const rawDays     = planFn(T, weekVolKm);

  const weekStart = new Date(weekStartIso + 'T00:00:00Z');
  return rawDays.map((d, i) => {
    const dayDate = new Date(weekStart);
    dayDate.setUTCDate(weekStart.getUTCDate() + i);
    const dateIso = dayDate.toISOString().slice(0, 10);
    // Label by actual day-of-week (Mon=0..Sun=6)
    const isoDow = (dayDate.getUTCDay() + 6) % 7;
    return {
      ...d,
      day:     DAY_LABELS[isoDow],
      date:    dateIso.slice(5).replace('-', '/'),
      dateIso,
      dow:     isoDow,
      color:   TYPE_COLOR[d.type] ?? '#6b7280',
      intent:  SESSION_INTENTS[d.type] ?? SESSION_INTENTS.aerobic,
    };
  });
}

/**
 * generateMesocycle — public API for multi-week plan generation.
 * @param {object} profile
 * @param {object[]} historyWorkouts
 * @param {string|null} startDate — ISO date (YYYY-MM-DD) for week 1 day 1.
 *   Defaults to the next Monday when null.
 * Returns { weeks[], currentWeekIndex, meta }.
 */
export function generateMesocycle(profile, historyWorkouts = [], startDate = null) {
  const _now = new Date(); const todayIso = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;

  let goalDate   = profile?.goalDate ?? '';
  let totalWeeks;

  if (goalDate) {
    const msUntilGoal = new Date(goalDate) - new Date(todayIso);
    const daysUntilGoal = Math.ceil(msUntilGoal / 86400000);
    totalWeeks = Math.ceil(daysUntilGoal / 7);
    totalWeeks = Math.min(16, Math.max(4, totalWeeks));
  } else {
    totalWeeks = 4;
    goalDate   = _addDaysToIso(todayIso, 28);
  }

  // Determine peak km from history + detraining
  const refKm      = refWeeklyKm(historyWorkouts);
  const detraining = assessDetraining(historyWorkouts);
  const sportObj   = { sport: profile?.targetSport ?? 'running', sportLabel: profile?.targetSport };
  const cfg        = sportConfig(sportObj);
  const floor      = cfg.weekFloors['active'] ?? cfg.defaultWeek;

  // When no recent history, derive base from profile.weeklyHours × sport speed estimate
  const weeklyHours = Number(profile?.weeklyHours ?? 6);
  const hoursKm = cfg.sport === 'cycling' ? weeklyHours * 22
                : cfg.sport === 'running'  ? weeklyHours * 10
                : weeklyHours * 15;
  const effectiveRefKm = refKm > 0 ? refKm : hoursKm;

  const baseKm     = Math.max(effectiveRefKm * detraining.factor, floor);
  const peakKm     = Math.round(baseKm * 1.25);

  // Start mesocycle from the given date, or snap to NEXT Monday by default
  let msStartIso;
  if (startDate) {
    msStartIso = startDate;
  } else {
    const todayJs  = new Date(todayIso + 'T00:00:00Z');
    const todayDow = todayJs.getUTCDay(); // 0=Sun...6=Sat
    const daysToNextMon = todayDow === 1 ? 7 : (8 - todayDow) % 7 || 7;
    const msStart  = new Date(todayJs);
    msStart.setUTCDate(todayJs.getUTCDate() + daysToNextMon);
    msStartIso = msStart.toISOString().slice(0, 10);
  }

  const weeks = [];
  for (let w = 0; w < totalWeeks; w++) {
    const weekStartIso = _addDaysToIso(msStartIso, w * 7);
    const weekEndIso   = _addDaysToIso(weekStartIso, 6);
    const phase        = phaseForWeek(w, totalWeeks);
    const isRecovery   = isRecoveryWeek(w);
    const weekKm       = computeWeekVolume(w, totalWeeks, peakKm);
    const effectPhase  = isRecovery ? 'recovery' : phase;
    const days         = _generateWeekDays(sportObj, historyWorkouts, weekStartIso, weekKm, effectPhase);
    const targetKm     = days.reduce((s, d) => s + (d.targetKm ?? 0), 0);
    weeks.push({ weekIndex: w, startDate: weekStartIso, endDate: weekEndIso, phase, isRecovery, targetKm, days });
  }

  const currentWeekIndex = Math.max(0, weeks.findIndex(wk => todayIso >= wk.startDate && todayIso <= wk.endDate));
  const msEndIso = weeks.length ? weeks[weeks.length - 1].endDate : _addDaysToIso(msStartIso, totalWeeks * 7 - 1);

  return {
    weeks,
    currentWeekIndex,
    meta: { totalWeeks, peakKm, startDate: msStartIso, endDate: msEndIso, goalDate, goal: profile?.primaryGoal ?? '', sport: profile?.targetSport ?? 'mixed', planStartDate: msStartIso },
  };
}

// Legacy entry point kept for backward compat — internal plan generation.
export function generateTrainingPlan(workout, historyWorkouts = [], startDow = null) {
  const detraining = assessDetraining(historyWorkouts);
  const load       = calcTrainingLoad(historyWorkouts);
  const zones      = analyzeRecentZones(historyWorkouts);

  // Sport-specific configuration
  const cfg        = sportConfig(workout);
  const floor      = cfg.weekFloors[detraining.phase] ?? cfg.defaultWeek;
  const refKm      = refWeeklyKm(historyWorkouts);
  // If we have history, scale it; otherwise fall back to sport default floor
  const scaledKm   = refKm > 0
    ? Math.max(refKm * detraining.factor, floor)
    : floor;
  const baseKm     = scaledKm;

  // Determine template key
  let templateKey = detraining.phase;
  if (templateKey === 'active') {
    if (load.tsb < -20 || zones.balance === 'overreached') templateKey = 'overreached';
    else if (zones.balance === 'too_easy')                  templateKey = 'too_easy';
  }

  const T       = cfg.templates;
  const planFn  = PHASE_PLANS[templateKey] ?? PHASE_PLANS.base_rebuild;
  const rawDays = planFn(T, baseKm); // pass sport-specific templates

  // startDow: 0=Mon..6=Sun. Default = today.
  const today    = new Date();
  const todayDow = (today.getDay() + 6) % 7; // JS Sun=0 → Mon=0
  const dow0     = startDow !== null ? startDow : todayDow;

  // Rotate template so rawDays[0] corresponds to the chosen start day.
  // The template is designed as Mon..Sun, so we rotate by (dow0 - 0).
  // rawDays[i] → day (dow0 + i) % 7
  const days = rawDays.map((d, i) => {
    const dayDow  = (dow0 + i) % 7;
    const date    = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = date.toISOString().slice(5, 10).replace('-', '/');
    return {
      ...d,
      day:        DAY_LABELS[dayDow],
      date:       dateStr,
      dateIso:    date.toISOString().slice(0, 10),
      dow:        dayDow,
      color:      TYPE_COLOR[d.type] ?? '#6b7280',
      intent:     SESSION_INTENTS[d.type] ?? SESSION_INTENTS.aerobic,
      isToday:    i === 0 && dow0 === todayDow,
      isTomorrow: i === 0 && dow0 === (todayDow + 1) % 7,
    };
  });

  return {
    days,
    startDow: dow0,
    meta: {
      phase:       templateKey,
      detraining,
      load:        { atl: parseFloat(load.atl.toFixed(2)), ctl: parseFloat(load.ctl.toFixed(2)), tsb: parseFloat(load.tsb.toFixed(2)) },
      zones,
      baseKm:      Math.round(baseKm),
      targetWeekKm: Math.round(rawDays.reduce((s,d) => s + (d.targetKm||0), 0)),
    },
  };
}