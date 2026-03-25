/**
 * fitWorkoutBuilder.js
 * Generates a binary Garmin FIT workout file from a training plan day.
 *
 * Pure JS — zero imports, no React, no dependencies.
 * Returns Uint8Array (binary .fit file) or null for rest days.
 *
 * FIT Workout format: ANT+ FIT Protocol, messages 0 (file_id),
 * 26 (workout), 27 (workout_step). Little-endian byte order.
 *
 * To import: connect.garmin.com → Training → Workouts → Import
 */

// ── CRC-16 (ANT+ FIT variant, poly 0xB2C0) ────────────────────────────────
function crc16(bytes) {
  const table = new Uint16Array(16);
  for (let i = 0; i < 16; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (c >>> 1) ^ 0xB2C0 : c >>> 1;
    table[i] = c;
  }
  let crc = 0;
  for (const b of bytes) {
    let tmp = table[(crc ^ b) & 0x0F]; crc = tmp ^ (crc >>> 4);
    tmp = table[(crc ^ (b >>> 4)) & 0x0F]; crc = tmp ^ (crc >>> 4);
  }
  return crc;
}

// ── Binary helpers ─────────────────────────────────────────────────────────
function u8(v)    { return [v & 0xFF]; }
function u16(v)   { return [v & 0xFF, (v >> 8) & 0xFF]; }
function u32(v)   { return [v & 0xFF, (v>>8)&0xFF, (v>>16)&0xFF, (v>>24)&0xFF]; }
function strField(s, len) {
  const out = new Array(len).fill(0);
  for (let i = 0; i < Math.min(s.length, len - 1); i++) out[i] = s.charCodeAt(i) & 0xFF;
  return out;
}

// ── Definition message builder ─────────────────────────────────────────────
// fields: [[fieldDefNum, fieldSize, baseType], ...]
// Base types: 0x02=uint8, 0x07=string, 0x84=uint16, 0x86=uint32, 0x8C=uint32z
function defMsg(localNum, globalMesgNum, fields) {
  return [
    0x40 | localNum, 0x00, 0x00,   // def header, reserved, arch=little-endian
    ...u16(globalMesgNum),          // global message number
    fields.length,                  // number of fields
    ...fields.flat(),               // [fieldNum, size, baseType] × N
  ];
}

// ── FIT epoch (seconds since 1989-12-31 00:00:00 UTC) ─────────────────────
const FIT_EPOCH_OFFSET = 631065600; // Unix seconds to FIT seconds

// ── Sport type IDs ─────────────────────────────────────────────────────────
function sportTypeId(sport) {
  const s = (sport ?? '').toLowerCase();
  if (s.includes('cycl') || s.includes('bike') || s.includes('road')) return 2;
  if (s.includes('run') || s.includes('бег')) return 1;
  return 0;
}

// ── HR zone boundaries in BPM ─────────────────────────────────────────────
function hrZones(maxHr) {
  return {
    z1: { lo: Math.round(maxHr * 0.50), hi: Math.round(maxHr * 0.60) },
    z2: { lo: Math.round(maxHr * 0.60), hi: Math.round(maxHr * 0.70) },
    z3: { lo: Math.round(maxHr * 0.70), hi: Math.round(maxHr * 0.80) },
    z4: { lo: Math.round(maxHr * 0.80), hi: Math.round(maxHr * 0.90) },
    z5: { lo: Math.round(maxHr * 0.90), hi: maxHr },
  };
}

// ── Workout step data message ──────────────────────────────────────────────
// intensity: 0=active, 1=rest, 2=warmup, 3=cooldown, 4=recovery, 5=interval
// Uses target_value_low/high (actual BPM) — more compatible than hr_zone index
function wStep(idx, name, durMs, bpmLo, bpmHi, intensity) {
  const targetType = (bpmLo > 0 && bpmHi > 0) ? 1 : 2; // 1=heart_rate, 2=open
  return [
    0x02,            // local message type 2
    ...u16(idx),     // message_index (field 254)
    ...strField(name, 16), // wkt_step_name (field 0, string 16)
    ...u8(0),        // duration_type (field 1): 0=time
    ...u32(durMs),   // duration_value (field 2): milliseconds
    ...u8(targetType), // target_type (field 8)
    ...u32(bpmLo),   // target_value_low (field 10): bpm
    ...u32(bpmHi),   // target_value_high (field 11): bpm
    ...u8(intensity), // intensity (field 23)
  ];
}

// ── Build step sequences per workout type ─────────────────────────────────
function buildSteps(day, z, sport) {
  const avgSpeedMs   = (sportTypeId(sport) === 1) ? 3.0 : 5.5; // run=3m/s, cycle=5.5m/s
  const totalSec     = Math.max(30 * 60, (day.targetKm * 1000) / avgSpeedMs);
  const mainSec      = (s) => Math.max(10 * 60, totalSec - s) * 1000; // minus warmup+cooldown

  switch (day.type) {
    case 'recovery':
      return [
        wStep(0, 'Recovery',    totalSec * 1000, z.z1.lo, z.z1.hi, 0),
      ];

    case 'aerobic':
      return [
        wStep(0, 'Warmup',      15 * 60 * 1000,   z.z2.lo, z.z2.hi, 2),
        wStep(1, 'Aerobic Z2',  mainSec(30 * 60), z.z2.lo, z.z2.hi, 0),
        wStep(2, 'Cooldown',    15 * 60 * 1000,   z.z1.lo, z.z1.hi, 3),
      ];

    case 'long':
      return [
        wStep(0, 'Warmup',     20 * 60 * 1000,   z.z2.lo, z.z2.hi, 2),
        wStep(1, 'Long Z2',    mainSec(40 * 60), z.z2.lo, z.z2.hi, 0),
        wStep(2, 'Cooldown',   20 * 60 * 1000,   z.z1.lo, z.z1.hi, 3),
      ];

    case 'tempo':
      return [
        wStep(0, 'Warmup',     15 * 60 * 1000, z.z2.lo, z.z2.hi, 2),
        wStep(1, 'Tempo Z3',   25 * 60 * 1000, z.z3.lo, z.z3.hi, 5),
        wStep(2, 'Cooldown',   15 * 60 * 1000, z.z1.lo, z.z1.hi, 3),
      ];

    case 'interval': {
      // Check for VO2max variant by label
      const isVo2 = (day.label ?? '').toLowerCase().includes('vo2') || (day.label ?? '').includes('VO₂');
      const workZone = isVo2 ? z.z5 : z.z4;
      const workMin  = isVo2 ? 4 : 8;
      const restMin  = 4;
      const reps     = isVo2 ? 5 : 4;
      const steps    = [wStep(0, 'Warmup', 15 * 60 * 1000, z.z2.lo, z.z2.hi, 2)];
      for (let i = 0; i < reps; i++) {
        steps.push(wStep(steps.length, `Interval ${i+1}`, workMin*60*1000, workZone.lo, workZone.hi, 5));
        steps.push(wStep(steps.length, `Recovery ${i+1}`, restMin*60*1000, z.z1.lo, z.z1.hi, 4));
      }
      steps.push(wStep(steps.length, 'Cooldown', 15 * 60 * 1000, z.z1.lo, z.z1.hi, 3));
      return steps;
    }

    case 'test':
      return [
        wStep(0, 'Test Z2',  totalSec * 1000, z.z2.lo, z.z2.hi, 0),
      ];

    default:
      return [
        wStep(0, day.type ?? 'Workout', totalSec * 1000, z.z2.lo, z.z2.hi, 0),
      ];
  }
}

// ── Main export ────────────────────────────────────────────────────────────
export function buildFitWorkout(day, sport, maxHr = 180) {
  if (!day || day.type === 'rest') return null;

  const z       = hrZones(maxHr);
  const sId     = sportTypeId(sport);
  const steps   = buildSteps(day, z, sport);
  const nSteps  = steps.length;
  const wktName = (day.label ?? 'Workout').slice(0, 15); // 16 bytes with null terminator
  const fitTs   = Math.floor(Date.now() / 1000) - FIT_EPOCH_OFFSET;

  const buf = [];

  // ── Local 0: file_id (global 0) ─────────────────────────────────────────
  buf.push(...defMsg(0, 0, [
    [0, 2, 0x84],   // manufacturer (uint16)
    [1, 2, 0x84],   // product (uint16)
    [2, 4, 0x8C],   // serial_number (uint32z)
    [4, 4, 0x86],   // time_created (uint32 FIT timestamp)
    [5, 2, 0x84],   // number (uint16)
    [8, 1, 0x02],   // type (uint8) — 5 = workout file
  ]));
  buf.push(0x00); // data header for local msg 0
  buf.push(...u16(1), ...u16(0), ...u32(0), ...u32(fitTs), ...u16(1), ...u8(5));

  // ── Local 1: workout (global 26) ────────────────────────────────────────
  buf.push(...defMsg(1, 26, [
    [4,  16, 0x07],  // wkt_name (string, 16 bytes incl. null)
    [0,   1, 0x02],  // sport (uint8)
    [6,   2, 0x84],  // num_valid_steps (uint16)
  ]));
  buf.push(0x01); // data header for local msg 1
  buf.push(...strField(wktName, 16), ...u8(sId), ...u16(nSteps));

  // ── Local 2: workout_step (global 27) ────────────────────────────────────
  buf.push(...defMsg(2, 27, [
    [254, 2, 0x84],  // message_index (uint16)
    [0,  16, 0x07],  // wkt_step_name (string, 16 bytes)
    [1,   1, 0x02],  // duration_type (uint8)  0=time
    [2,   4, 0x86],  // duration_value (uint32) ms
    [8,   1, 0x02],  // target_type (uint8)    1=heart_rate 2=open
    [10,  4, 0x86],  // target_value_low (uint32) bpm
    [11,  4, 0x86],  // target_value_high (uint32) bpm
    [23,  1, 0x02],  // intensity (uint8)
  ]));

  // ── Step data messages ────────────────────────────────────────────────────
  for (const s of steps) buf.push(...s);

  // ── Assemble file ─────────────────────────────────────────────────────────
  const dataBytes = new Uint8Array(buf);
  const header    = new Uint8Array(14);
  header[0] = 14; header[1] = 0x10; header[2] = 0x0B; header[3] = 0x08;
  const ds = dataBytes.length;
  header[4]=ds&0xFF; header[5]=(ds>>8)&0xFF; header[6]=(ds>>16)&0xFF; header[7]=(ds>>24)&0xFF;
  header[8]=0x2E; header[9]=0x46; header[10]=0x49; header[11]=0x54; // ".FIT"
  const hCrc = crc16(header.slice(0, 12));
  header[12] = hCrc & 0xFF; header[13] = (hCrc >> 8) & 0xFF;

  const combined = new Uint8Array(header.length + dataBytes.length);
  combined.set(header); combined.set(dataBytes, header.length);
  const fCrc = crc16(combined);
  const result = new Uint8Array(combined.length + 2);
  result.set(combined);
  result[combined.length]   = fCrc & 0xFF;
  result[combined.length+1] = (fCrc >> 8) & 0xFF;
  return result;
}