/**
 * gpxExport.js — Convert WorkoutModel timeSeries to GPX 1.1 format.
 * Includes: track points with coordinates, elevation, time,
 * and Garmin TrackPointExtension for HR and cadence.
 */

import { FIT_EPOCH_MS } from './fitParser.js';

/**
 * Convert a FIT timestamp (seconds since 1989-12-31) to ISO 8601 UTC string.
 * @param {number} fitTs — FIT epoch seconds
 * @returns {string} — "2025-09-07T10:13:29Z"
 */
function fitTsToISO(fitTs) {
  if (!fitTs) return '';
  return new Date(FIT_EPOCH_MS + fitTs * 1000).toISOString();
}

/**
 * Generate a GPX 1.1 string from a workout's timeSeries.
 * @param {object} workout — WorkoutModel
 * @returns {string} — GPX XML string
 */
export function workoutToGPX(workout) {
  const pts = (workout.timeSeries ?? []).filter(p => p.lat != null && p.lon != null);

  if (pts.length === 0) {
    throw new Error('Нет GPS-данных в этой тренировке');
  }

  const name     = `${workout.sportLabel} ${workout.date} ${workout.startTime}`;
  const fileTime = fitTsToISO(pts[0]?.timestamp);
  const distKm   = (workout.distance / 1000).toFixed(2);

  const trkpts = pts.map(p => {
    const time = fitTsToISO(p.timestamp);
    const ele  = p.altitude != null ? `\n      <ele>${p.altitude.toFixed(1)}</ele>` : '';
    const t    = time        ? `\n      <time>${time}</time>` : '';

    // Garmin TrackPointExtension for HR + cadence
    const hasExt = p.hr != null || p.cadence != null;
    const ext = hasExt ? `
      <extensions>
        <gpxtpx:TrackPointExtension>
          ${p.hr      != null ? `<gpxtpx:hr>${p.hr}</gpxtpx:hr>` : ''}
          ${p.cadence != null ? `<gpxtpx:cad>${p.cadence}</gpxtpx:cad>` : ''}
        </gpxtpx:TrackPointExtension>
      </extensions>` : '';

    return `    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}${t}${ext}
    </trkpt>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"
  creator="FIT Analyzer"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${fileTime}</time>
    <desc>${distKm} км · ЧСС ср. ${workout.heartRate?.avg ?? '—'} уд/мин · +${workout.elevation?.ascent ?? 0} м</desc>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>${escapeXml(workout.sportLabel ?? 'cycling')}</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Trigger a browser download of the GPX file.
 * @param {object} workout — WorkoutModel
 */
export function downloadGPX(workout) {
  const gpx      = workoutToGPX(workout);
  const blob     = new Blob([gpx], { type: 'application/gpx+xml' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `${workout.date}_${workout.sportLabel ?? 'workout'}.gpx`
                     .replace(/[^a-zA-Z0-9_\-.]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}
