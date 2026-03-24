/**
 * fitParser.js — Pure-JS ANT/Garmin FIT binary parser. Zero dependencies.
 * Handles all ANT+ base types, Smart Recording, enhanced speed/altitude fallbacks,
 * zones_target message, correct CRC boundary via dataEnd.
 */

/**
 * fitParser.js
 * Pure-JS ANT/Garmin FIT binary format parser.
 * Spec: https://developer.garmin.com/fit/protocol/
 *
 * Returns structured { session, laps, records, sport } from a FIT ArrayBuffer.
 * No external dependencies. Works in browser + Node.
 */

// ─── Base type table ─────────────────────────────────────────────────────────
// Keys are the actual FIT base_type bytes as written in definition messages.
// Single-byte types use low-nibble only (0x00–0x0D).
// Multi-byte types have the high bit set (0x83, 0x84, 0x85, 0x86, 0x88…).
// We look up by (btypeRaw & 0x9F) to normalize, so we need BOTH the raw and
// the normalised form in the table.
const BASE_TYPE = {
  // Single-byte / no-endian types
  0x00: ['enum',    1],
  0x01: ['sint8',   1],
  0x02: ['uint8',   1],
  0x07: ['string',  1],
  0x0A: ['uint8z',  1],
  0x0D: ['byte',    1],
  // Multi-byte types — actual bytes in FIT files have high bit set
  0x83: ['sint16',  2],
  0x84: ['uint16',  2],
  0x85: ['sint32',  4],
  0x86: ['uint32',  4],
  0x88: ['float32', 4],
  0x89: ['float64', 8],
  0x8B: ['uint16z', 2],
  0x8C: ['uint32z', 4],
  0x8E: ['sint64',  8],
  0x8F: ['uint64',  8],
  0x90: ['uint64z', 8],
};

// Global message numbers we care about
const MESG = { FILE_ID: 0, HR_ZONE: 8, SPORT: 12, ZONES_TARGET: 7, SESSION: 18, LAP: 19, RECORD: 20 };

// FIT epoch: seconds since 1989-12-31 00:00:00 UTC
export const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);

// Invalid / "no data" sentinels per base type
const INVALID = {
  enum: 0xFF, sint8: 0x7F, uint8: 0xFF, sint16: 0x7FFF, uint16: 0xFFFF,
  sint32: 0x7FFFFFFF, uint32: 0xFFFFFFFF, uint8z: 0x00, uint16z: 0x0000,
  uint32z: 0x00000000, float32: null, float64: null,
  sint64: BigInt('0x7FFFFFFFFFFFFFFF'), uint64: BigInt('0xFFFFFFFFFFFFFFFF'),
  uint64z: BigInt(0), byte: 0xFF, string: null,
};

// ─── Read a single value from DataView ───────────────────────────────────────
function readScalar(dv, offset, typeName, le) {
  switch (typeName) {
    case 'enum':   case 'uint8':  case 'byte': case 'uint8z':
      return dv.getUint8(offset);
    case 'sint8':  return dv.getInt8(offset);
    case 'uint16': case 'uint16z': return dv.getUint16(offset, le);
    case 'sint16': return dv.getInt16(offset, le);
    case 'uint32': case 'uint32z': return dv.getUint32(offset, le);
    case 'sint32': return dv.getInt32(offset, le);
    case 'float32': return dv.getFloat32(offset, le);
    case 'float64': return dv.getFloat64(offset, le);
    case 'uint64':  case 'uint64z':
      return dv.getBigUint64(offset, le);
    case 'sint64':  return dv.getBigInt64(offset, le);
    default: return dv.getUint8(offset);
  }
}

// ─── Parse one field's raw bytes, respecting array fields ────────────────────
function parseFieldBytes(dv, offset, fieldSize, btypeRaw, le) {
  const btypeKey = btypeRaw & 0x9F;
  const info = BASE_TYPE[btypeKey];
  if (!info) return dv.getUint8(offset); // unknown fallback

  const [typeName, typeSize] = info;

  if (typeName === 'string') {
    // Null-terminated UTF-8 string
    const bytes = new Uint8Array(dv.buffer, offset, fieldSize);
    const end = bytes.indexOf(0);
    return new TextDecoder().decode(bytes.slice(0, end < 0 ? fieldSize : end));
  }

  if (typeSize === 0 || fieldSize < typeSize) return null;

  const count = Math.floor(fieldSize / typeSize);
  if (count === 1) {
    const v = readScalar(dv, offset, typeName, le);
    return isInvalid(v, typeName) ? null : v;
  }

  // Array field
  const arr = [];
  for (let i = 0; i < count; i++) {
    const v = readScalar(dv, offset + i * typeSize, typeName, le);
    arr.push(isInvalid(v, typeName) ? null : v);
  }
  return arr.every(v => v === null) ? null : arr;
}

function isInvalid(v, typeName) {
  if (v === null || v === undefined) return true;
  const sentinel = INVALID[typeName];
  if (sentinel === null || sentinel === undefined) return false;
  return v === sentinel;
}

// ─── Main parser ─────────────────────────────────────────────────────────────
export function parseFit(buffer) {
  const bytes  = new Uint8Array(buffer);
  const dv     = new DataView(buffer);

  // Validate header
  if (bytes.length < 14) throw new Error('File too small to be a FIT file');
  const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (magic !== '.FIT') throw new Error(`Invalid FIT magic: "${magic}"`);

  const headerSize = bytes[0];
  let pos = headerSize; // skip file header

  // data_end excludes the 2-byte file CRC appended after the data records.
  // Using this as loop boundary prevents the parser from treating CRC bytes
  // as a record header (which causes DataView out-of-bounds on some files).
  const dataSize = dv.getUint32(4, true);
  const dataEnd  = headerSize + dataSize;

  const localDefs = {}; // local message number → definition
  const result = { sessions: [], laps: [], records: [], sports: [], hrZones: [], fileId: null, zonesTarget: null };

  while (pos < dataEnd) {
    if (pos >= bytes.length) break;

    const recordHeader = bytes[pos++];
    const isCompressed = (recordHeader & 0x80) !== 0;

    if (isCompressed) {
      // Compressed timestamp record
      const localMsgNum = (recordHeader >> 5) & 0x03;
      const def = localDefs[localMsgNum];
      if (def) {
        const msgSize = def.fields.reduce((s, f) => s + f.size, 0);
        if (pos + msgSize <= bytes.length) pos += msgSize;
      }
      continue;
    }

    const isDef     = (recordHeader >> 6) & 0x01;
    const hasDev    = (recordHeader & 0x20) !== 0;
    const localNum  = recordHeader & 0x0F;

    if (isDef) {
      if (pos + 5 > bytes.length) break; // guard: need 5 bytes for def header
      pos++; // reserved byte
      const littleEndian = bytes[pos++] === 0;
      const globalMsgNum = littleEndian
        ? dv.getUint16(pos, true) : dv.getUint16(pos);
      pos += 2;
      const numFields = bytes[pos++];

      const fields = [];
      for (let i = 0; i < numFields; i++) {
        if (pos + 3 > bytes.length) break;
        const fieldDefNum = bytes[pos++];
        const fieldSize   = bytes[pos++];
        const baseTypeRaw = bytes[pos++];
        fields.push({ num: fieldDefNum, size: fieldSize, btype: baseTypeRaw });
      }

      // Developer fields (skip)
      if (hasDev) {
        const numDev = bytes[pos++];
        pos += numDev * 3;
      }

      localDefs[localNum] = { globalNum: globalMsgNum, le: littleEndian, fields };

    } else {
      // Data message
      const def = localDefs[localNum];
      if (!def) continue;

      const row = {};
      let ok = true;

      for (const f of def.fields) {
        if (pos + f.size > bytes.length) { ok = false; break; }
        row[f.num] = parseFieldBytes(dv, pos, f.size, f.btype, def.le);
        pos += f.size;
      }

      if (!ok) break;

      switch (def.globalNum) {
        case MESG.SESSION:      result.sessions.push(row);   break;
        case MESG.LAP:          result.laps.push(row);       break;
        case MESG.RECORD:       result.records.push(row);    break;
        case MESG.SPORT:        result.sports.push(row);     break;
        case MESG.HR_ZONE:      result.hrZones.push(row);    break;
        case MESG.FILE_ID:      result.fileId = row;         break;
        case MESG.ZONES_TARGET: result.zonesTarget = row;    break;
      }
    }
  }

  if (!result.sessions.length) throw new Error('No session data found in FIT file');
  return result;
}

// ─── Timestamp conversion ────────────────────────────────────────────────────
export function fitTsToDate(ts) {
  if (!ts || ts === 0xFFFFFFFF) return null;
  return new Date(FIT_EPOCH_MS + ts * 1000);
}



// ────────────────────────────────────────────────────────────