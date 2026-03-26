/**
 * fitWorkoutDownload.js
 * Downloads a training plan day as a structured workout file.
 *
 * IMPORTANT — Import instructions:
 *
 * For Garmin devices via USB (recommended):
 *   1. Connect Garmin device to computer via USB
 *   2. Open device storage (appears as USB drive)
 *   3. Copy .fit file to the /GARMIN/WORKOUTS/ folder
 *   4. Safely eject and disconnect
 *   5. On device: Training → Workouts → find by name
 *
 * For Garmin Connect Web:
 *   NOTE: The regular "Import" button on Garmin Connect only accepts
 *   ACTIVITY files (recorded rides/runs), not workout plan files.
 *   Use the "Отправить в Garmin" button in this app instead —
 *   it uses the Workout API which correctly creates structured workouts.
 *
 * For Wahoo ELEMNT:
 *   Wahoo app → More → Workouts → Import → select .fit file
 *
 * For Hammerhead Karoo:
 *   Copy .fit to device storage under /Android/data/...workouts/
 */

import { buildFitWorkout } from './fitWorkoutBuilder.js';

export function downloadFitWorkout(day, sport, maxHr = 180) {
  const bytes = buildFitWorkout(day, sport, maxHr);
  if (!bytes) return;

  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  const now          = new Date();
  const [mm, dd]     = (day.date ?? '01/01').split('/');
  const targetMonth  = parseInt(mm, 10);
  const year         = targetMonth < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
  const fname        = `${year}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}_${day.type}.fit`;

  a.href     = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}