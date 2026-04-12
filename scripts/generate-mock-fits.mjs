#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const FIT_EPOCH_UNIX = 631065600; // 1989-12-31

function crc16(bytes) {
  const table = new Uint16Array(16);
  for (let i = 0; i < 16; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (c >>> 1) ^ 0xB2C0 : c >>> 1;
    table[i] = c;
  }

  let crc = 0;
  for (const b of bytes) {
    let tmp = table[(crc ^ b) & 0x0F];
    crc = tmp ^ (crc >>> 4);
    tmp = table[(crc ^ (b >>> 4)) & 0x0F];
    crc = tmp ^ (crc >>> 4);
  }
  return crc;
}

function u8(v) { return [v & 0xFF]; }
function u16(v) { return [v & 0xFF, (v >> 8) & 0xFF]; }
function u32(v) { return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]; }

function defMsg(localNum, globalMesgNum, fields) {
  return [
    0x40 | localNum,
    0x00,
    0x00,
    ...u16(globalMesgNum),
    fields.length,
    ...fields.flat(),
  ];
}

function toFitTs(unixMs) {
  return Math.floor(unixMs / 1000) - FIT_EPOCH_UNIX;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function buildSeries(spec) {
  const dt = spec.sampleSec;
  const count = Math.floor(spec.durationSec / dt) + 1;

  const hrSeries = [];
  const speedSeries = [];

  for (let i = 0; i < count; i += 1) {
    const t = i * dt;
    const ratio = t / spec.durationSec;

    const hrBase = spec.hrCurve(ratio);
    const hrNoise = Math.sin(i * 0.37) * spec.hrNoise;
    hrSeries.push(Math.round(clamp(hrBase + hrNoise, 85, 197)));

    const spdBase = spec.speedCurve(ratio);
    const spdNoise = Math.sin(i * 0.19) * spec.speedNoise;
    speedSeries.push(clamp(spdBase + spdNoise, 1.8, 16));
  }

  return { hrSeries, speedSeries, dt, count };
}

function average(arr) {
  return arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
}

function max(arr) {
  return arr.reduce((m, v) => (v > m ? v : m), arr[0] ?? 0);
}

function createActivityFit(spec) {
  const { hrSeries, speedSeries, dt, count } = buildSeries(spec);
  const fitStartTs = toFitTs(spec.startMs);

  let distM = 0;
  let altM = spec.altitudeStart;
  let totalAscent = 0;
  let totalDescent = 0;

  const records = [];
  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      const speed = speedSeries[i - 1];
      distM += speed * dt;

      const altNext = spec.altitudeStart + Math.sin(i * 0.08) * spec.altitudeAmplitude;
      const dAlt = altNext - altM;
      if (dAlt > 0) totalAscent += dAlt;
      else totalDescent += Math.abs(dAlt);
      altM = altNext;
    }

    const timestamp = fitStartTs + i * dt;
    const hr = hrSeries[i];
    const cadence = clamp(Math.round(spec.cadenceBase + Math.sin(i * 0.21) * spec.cadenceNoise), 55, 122);
    const speed = speedSeries[i];

    records.push({
      timestamp,
      distanceCm: Math.round(distM * 100),
      hr,
      cadence,
      speedRaw: Math.round(speed * 1000),
      altitudeRaw: Math.round((altM + 500) / 0.2),
    });
  }

  const avgHr = Math.round(average(hrSeries));
  const maxHr = Math.round(max(hrSeries));
  const avgCadence = Math.round(average(records.map(r => r.cadence)));
  const maxCadence = Math.round(max(records.map(r => r.cadence)));
  const avgSpeedRaw = Math.round(average(records.map(r => r.speedRaw)));
  const maxSpeedRaw = Math.round(max(records.map(r => r.speedRaw)));

  const elapsedMs = spec.durationSec * 1000;
  const timerMs = elapsedMs;
  const totalDistanceCm = Math.round(distM * 100);

  const data = [];

  // local 0: file_id (global 0)
  data.push(...defMsg(0, 0, [
    [0, 1, 0x00],  // type (enum): 4=activity
    [1, 2, 0x84],  // manufacturer
    [2, 2, 0x84],  // product
    [4, 4, 0x86],  // time_created
  ]));
  data.push(0x00, ...u8(4), ...u16(1), ...u16(1), ...u32(fitStartTs));

  // local 1: sport (global 12)
  data.push(...defMsg(1, 12, [
    [0, 1, 0x00], // sport
    [1, 1, 0x00], // sub_sport
  ]));
  data.push(0x01, ...u8(spec.sport), ...u8(spec.subSport));

  // local 2: record (global 20)
  data.push(...defMsg(2, 20, [
    [253, 4, 0x86], // timestamp
    [5,   4, 0x86], // distance
    [3,   1, 0x02], // heart_rate
    [4,   1, 0x02], // cadence
    [6,   2, 0x84], // speed (standard)
    [2,   2, 0x84], // altitude (standard)
  ]));

  for (const r of records) {
    data.push(
      0x02,
      ...u32(r.timestamp),
      ...u32(r.distanceCm),
      ...u8(r.hr),
      ...u8(r.cadence),
      ...u16(r.speedRaw),
      ...u16(r.altitudeRaw),
    );
  }

  // local 3: session (global 18)
  data.push(...defMsg(3, 18, [
    [2,   4, 0x86], // start_time
    [5,   1, 0x00], // sport
    [6,   1, 0x00], // sub_sport
    [7,   4, 0x86], // total_elapsed_time (ms)
    [8,   4, 0x86], // total_timer_time (ms)
    [9,   4, 0x86], // total_distance (cm)
    [11,  2, 0x84], // total_calories
    [16,  1, 0x02], // avg_hr
    [17,  1, 0x02], // max_hr
    [18,  1, 0x02], // avg_cadence
    [19,  1, 0x02], // max_cadence
    [22,  2, 0x84], // total_ascent
    [23,  2, 0x84], // total_descent
    [24,  1, 0x02], // total_training_effect (x10)
    [137, 1, 0x02], // total_anaerobic_training_effect (x10)
    [14,  2, 0x84], // avg_speed
    [15,  2, 0x84], // max_speed
  ]));

  data.push(
    0x03,
    ...u32(fitStartTs),
    ...u8(spec.sport),
    ...u8(spec.subSport),
    ...u32(elapsedMs),
    ...u32(timerMs),
    ...u32(totalDistanceCm),
    ...u16(spec.calories),
    ...u8(avgHr),
    ...u8(maxHr),
    ...u8(avgCadence),
    ...u8(maxCadence),
    ...u16(Math.round(totalAscent)),
    ...u16(Math.round(totalDescent)),
    ...u8(Math.round(spec.aerobicTE * 10)),
    ...u8(Math.round(spec.anaerobicTE * 10)),
    ...u16(avgSpeedRaw),
    ...u16(maxSpeedRaw),
  );

  const dataBytes = Uint8Array.from(data);

  const header = new Uint8Array(14);
  header[0] = 14;
  header[1] = 0x10;
  header[2] = 0x0B;
  header[3] = 0x08;

  const dataSize = dataBytes.length;
  header[4] = dataSize & 0xFF;
  header[5] = (dataSize >> 8) & 0xFF;
  header[6] = (dataSize >> 16) & 0xFF;
  header[7] = (dataSize >> 24) & 0xFF;

  header[8] = 0x2E; // .FIT
  header[9] = 0x46;
  header[10] = 0x49;
  header[11] = 0x54;

  const headerCrc = crc16(header.slice(0, 12));
  header[12] = headerCrc & 0xFF;
  header[13] = (headerCrc >> 8) & 0xFF;

  const combined = new Uint8Array(header.length + dataBytes.length);
  combined.set(header);
  combined.set(dataBytes, header.length);

  const fileCrc = crc16(combined);
  const finalFile = new Uint8Array(combined.length + 2);
  finalFile.set(combined);
  finalFile[combined.length] = fileCrc & 0xFF;
  finalFile[combined.length + 1] = (fileCrc >> 8) & 0xFF;

  return finalFile;
}

const now = Date.now();
const oneDay = 24 * 60 * 60 * 1000;

const presets = [
  {
    fileName: 'mock_base.fit',
    label: 'base',
    startMs: now - oneDay * 6,
    durationSec: 75 * 60,
    sampleSec: 5,
    sport: 2,
    subSport: 7,
    calories: 760,
    aerobicTE: 2.2,
    anaerobicTE: 0.4,
    altitudeStart: 220,
    altitudeAmplitude: 10,
    cadenceBase: 82,
    cadenceNoise: 4,
    hrNoise: 3,
    speedNoise: 0.25,
    hrCurve: (r) => {
      if (r < 0.12) return 112 + r * 110;
      if (r < 0.88) return 130 + Math.sin(r * 10) * 4;
      return 128 - (r - 0.88) * 60;
    },
    speedCurve: (r) => {
      if (r < 0.1) return 5.8 + r * 4;
      if (r < 0.9) return 8.2 + Math.sin(r * 8) * 0.35;
      return 7.6 - (r - 0.9) * 6;
    },
  },
  {
    fileName: 'mock_aerobic.fit',
    label: 'aerobic',
    startMs: now - oneDay * 4,
    durationSec: 62 * 60,
    sampleSec: 5,
    sport: 2,
    subSport: 7,
    calories: 820,
    aerobicTE: 3.8,
    anaerobicTE: 1.2,
    altitudeStart: 210,
    altitudeAmplitude: 18,
    cadenceBase: 86,
    cadenceNoise: 6,
    hrNoise: 4,
    speedNoise: 0.4,
    hrCurve: (r) => {
      if (r < 0.15) return 120 + r * 180;
      if (r < 0.85) return 152 + Math.sin(r * 22) * 8;
      return 150 - (r - 0.85) * 120;
    },
    speedCurve: (r) => {
      if (r < 0.15) return 6.2 + r * 6;
      if (r < 0.85) return 9.0 + Math.sin(r * 18) * 1.2;
      return 8.4 - (r - 0.85) * 7;
    },
  },
  {
    fileName: 'mock_anaerobic.fit',
    label: 'anaerobic',
    startMs: now - oneDay * 2,
    durationSec: 52 * 60,
    sampleSec: 5,
    sport: 2,
    subSport: 7,
    calories: 900,
    aerobicTE: 3.4,
    anaerobicTE: 3.3,
    altitudeStart: 230,
    altitudeAmplitude: 24,
    cadenceBase: 90,
    cadenceNoise: 9,
    hrNoise: 5,
    speedNoise: 0.9,
    hrCurve: (r) => {
      if (r < 0.12) return 122 + r * 190;
      if (r > 0.85) return 162 - (r - 0.85) * 180;
      const block = Math.floor(r * 24);
      const hard = block % 2 === 0;
      return hard ? 172 + Math.sin(r * 35) * 7 : 145 + Math.sin(r * 22) * 5;
    },
    speedCurve: (r) => {
      if (r < 0.12) return 6.4 + r * 8;
      if (r > 0.85) return 8.8 - (r - 0.85) * 9;
      const block = Math.floor(r * 24);
      const hard = block % 2 === 0;
      return hard ? 11.2 + Math.sin(r * 20) * 1.3 : 7.8 + Math.sin(r * 16) * 0.8;
    },
  },
];

const outDir = path.resolve(process.cwd(), 'mock-fits');
fs.mkdirSync(outDir, { recursive: true });

for (const preset of presets) {
  const bytes = createActivityFit(preset);
  const target = path.join(outDir, preset.fileName);
  fs.writeFileSync(target, Buffer.from(bytes));
  console.log(`Wrote ${preset.fileName} (${preset.label}) → ${target}`);
}
