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
    const iso = dt.toISOString().slice(0,10);
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
      rest:      (km) => ({ type:'rest',     label:'Full rest',                         intensity:0,  targetKm:0,              desc:'Recovery, stretching, sleep' }),
      recovery:  (km) => ({ type:'recovery', label:'Recovery ride Z1',          intensity:15, targetKm:Math.max(Math.round(km*0.25), 25), desc:'Cadence 90+, HR <60% max, full freedom' }),
      aerobic:   (km) => ({ type:'aerobic',  label:'Aerobic base Z2',                      intensity:50, targetKm:Math.round(km*0.55), desc:'Cadence 85–95, HR 60–70%, conversational pace' }),
      long:      (km) => ({ type:'long',     label:`Long ride Z2 (~${Math.round(km*0.80)} km)`,intensity:60, targetKm:Math.round(km*0.80), desc:'Steady pace, no accelerations, gels every 45 min' }),
      tempo:     (km) => ({ type:'tempo',    label:'Tempo Z3',                           intensity:65, targetKm:Math.round(km*0.45), desc:'Mid block 20–40 min in Z3, 15 min warm-up and cool-down' }),
      interval:  (km) => ({ type:'interval', label:'Intervals Z4 — 4×8 min',               intensity:85, targetKm:Math.round(km*0.38), desc:'4 intervals of 8 min Z4, 4 min recovery Z1 in between' }),
      vo2:       (km) => ({ type:'interval', label:'VO₂max — 5×4 min Z5',                  intensity:90, targetKm:Math.round(km*0.32), desc:'5 intervals of 4 min >90% max HR, 4 min pause' }),
      hills:     (km) => ({ type:'tempo',    label:'Strength climbs — 6×5 min',            intensity:78, targetKm:Math.round(km*0.38), desc:'Cadence 55–65, Z3–Z4 on climb, coast on descent' }),
      test:      (km) => ({ type:'test',     label:'Assessment ride Z1–Z2',               intensity:35, targetKm:Math.round(km*0.35), desc:'Record HR and perceived effort — this is the baseline' }),
    },
  };

  if (isRun) return {
    sport:       'running',
    weekFloors:  { full_restart:25, base_rebuild:30, significant:35, moderate:40, slight:45, active:50, overreached:25, too_easy:55 },
    defaultWeek: 50,
    unit:        'km',
    templates: {
      rest:      (km) => ({ type:'rest',     label:'Full rest',                        intensity:0,  targetKm:0,              desc:'Recovery, stretching' }),
      recovery:  (km) => ({ type:'recovery', label:'Easy run Z1',                  intensity:15, targetKm:Math.round(km*0.15), desc:'HR <60% max, very slow, conversational pace' }),
      aerobic:   (km) => ({ type:'aerobic',  label:'Aerobic run Z2',                     intensity:50, targetKm:Math.round(km*0.22), desc:'HR 60–70%, comfortable pace' }),
      long:      (km) => ({ type:'long',     label:`Long run (~${Math.round(km*0.35)} km)`, intensity:60, targetKm:Math.round(km*0.35), desc:'30–60 s/km slower than usual' }),
      tempo:     (km) => ({ type:'tempo',    label:'Tempo Z3',                              intensity:65, targetKm:Math.round(km*0.18), desc:'20–30 min at a pace slightly faster than marathon' }),
      interval:  (km) => ({ type:'interval', label:'Intervals Z4 — 6×1 km',               intensity:85, targetKm:Math.round(km*0.15), desc:'6 reps of 1 km at race pace, 2 min pause' }),
      vo2:       (km) => ({ type:'interval', label:'VO₂max — 8×400 m Z5',                 intensity:90, targetKm:Math.round(km*0.12), desc:'8 sprints of 400 m >90% max HR' }),
      hills:     (km) => ({ type:'tempo',    label:'Hill sprints — 8×200 m',                intensity:78, targetKm:Math.round(km*0.14), desc:'Uphill sprints, recovery jog down' }),
      test:      (km) => ({ type:'test',     label:'Assessment run Z2',               intensity:35, targetKm:Math.round(km*0.15), desc:'Record pace and HR — baseline' }),
    },
  };

  // Generic fallback
  return {
    sport:       'other',
    weekFloors:  { full_restart:30, base_rebuild:40, significant:50, moderate:60, slight:70, active:80, overreached:30, too_easy:90 },
    defaultWeek: 60,
    unit:        'km',
    templates: {
      rest:      (km) => ({ type:'rest',     label:'Full rest',         intensity:0,  targetKm:0,              desc:'' }),
      recovery:  (km) => ({ type:'recovery', label:'Recovery Z1',    intensity:15, targetKm:Math.round(km*0.20), desc:'Light load' }),
      aerobic:   (km) => ({ type:'aerobic',  label:'Aerobic Z2',          intensity:50, targetKm:Math.round(km*0.40), desc:'60–70% max HR' }),
      long:      (km) => ({ type:'long',     label:'Long Z2',           intensity:60, targetKm:Math.round(km*0.60), desc:'Continuous, moderate' }),
      tempo:     (km) => ({ type:'tempo',    label:'Tempo Z3',          intensity:65, targetKm:Math.round(km*0.35), desc:'70–80% max HR' }),
      interval:  (km) => ({ type:'interval', label:'Intervals Z4',         intensity:85, targetKm:Math.round(km*0.30), desc:'80–90% max HR' }),
      vo2:       (km) => ({ type:'interval', label:'VO₂max Z5',            intensity:90, targetKm:Math.round(km*0.25), desc:'>90% max HR' }),
      hills:     (km) => ({ type:'tempo',    label:'Strength Z3–Z4',        intensity:78, targetKm:Math.round(km*0.30), desc:'Strength work' }),
      test:      (km) => ({ type:'test',     label:'Assessment ride',    intensity:35, targetKm:Math.round(km*0.25), desc:'Baseline' }),
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
    date.setDate(today.getDate() + i);          // absolute calendar date
    const dateStr = date.toISOString().slice(5, 10).replace('-', '/'); // MM/DD
    return {
      ...d,
      day:        DAY_LABELS[dayDow],
      date:       dateStr,
      dow:        dayDow,
      color:      TYPE_COLOR[d.type] ?? '#6b7280',
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