/**
 * workoutAnalyzer.js — Transforms raw FIT data into a rich WorkoutModel.
 * Includes: zone analysis (Garmin/Seiler/Coggan), assessLoad,
 * generateRecommendations, buildWorkoutModel.
 * Format utilities → format.js  |  Training plan → trainingEngine.js
 */

import { fitTsToDate, FIT_EPOCH_MS }                    from './fitParser.js';
import { fmtKm, fmtDuration, fmtDurationShort, fmtNum } from './format.js';
import { generateTrainingPlan }                          from './trainingEngine.js';

/**
 * workoutAnalyzer.js
 * Pure domain logic — transforms raw FIT message rows into a rich, typed
 * WorkoutModel. No UI, no side effects, fully unit-testable.
 *
 * FIT field numbers are from the official ANT+ FIT SDK profile.
 */


// ─── Sport / Sub-sport label maps ─────────────────────────────────────────────
const SPORT_NAMES = {
  0: 'Generic', 1: 'Running', 2: 'Cycling', 3: 'Transition',
  4: 'Fitness Equipment', 5: 'Swimming', 6: 'Basketball', 7: 'Soccer',
  8: 'Tennis', 9: 'American Football', 10: 'Training', 11: 'Walking',
  12: 'Cross Country Skiing', 13: 'Alpine Skiing', 14: 'Snowboarding',
  15: 'Rowing', 16: 'Mountaineering', 17: 'Hiking', 18: 'Multisport',
  19: 'Paddling', 20: 'Flying', 21: 'E-Biking', 22: 'Motorcycling',
  23: 'Boating', 24: 'Driving', 25: 'Golf', 26: 'Hang Gliding',
  27: 'Horseback Riding', 28: 'Hunting', 29: 'Fishing', 30: 'Inline Skating',
  31: 'Rock Climbing', 32: 'Sailing', 33: 'Ice Skating', 34: 'Sky Diving',
  35: 'Snowshoeing', 36: 'Snowmobiling', 37: 'Stand Up Paddleboarding',
  38: 'Surfing', 39: 'Wakeboarding', 40: 'Water Skiing', 41: 'Kayaking',
  42: 'Rafting', 43: 'Windsurfing', 44: 'Kitesurfing', 45: 'Tactical',
  46: 'Jumpmaster', 47: 'Boxing', 48: 'Floor Climbing',
};

const SUB_SPORT_NAMES = {
  0: '', 1: 'Treadmill', 2: 'Street', 3: 'Trail', 4: 'Track',
  5: 'Spin', 6: 'Indoor Cycling', 7: 'Road', 8: 'Mountain', 9: 'Downhill',
  10: 'Recumbent', 11: 'Cyclocross', 12: 'Hand Cycling', 13: 'Track Cycling',
  14: 'Indoor Rowing', 15: 'Elliptical', 16: 'Stair Climbing',
  17: 'Lap Swimming', 18: 'Open Water',
};

// ─── HR Zone definitions (% of max HR) ──────────────────────────────────────
export const HR_ZONE_DEFS = [
  { id: 'z1', name: 'Recovery',  pctLo: 0.50, pctHi: 0.60, color: '#4ade80', label: '50–60%'  },
  { id: 'z2', name: 'Aerobic',   pctLo: 0.60, pctHi: 0.70, color: '#a3e635', label: '60–70%'  },
  { id: 'z3', name: 'Tempo',     pctLo: 0.70, pctHi: 0.80, color: '#fbbf24', label: '70–80%'  },
  { id: 'z4', name: 'Threshold', pctLo: 0.80, pctHi: 0.90, color: '#f97316', label: '80–90%'  },
  { id: 'z5', name: 'Max VO₂',   pctLo: 0.90, pctHi: 1.01, color: '#ef4444', label: '90–100%' },
];

// ─── Session field decode ─────────────────────────────────────────────────────
// Each entry: [fieldNum, outputKey, scale, offset]
export const SESSION_FIELDS = [
  [2,   'startTimestamp', 1,      0],
  [5,   'sport',          1,      0],
  [6,   'subSport',       1,      0],
  [7,   'totalElapsed',   0.001,  0],   // → seconds
  [8,   'totalTimer',     0.001,  0],   // → seconds (paused time excluded)
  [9,   'totalDistance',  0.01,   0],   // → meters (actually /100 cm)
  [11,  'calories',       1,      0],
  [16,  'avgHr',          1,      0],
  [17,  'maxHr',          1,      0],
  [18,  'avgCadence',     1,      0],
  [19,  'maxCadence',     1,      0],
  [20,  'avgPower',       1,      0],
  [21,  'maxPower',       1,      0],
  [22,  'totalAscent',    1,      0],   // meters
  [23,  'totalDescent',   1,      0],   // meters
  [24,  'aerobicTE',      0.1,    0],
  [57,  'avgTemp',        1,      0],
  [58,  'maxTemp',        1,      0],
  [110, 'bikeName',       1,      0],
  [124, 'enhAvgSpeed',    0.001,  0],   // → m/s
  [125, 'enhMaxSpeed',    0.001,  0],   // → m/s
  [126, 'enhAvgAlt',      0.05,  -500], // → meters
  [127, 'enhMinAlt',      0.05,  -500],
  [128, 'enhMaxAlt',      0.05,  -500],
  [137, 'anaerobicTE',    0.1,    0],
  // Fallback speed fields (older devices / no enhanced)
  [14,  'avgSpeed',       0.001,  0],   // → m/s (fallback if enhAvgSpeed missing)
  [15,  'maxSpeed',       0.001,  0],   // → m/s
];

// ─── Record field decode ──────────────────────────────────────────────────────
export const RECORD_FIELDS = [
  [0,   'lat',        1 / 11930465, 0],    // semicircles → degrees
  [1,   'lon',        1 / 11930465, 0],
  [3,   'hr',         1,            0],
  [4,   'cadence',    1,            0],
  [5,   'distance',   0.01,         0],    // cm → m
  [13,  'temp',       1,            0],
  [6,   'speedStd',   0.001,        0],    // standard speed (uint16, fallback)
  [73,  'speed',      0.001,        0],    // enhanced speed (uint32, preferred)
  [2,   'altitudeStd',0.2,        -500],   // standard altitude (fallback)
  [78,  'altitude',   0.05,       -500],   // enhanced altitude (preferred)
  [253, 'timestamp',  1,            0],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const safe = (v, scale = 1, offset = 0) =>
  v !== null && v !== undefined ? v * scale + offset : null;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── Decode a raw session row ─────────────────────────────────────────────────
export function decodeSession(raw) {
  const out = {};
  for (const [num, key, scale, offset] of SESSION_FIELDS) {
    const v = raw[num];
    if (v === null || v === undefined) continue;
    out[key] = typeof v === 'string' ? v : safe(v, scale, offset);
  }
  return out;
}

// ─── Decode a raw record row → time-series point ──────────────────────────────
export function decodeRecord(raw) {
  const pt = {};
  for (const [num, key, scale, offset] of RECORD_FIELDS) {
    const v = raw[num];
    if (v === null || v === undefined) continue;
    pt[key] = safe(v, scale, offset);
  }
  // Prefer enhanced fields; fall back to standard when enhanced is missing
  if (pt.speed   == null && pt.speedStd   != null) pt.speed   = pt.speedStd;
  if (pt.altitude == null && pt.altitudeStd != null) pt.altitude = pt.altitudeStd;
  delete pt.speedStd;
  delete pt.altitudeStd;
  return pt;
}

// ─── HR Zone analysis ─────────────────────────────────────────────────────────
// Uses timestamp-delta weighting: each record contributes the time until the
// NEXT record, not just 1 second. Correctly handles variable recording intervals
// (Garmin Smart Recording saves every 2-30s depending on activity stability).
// Gaps > 10s (stops, pauses) are capped to avoid inflating zone totals.
export const MAX_GAP_S = 10;

export function analyzeHrZones(timeSeries, maxHr) {
  if (!maxHr || maxHr <= 0) return [];

  // Filter to points that have both hr and timestamp, sorted by time
  const pts = timeSeries
    .filter(p => p.hr && p.hr > 0 && p.hr < 255 && p.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!pts.length) return [];

  const zoneSecs = new Array(HR_ZONE_DEFS.length).fill(0);

  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    // dt = duration this HR reading was held
    const dt = i < pts.length - 1
      ? Math.min(pts[i + 1].timestamp - pt.timestamp, MAX_GAP_S)
      : 1;

    const pct  = pt.hr / maxHr;
    const zIdx = HR_ZONE_DEFS.findIndex(z => pct >= z.pctLo && pct < z.pctHi);
    if (zIdx >= 0) zoneSecs[zIdx] += dt;
  }

  const total = zoneSecs.reduce((a, b) => a + b, 0) || 1;

  return HR_ZONE_DEFS.map((z, i) => ({
    ...z,
    seconds:  Math.round(zoneSecs[i]),
    minutes:  Math.round(zoneSecs[i] / 60),
    pct:      parseFloat(((zoneSecs[i] / total) * 100).toFixed(1)),
    hrLo:     Math.round(z.pctLo * maxHr),
    hrHi:     Math.round(z.pctHi * maxHr),
  }));
}

// ─── Multi-model zone analysis ───────────────────────────────────────────────
// Builds three parallel zone models from the same timeSeries.
// Each model returns { model, zones[], totalSecs, pctAbove, pctBelow }

export const ZONE_MODELS = {
  // ① Garmin 5-zone %maxHR (what Garmin Connect shows)
  garmin5: (maxHr) => [
    { id:'z1', name:'Recovery',  color:'#4ade80', lo: Math.round(0.50*maxHr), hi: Math.round(0.60*maxHr) },
    { id:'z2', name:'Aerobic',   color:'#a3e635', lo: Math.round(0.60*maxHr), hi: Math.round(0.70*maxHr) },
    { id:'z3', name:'Tempo',     color:'#fbbf24', lo: Math.round(0.70*maxHr), hi: Math.round(0.80*maxHr) },
    { id:'z4', name:'Threshold', color:'#f97316', lo: Math.round(0.80*maxHr), hi: Math.round(0.90*maxHr) },
    { id:'z5', name:'Max VO₂',   color:'#ef4444', lo: Math.round(0.90*maxHr), hi: maxHr + 1             },
  ],
  // ② Seiler 3-zone polarised (gold standard for endurance science)
  // Z1 < VT1 ≈ 80% LT2, Z2 = VT1→LT2, Z3 > LT2
  seiler3: (lt2) => [
    { id:'z1', name:'Аэробная (низкая)',  color:'#4ade80', lo: 0,                      hi: Math.round(0.80*lt2) },
    { id:'z2', name:'Смешанная (средняя)',color:'#fbbf24', lo: Math.round(0.80*lt2),   hi: lt2 + 1             },
    { id:'z3', name:'Анаэробная (высокая)',color:'#ef4444',lo: lt2 + 1,                hi: 999                 },
  ],
  // ③ Coggan 7-zone power-based adapted to HR (uses LT2 as FTP proxy)
  coggan7: (lt2) => [
    { id:'z1', name:'Восстановление',    color:'#60a5fa', lo: 0,                      hi: Math.round(0.68*lt2) },
    { id:'z2', name:'Выносливость',      color:'#4ade80', lo: Math.round(0.68*lt2),   hi: Math.round(0.83*lt2) },
    { id:'z3', name:'Темп',              color:'#a3e635', lo: Math.round(0.83*lt2),   hi: Math.round(0.94*lt2) },
    { id:'z4', name:'Лактатный порог',   color:'#fbbf24', lo: Math.round(0.94*lt2),   hi: Math.round(1.05*lt2) },
    { id:'z5', name:'VO₂ Max',           color:'#f97316', lo: Math.round(1.05*lt2),   hi: Math.round(1.19*lt2) },
    { id:'z6', name:'Анаэробная',        color:'#ef4444', lo: Math.round(1.19*lt2),   hi: Math.round(1.50*lt2) },
    { id:'z7', name:'Нейромышечная',     color:'#a855f7', lo: Math.round(1.50*lt2),   hi: 999                 },
  ],
};

export function computeZoneTimes(timeSeries, zoneDefs) {
  const secs = zoneDefs.map(() => 0);
  const pts  = timeSeries
    .filter(p => p.hr && p.hr > 0 && p.hr < 255 && p.timestamp)
    .sort((a,b) => a.timestamp - b.timestamp);

  for (let i = 0; i < pts.length; i++) {
    const hr = pts[i].hr;
    const dt = i < pts.length - 1
      ? Math.min(pts[i+1].timestamp - pts[i].timestamp, MAX_GAP_S)
      : 1;
    const zi = zoneDefs.findIndex(z => hr >= z.lo && hr < z.hi);
    if (zi >= 0) secs[zi] += dt;
  }
  return secs;
}

export function buildMultiZones(timeSeries, maxHr, lt2) {
  const models = {
    garmin5: ZONE_MODELS.garmin5(maxHr),
    seiler3: ZONE_MODELS.seiler3(lt2),
    coggan7: ZONE_MODELS.coggan7(lt2),
  };
  const result = {};
  for (const [key, defs] of Object.entries(models)) {
    const secs  = computeZoneTimes(timeSeries, defs);
    const total = secs.reduce((a,b) => a+b, 0) || 1;
    result[key] = defs.map((z, i) => ({
      ...z,
      seconds: Math.round(secs[i]),
      minutes: Math.round(secs[i] / 60),
      pct:     parseFloat((secs[i] / total * 100).toFixed(1)),
    }));
  }
  return result;
}



// ─── Derived metrics ─────────────────────────────────────────────────────────
export function computeDerived(timeSeries, session) {
  const validHr    = timeSeries.map(p => p.hr).filter(Boolean);
  const validSpeed = timeSeries.map(p => p.speed).filter(v => v != null && v > 0.1); // >0.36 km/h
  const validAlt   = timeSeries.map(p => p.altitude).filter(v => v != null);
  const validCad   = timeSeries.map(p => p.cadence).filter(Boolean);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    minHr:        validHr.length   ? validHr.reduce((a,b) => a<b?a:b)  : 0,
    avgMovingSpd: validSpeed.length ? avg(validSpeed) * 3.6 : 0,   // m/s → km/h
    minAlt:       validAlt.length   ? validAlt.reduce((a,b) => a<b?a:b) : 0,
    maxAlt:       validAlt.length   ? validAlt.reduce((a,b) => a>b?a:b) : 0,
    avgCadence:   validCad.length   ? Math.round(avg(validCad)) : (session.avgCadence || 0),
  };
}

// ─── Training load assessment ─────────────────────────────────────────────────
export function assessLoad(workout) {
  const { hrZones, trainingEffect, duration } = workout;
  if (!hrZones?.length) return { level: 'unknown', label: 'Unknown' };

  const aeroTE = trainingEffect?.aerobic ?? 0;
  const hiZonePct = (hrZones[3]?.pct ?? 0) + (hrZones[4]?.pct ?? 0);
  const activeHours = (duration?.active ?? 0) / 3600;

  if (aeroTE >= 4.5 || hiZonePct > 30 || activeHours > 3) {
    return { level: 'high', label: 'Высокая нагрузка', color: '#ef4444', recoveryDays: 2 };
  }
  if (aeroTE >= 3.0 || hiZonePct > 15 || activeHours > 1.5) {
    return { level: 'medium', label: 'Средняя нагрузка', color: '#f97316', recoveryDays: 1 };
  }
  return { level: 'low', label: 'Лёгкая нагрузка', color: '#4ade80', recoveryDays: 0 };
}

// ─── Generate training recommendations ───────────────────────────────────────
export function generateRecommendations(workout) {
  const { hrZones, trainingEffect, duration, speed, elevation, heartRate } = workout;
  const recs = [];

  const aeroTE    = trainingEffect?.aerobic  ?? 0;
  const anaTE     = trainingEffect?.anaerobic ?? 0;
  const z1z2pct   = (hrZones?.[0]?.pct ?? 0) + (hrZones?.[1]?.pct ?? 0);
  const z5pct     = hrZones?.[4]?.pct ?? 0;
  const activeMin = (duration?.active ?? 0) / 60;
  const totalMin  = (duration?.total  ?? 0) / 60;
  const pauseMin  = totalMin - activeMin;

  if (z5pct > 10) recs.push({
    type: 'warning',
    icon: '⚠️',
    title: 'Высокое время в Z5',
    text: `${z5pct.toFixed(0)}% времени в максимальной зоне — риск перетренировки. Следующие 2 дня держите ЧСС ниже ${Math.round((heartRate?.max ?? 180) * 0.7)} уд/мин.`,
  });

  if (z1z2pct < 40) recs.push({
    type: 'info',
    icon: '📊',
    title: 'Дисбаланс зон',
    text: `Только ${z1z2pct.toFixed(0)}% в Z1–Z2. Целевое соотношение: 80/20 (поляризованная модель). Запланируйте длинную аэробную тренировку строго в Z2.`,
  });

  if (aeroTE >= 4.0) recs.push({
    type: 'success',
    icon: '🔁',
    title: 'Качественное восстановление',
    text: `ТЭ ${aeroTE.toFixed(1)}/5 — значительный аэробный стресс. Минимум ${assessLoad(workout).recoveryDays} дня восстановления с лёгким вращением ≤130 уд/мин.`,
  });

  if (pauseMin > 20) recs.push({
    type: 'info',
    icon: '⏱️',
    title: 'Большие паузы',
    text: `${Math.round(pauseMin)} мин остановок. Для повышения выносливости сократите паузы — непрерывная работа эффективнее для адаптации.`,
  });

  if (elevation?.ascent > 300) recs.push({
    type: 'success',
    icon: '🏔️',
    title: 'Горная работа',
    text: `Набор ${elevation.ascent} м — отличная работа для силовой выносливости. Продолжайте включать холмы, чередуя интенсивность.`,
  });

  if (anaTE >= 2.5) recs.push({
    type: 'warning',
    icon: '⚡',
    title: 'Анаэробная нагрузка',
    text: `Анаэробный ТЭ ${anaTE.toFixed(1)}/5. Эту неделю откажитесь от спринтов и интервалов — восстановите скоростную выносливость.`,
  });

  return recs.length ? recs : [{
    type: 'success', icon: '✅', title: 'Тренировка в норме',
    text: 'Показатели в пределах нормы. Придерживайтесь текущего плана.',
  }];
}

// ─── Main export: build complete WorkoutModel ────────────────────────────────
export function buildWorkoutModel(fitData, fileName = '') {
  const { sessions, laps, records, sports } = fitData;
  const rawSession = sessions[0];
  const sess = decodeSession(rawSession);

  // Timestamps
  const startDate = fitTsToDate(sess.startTimestamp);

  // Sport name
  const sportId    = rawSession[5] ?? 0;
  const subSportId = rawSession[6] ?? 0;
  const sportName  = SPORT_NAMES[sportId]    ?? 'Activity';
  const subSport   = SUB_SPORT_NAMES[subSportId] ?? '';

  // Time series — decode all records
  const timeSeries = records.map(decodeRecord).filter(p => p.timestamp);

  // Sort by timestamp
  timeSeries.sort((a, b) => a.timestamp - b.timestamp);

  // Add distance-in-km for charting convenience
  for (const pt of timeSeries) {
    if (pt.distance != null) pt.distKm = parseFloat((pt.distance / 1000).toFixed(3));
    if (pt.speed    != null) pt.speedKmh = parseFloat((pt.speed * 3.6).toFixed(2));
  }

  // maxHr priority: zones_target profile HR > hr_zone boundaries > session peak > computed from records
  const profileMaxHr  = fitData.zonesTarget?.[1] ?? 0;
  const thresholdHr   = fitData.zonesTarget?.[2] ?? 0;  // LT2 / lactate threshold
  // hr_zone messages (mesg 8) contain zone boundaries; the highest high_bpm (field 1) = athlete's max HR
  const hrZoneBpms    = (fitData.hrZones || []).map(z => z[1]).filter(v => v && v > 0 && v < 255);
  const hrZoneMaxHr   = hrZoneBpms.length ? Math.max(...hrZoneBpms) : 0;
  const validHr       = timeSeries.map(p => p.hr).filter(Boolean);
  const computedMaxHr = validHr.length ? validHr.reduce((a,b) => a>b?a:b) : 0;
  const maxHr = profileMaxHr || hrZoneMaxHr || sess.maxHr || computedMaxHr;

  // HR Zone analysis
  const hrZones = analyzeHrZones(timeSeries, maxHr);

  // Derived metrics
  const derived = computeDerived(timeSeries, sess);

  // Speed km/h conversions
  // Speed: prefer enhanced fields (f124/f125), fall back to basic (f14/f15)
  const rawAvgSpd = sess.enhAvgSpeed ?? sess.avgSpeed ?? null;
  const rawMaxSpd = sess.enhMaxSpeed ?? sess.maxSpeed ?? null;
  const avgSpeedKmh = rawAvgSpd != null ? parseFloat((rawAvgSpd * 3.6).toFixed(2)) : 0;
  const maxSpeedKmh = rawMaxSpd != null ? parseFloat((rawMaxSpd * 3.6).toFixed(2)) : 0;

  const workout = {
    // Meta
    fileName,
    date:      startDate ? startDate.toISOString().slice(0, 10) : '—',
    startTime: startDate ? startDate.toTimeString().slice(0, 5)  : '—',
    startDate,
    sport:     sportName,
    subSport,
    sportLabel: [sportName, subSport].filter(Boolean).join(' · '),
    bike: sess.bikeName || '',

    // Duration (seconds)
    duration: {
      total:  Math.round(sess.totalElapsed ?? 0),
      active: Math.round(sess.totalTimer   ?? 0),
      pause:  Math.round((sess.totalElapsed ?? 0) - (sess.totalTimer ?? 0)),
    },

    // Distance (meters)
    distance: sess.totalDistance ?? 0,

    // Calories
    calories: sess.calories ?? 0,

    // Heart rate (bpm)
    heartRate: {
      avg: sess.avgHr     ?? 0,
      max: maxHr,
      min: derived.minHr,
    },

    // Speed (km/h)
    speed: {
      avg:       avgSpeedKmh,
      max:       maxSpeedKmh,
      avgMoving: parseFloat(derived.avgMovingSpd.toFixed(2)),
    },

    // Elevation (meters)
    elevation: {
      ascent:  sess.totalAscent  ?? 0,
      descent: sess.totalDescent ?? 0,
      min:     derived.minAlt,
      max:     derived.maxAlt,
      avgEnhanced: sess.enhAvgAlt,
    },

    // Cadence (rpm / spm)
    cadence: {
      avg: sess.avgCadence  ?? derived.avgCadence,
      max: sess.maxCadence  ?? 0,
    },

    // Power (watts) — if available (cycling with power meter)
    power: sess.avgPower && sess.avgPower < 65535 ? {
      avg: sess.avgPower,
      max: sess.maxPower ?? 0,
    } : null,

    // Temperature
    temperature: sess.avgTemp && sess.avgTemp !== 127 ? {
      avg: sess.avgTemp,
      max: sess.maxTemp,
    } : null,

    // Training effect (Garmin-specific)
    trainingEffect: {
      aerobic:   parseFloat((sess.aerobicTE  ?? 0).toFixed(1)),
      anaerobic: parseFloat((sess.anaerobicTE ?? 0).toFixed(1)),
    },

    // HR zones
    hrZones,
    thresholdHr,                              // LT2 from zones_target (0 if unknown)
    multiZones: buildMultiZones(timeSeries, maxHr, thresholdHr || maxHr * 0.88),

    // Time series for charting
    timeSeries,

    // Laps
    lapCount: laps.length,
  };

  // Attach derived analysis
  workout.load            = assessLoad(workout);
  workout.recommendations = generateRecommendations(workout);
  workout.trainingPlan    = generateTrainingPlan(workout, []);

  return workout;
}


// ────────────────────────────────────────────────────────────
