/**
 * fitWorkoutBuilder.js
 * Generates a binary Garmin FIT workout file from a training plan day.
 * Pure JS — no imports, no React.
 * Spec: ANT+ FIT Protocol — Workout (mesg 26) + Workout Step (mesg 27)
 */

function crc16(bytes) {
  const table = new Uint16Array(16);
  for (let i = 0; i < 16; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (crc >>> 1) ^ 0xB2C0 : crc >>> 1;
    table[i] = crc;
  }
  let crc = 0;
  for (const byte of bytes) {
    let tmp = table[(crc ^ byte) & 0x0F]; crc = tmp ^ (crc >>> 4);
    tmp = table[(crc ^ (byte >>> 4)) & 0x0F]; crc = tmp ^ (crc >>> 4);
  }
  return crc;
}

function u8(v)    { return [v & 0xFF]; }
function u16le(v) { return [v & 0xFF, (v >> 8) & 0xFF]; }
function u32le(v) { return [v & 0xFF, (v>>8)&0xFF, (v>>16)&0xFF, (v>>24)&0xFF]; }
function str(s, len) {
  const bytes = [];
  for (let i = 0; i < len - 1; i++) bytes.push(i < s.length ? s.charCodeAt(i) & 0xFF : 0);
  bytes.push(0);
  return bytes;
}

// Definition message: 0x40 | localNum, reserved, arch, globalMesgNum(u16le), numFields, field defs
function defMsg(localNum, globalMesgNum, fields) {
  const hdr = [0x40 | localNum, 0x00, 0x00];
  const gn  = u16le(globalMesgNum);
  const nf  = [fields.length];
  const fds = fields.flatMap(([num, size, bt]) => [num, size, bt]);
  return [...hdr, ...gn, ...nf, ...fds];
}

function zones(maxHr) {
  return {
    z1: { lo: Math.round(maxHr * 0.50), hi: Math.round(maxHr * 0.60), garminZone: 1 },
    z2: { lo: Math.round(maxHr * 0.60), hi: Math.round(maxHr * 0.70), garminZone: 2 },
    z3: { lo: Math.round(maxHr * 0.70), hi: Math.round(maxHr * 0.80), garminZone: 3 },
    z4: { lo: Math.round(maxHr * 0.80), hi: Math.round(maxHr * 0.90), garminZone: 4 },
    z5: { lo: Math.round(maxHr * 0.90), hi: maxHr,                     garminZone: 5 },
  };
}

function sportId(sport) {
  const s = (sport ?? '').toLowerCase();
  if (s.includes('cycl') || s.includes('bike') || s.includes('road')) return 2;
  if (s.includes('run')) return 1;
  return 0;
}

// intensity: 0=active, 1=rest, 2=warmup, 3=cooldown, 4=recovery, 5=interval
// target_type: 1=heart_rate, 2=open
function step(idx, durationMs, hrZoneNum, intensityCode) {
  return [
    0x02,                    // data msg local 2
    ...u16le(idx),           // message_index
    ...u8(0),                // duration_type = time
    ...u32le(durationMs),    // duration_value ms
    ...u8(hrZoneNum > 0 ? 1 : 2), // target_type
    ...u8(hrZoneNum),        // target_hr_zone
    ...u8(intensityCode),    // intensity
  ];
}

function buildSteps(day, z, sport) {
  const avgSpeedMs = sportId(sport) === 1 ? 3.0 : 5.5;
  const durationSec = day.targetKm > 0 ? Math.round((day.targetKm * 1000) / avgSpeedMs) : 3600;

  switch (day.type) {
    case 'recovery':
      return [step(0, durationSec * 1000, z.z1.garminZone, 0)];

    case 'aerobic': {
      const main = Math.max(10 * 60, durationSec - 30 * 60);
      return [
        step(0, 15 * 60 * 1000, z.z1.garminZone, 2),
        step(1, main * 1000,    z.z2.garminZone, 0),
        step(2, 15 * 60 * 1000, z.z1.garminZone, 3),
      ];
    }

    case 'long': {
      const main = Math.max(10 * 60, durationSec - 40 * 60);
      return [
        step(0, 20 * 60 * 1000, z.z1.garminZone, 2),
        step(1, main * 1000,    z.z2.garminZone, 0),
        step(2, 20 * 60 * 1000, z.z1.garminZone, 3),
      ];
    }

    case 'tempo':
      return [
        step(0, 15 * 60 * 1000, z.z2.garminZone, 2),
        step(1, 25 * 60 * 1000, z.z3.garminZone, 5),
        step(2, 15 * 60 * 1000, z.z1.garminZone, 3),
      ];

    case 'interval': {
      const steps = [step(0, 15 * 60 * 1000, z.z2.garminZone, 2)];
      for (let i = 0; i < 4; i++) {
        steps.push(step(1 + i * 2,     8 * 60 * 1000, z.z4.garminZone, 5));
        steps.push(step(1 + i * 2 + 1, 4 * 60 * 1000, z.z1.garminZone, 4));
      }
      steps.push(step(9, 15 * 60 * 1000, z.z1.garminZone, 3));
      return steps;
    }

    case 'test':
      return [step(0, durationSec * 1000, z.z2.garminZone, 0)];

    default:
      return [step(0, durationSec * 1000, z.z1.garminZone, 0)];
  }
}

export function buildFitWorkout(day, sport, maxHr = 180) {
  if (!day || day.type === 'rest') return null;

  const z      = zones(maxHr);
  const sId    = sportId(sport);
  const steps  = buildSteps(day, z, sport);
  const nSteps = steps.length;
  const name   = (day.label || 'Workout').slice(0, 15);

  const buf = [];

  // Definition: file_id (local 0, global 0)
  buf.push(...defMsg(0, 0, [
    [0, 2, 0x84],   // manufacturer uint16
    [1, 2, 0x84],   // product uint16
    [4, 4, 0x86],   // serial_number uint32
    [8, 1, 0x02],   // type uint8: 5=workout
  ]));
  // Data: file_id
  buf.push(0x00, ...u16le(1), ...u16le(0), ...u32le(0), ...u8(5));

  // Definition: workout (local 1, global 26)
  buf.push(...defMsg(1, 26, [
    [4,  16, 0x07],  // wkt_name string 16
    [0,   1, 0x02],  // sport uint8
    [6,   2, 0x84],  // num_valid_steps uint16
  ]));
  // Data: workout
  buf.push(0x01, ...str(name, 16), ...u8(sId), ...u16le(nSteps));

  // Definition: workout_step (local 2, global 27)
  buf.push(...defMsg(2, 27, [
    [254, 2, 0x84],  // message_index uint16
    [1,   1, 0x02],  // duration_type uint8
    [2,   4, 0x86],  // duration_value uint32
    [8,   1, 0x02],  // target_type uint8
    [12,  1, 0x02],  // target_hr_zone uint8
    [23,  1, 0x02],  // intensity uint8
  ]));

  // Workout step data messages
  for (const s of steps) {
    buf.push(...s);
  }

  // Assemble: header + data + file CRC
  const dataBytes = new Uint8Array(buf);

  const header = new Uint8Array(14);
  header[0] = 14;           // header size
  header[1] = 0x10;         // protocol version
  header[2] = 0x0B;         // profile version low
  header[3] = 0x08;         // profile version high
  const ds = dataBytes.length;
  header[4] = ds & 0xFF; header[5] = (ds >> 8) & 0xFF;
  header[6] = (ds >> 16) & 0xFF; header[7] = (ds >> 24) & 0xFF;
  header[8] = 0x2E; header[9] = 0x46; header[10] = 0x49; header[11] = 0x54; // .FIT
  const hCrc = crc16(header.slice(0, 12));
  header[12] = hCrc & 0xFF; header[13] = (hCrc >> 8) & 0xFF;

  const allData = new Uint8Array(header.length + dataBytes.length);
  allData.set(header, 0);
  allData.set(dataBytes, header.length);
  const fCrc = crc16(allData);

  const result = new Uint8Array(allData.length + 2);
  result.set(allData, 0);
  result[allData.length]     = fCrc & 0xFF;
  result[allData.length + 1] = (fCrc >> 8) & 0xFF;

  return result;
}
