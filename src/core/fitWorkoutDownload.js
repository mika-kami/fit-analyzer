/**
 * fitWorkoutDownload.js
 * Triggers browser download of a FIT workout file.
 *
 * To import to Garmin device:
 * 1. Go to connect.garmin.com -> Training -> Workouts
 * 2. Click Import -> drag the .fit file
 * 3. The workout appears in "My Workouts"
 * 4. Click "Schedule" to add to calendar, or sync to device
 * 5. On device: Training -> Workouts -> find by name
 */
import { buildFitWorkout } from './fitWorkoutBuilder.js';

export function downloadFitWorkout(day, sport, maxHr = 180) {
  const bytes = buildFitWorkout(day, sport, maxHr);
  if (!bytes) return;

  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  const now = new Date();
  const [mm, dd] = (day.date ?? '01/01').split('/');
  const targetMonth = parseInt(mm, 10);
  const year = targetMonth < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
  const fname = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}_${day.type}.fit`;

  a.href     = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
