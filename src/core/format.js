/**
 * format.js - Pure formatting utilities. No dependencies.
 */

/** Format seconds as H:MM:SS */
export function fmtDuration(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return '—';
  const s = Math.round(Math.abs(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Format seconds as H:MM (compact) */
export function fmtDurationShort(totalSeconds) {
  if (!totalSeconds && totalSeconds !== 0) return '—';
  const s = Math.round(Math.abs(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Format meters as km with 2 decimal places */
export function fmtKm(meters) {
  if (meters == null) return '—';
  return (meters / 1000).toFixed(2);
}

/** Format a number to fixed decimal places */
export function fmtNum(value, decimals = 1) {
  if (value == null || isNaN(value)) return '—';
  return Number(value).toFixed(decimals);
}

/** Format pace (min/km) from speed in km/h */
export function fmtPace(speedKmh) {
  if (!speedKmh || speedKmh <= 0) return '—';
  const secPerKm = 3600 / speedKmh;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

/** Abbreviated large numbers: 1234 -> "1.2k" */
export function fmtCompact(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Format ISO date (YYYY-MM-DD) as DD.MM */
export function fmtDateDM(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '—';
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}`;
}

/** Format ISO date (YYYY-MM-DD) as DD.MM.YYYY */
export function fmtDateDMY(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '—';
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
