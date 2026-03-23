/**
 * sampleWorkout.js — Demo WorkoutModel (2025-09-07, road cycling, 50km).
 */

import { HR_ZONE_DEFS, buildMultiZones } from './workoutAnalyzer.js';
import { generateTrainingPlan }          from './trainingEngine.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * sampleWorkout.js
 * Pre-built WorkoutModel matching the uploaded 20310330371_ACTIVITY.fit
 * Used as default / demo when no file is loaded.
 */


// Synthetic time series (120 data points, ~3.5h compressed)
function buildTimeSeries() {
  const n           = 140;
  const TARGET_DIST = 50460;  // meters — must match SAMPLE_WORKOUT.distance
  const TARGET_DUR  = 7674;   // seconds active — 140 points × ~54.8s each
  const dt          = TARGET_DUR / n;  // seconds per point

  const pts = [];
  let hr = 82, spd = 4.5, alt = 30, dist = 0;
  const baseTs = 1125830009;

  // First pass: accumulate raw distances
  const rawDists = [];
  let rawSpd = 4.5;
  for (let i = 0; i < n; i++) {
    const p  = i / n;
    const ph = Math.min(Math.floor(p * 5), 4);
    rawSpd += ([5.2, 7.1, 6.4, 7.2, 5.8][ph] - rawSpd) * 0.05;
    if (i > 120) rawSpd = Math.max(0, rawSpd - 0.4);
    rawDists.push(Math.max(0, rawSpd) * dt);
  }
  const rawTotal = rawDists.reduce((a, b) => a + b, 0);
  const scale    = TARGET_DIST / rawTotal;  // normalise to exact 50.46 km

  for (let i = 0; i < n; i++) {
    const p   = i / n;
    const ph  = Math.min(Math.floor(p * 5), 4);
    const tHr  = [95, 142, 155, 148, 125][ph];
    const tSpd = [5.2, 7.1, 6.4, 7.2, 5.8][ph];

    hr  += (tHr  - hr)  * 0.07 + (Math.random() - 0.5) * 3.5;
    spd += (tSpd - spd) * 0.05 + (Math.random() - 0.5) * 0.6;
    if (i > 120) { spd = Math.max(0, spd - 0.4); hr = Math.max(82, hr - 0.8); }

    alt   = 32 + Math.sin(p * Math.PI * 4) * 18 + Math.sin(p * Math.PI * 9) * 6
              + (Math.random() - 0.5) * 2;
    dist += rawDists[i] * scale;  // scaled so total === TARGET_DIST

    pts.push({
      timestamp: baseTs + Math.round(i * dt),
      hr:        Math.round(clamp(hr, 78, 177)),
      speed:     parseFloat((Math.max(0, spd)).toFixed(3)),
      speedKmh:  parseFloat((Math.max(0, spd) * 3.6).toFixed(2)),
      altitude:  parseFloat(alt.toFixed(1)),
      distance:  parseFloat(dist.toFixed(1)),
      distKm:    parseFloat((dist / 1000).toFixed(3)),
      cadence:   i > 5 && i < 130 ? Math.round(85 + (Math.random() - 0.5) * 14) : null,
    });
  }
  return pts;
}


const _sampleTimeSeries = buildTimeSeries();
const _sampleMaxHr = 177;

const _sampleHrZones = [
  { ...HR_ZONE_DEFS[0], seconds:  774, minutes: 13, pct:  9.7, hrLo:   0, hrHi: 106 },
  { ...HR_ZONE_DEFS[1], seconds: 1332, minutes: 22, pct: 16.7, hrLo: 106, hrHi: 124 },
  { ...HR_ZONE_DEFS[2], seconds: 2352, minutes: 39, pct: 29.5, hrLo: 124, hrHi: 142 },
  { ...HR_ZONE_DEFS[3], seconds: 2400, minutes: 40, pct: 30.1, hrLo: 142, hrHi: 159 },
  { ...HR_ZONE_DEFS[4], seconds: 1116, minutes: 19, pct: 14.0, hrLo: 159, hrHi: 177 },
];

export const SAMPLE_WORKOUT = {
  fileName:    '20310330371_ACTIVITY.fit',
  date:        '2025-09-07',
  startTime:   '10:13',
  startDate:   new Date('2025-09-07T10:13:29Z'),
  sport:       'Cycling',
  subSport:    'Road',
  sportLabel:  'Cycling · Road',
  bike:        'Road Bike',

  duration: { total: 12753, active: 7747, pause: 5006 },
  distance:  50460,
  calories:  1195,

  heartRate: { avg: 137, max: 177, min: 78 },

  speed: { avg: 23.45, max: 59.49, avgMoving: 24.1 },

  elevation: { ascent: 469, descent: 458, min: -330, max: -280, avgEnhanced: null },

  cadence:     { avg: 82, max: 105 },
  power:        null,
  temperature:  null,

  trainingEffect: { aerobic: 4.5, anaerobic: 3.0 },

  hrZones: _sampleHrZones,
  timeSeries: _sampleTimeSeries,
  lapCount: 1,

  load: { level: 'high', label: 'Высокая нагрузка', color: '#ef4444', recoveryDays: 2 },

  recommendations: [
    { type: 'warning', icon: '⚠️', title: 'Высокое время в Z5',
      text: '14.9% в максимальной зоне — риск перетренировки. Следующие 2 дня держите ЧСС ниже 124 уд/мин.' },
    { type: 'info',    icon: '📊', title: 'Дисбаланс зон',
      text: 'Только 26.4% в Z1–Z2. Цель — 80/20 поляризованная модель. Запланируйте длинную строго в Z2.' },
    { type: 'success', icon: '🔁', title: 'Качественное восстановление',
      text: 'ТЭ 4.5/5 — значительный аэробный стресс. Минимум 2 дня восстановления, лёгкое вращение ≤130 уд/мин.' },
    { type: 'info',    icon: '⏱️', title: 'Большие паузы',
      text: '83 мин остановок. Для повышения выносливости сокращайте паузы — непрерывная работа эффективнее.' },
    { type: 'success', icon: '🏔️', title: 'Горная работа',
      text: 'Набор 469 м — отличная силовая выносливость. Продолжайте включать холмы, чередуя интенсивность.' },
  ],

  multiZones:    buildMultiZones(
    _sampleTimeSeries,
    184,   // profileMaxHr from zones_target
    166,   // thresholdHr from zones_target
  ),
  thresholdHr:   166,
  trainingPlan: generateTrainingPlan({ sport: 'Cycling', load: { level: 'high' }, startDate: new Date('2025-09-07T10:13:29Z') }, []),
};


// ────────────────────────────────────────────────────────────