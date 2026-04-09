/**
 * routeMatcher.js — GPS route fingerprinting and same-route comparison.
 * Pure functions, no React, fully unit-testable.
 */

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * fingerprint — downsample GPS track to numPoints key points.
 * Returns array of { lat, lon } rounded to 4 decimal places (~10m precision).
 */
export function fingerprint(timeSeries, numPoints = 20) {
  const gps = (timeSeries ?? []).filter(p => p.lat != null && p.lon != null);
  if (gps.length < numPoints) return null;

  const step = Math.floor(gps.length / numPoints);
  return Array.from({ length: numPoints }, (_, i) => {
    const p = gps[i * step];
    return {
      lat: parseFloat(p.lat.toFixed(4)),
      lon: parseFloat(p.lon.toFixed(4)),
    };
  });
}

/**
 * matchRoute — compare two fingerprints, returns similarity 0..1.
 * Also checks reverse direction.
 */
export function matchRoute(fp1, fp2, toleranceM = 50) {
  if (!fp1 || !fp2 || fp1.length !== fp2.length) return 0;

  const score = (a, b) => {
    let matches = 0;
    for (let i = 0; i < a.length; i++) {
      if (haversine(a[i].lat, a[i].lon, b[i].lat, b[i].lon) <= toleranceM) matches++;
    }
    return matches / a.length;
  };

  const forward  = score(fp1, fp2);
  const reversed = score(fp1, [...fp2].reverse());
  return Math.max(forward, reversed);
}

/**
 * findRouteMatches — find history workouts on the same route.
 * Returns sorted array of { workout, similarity }.
 */
export function findRouteMatches(currentFp, historyWorkouts, threshold = 0.8) {
  if (!currentFp) return [];
  return historyWorkouts
    .filter(w => w.routeFingerprint)
    .map(w => ({ workout: w, similarity: matchRoute(currentFp, w.routeFingerprint) }))
    .filter(m => m.similarity >= threshold)
    .sort((a, b) => new Date(b.workout.date) - new Date(a.workout.date));
}

/**
 * compareRoutePerformance — delta metrics between two same-route workouts.
 */
export function compareRoutePerformance(current, previous) {
  if (!current || !previous) return null;

  const speedDelta   = (current.speed?.avg ?? 0) - (previous.speed?.avg ?? 0);
  const hrDelta      = (current.heartRate?.avg ?? 0) - (previous.heartRate?.avg ?? 0);
  const teDelta      = (current.trainingEffect?.aerobic ?? 0) - (previous.trainingEffect?.aerobic ?? 0);
  const distDelta    = ((current.distance ?? 0) - (previous.distance ?? 0)) / 1000;

  // Aerobic efficiency: speed/HR ratio
  const currentAE    = current.heartRate?.avg > 0 ? (current.speed?.avg ?? 0) / current.heartRate.avg : null;
  const previousAE   = previous.heartRate?.avg > 0 ? (previous.speed?.avg ?? 0) / previous.heartRate.avg : null;
  const aeDelta      = (currentAE != null && previousAE != null) ? parseFloat((currentAE - previousAE).toFixed(3)) : null;

  return {
    date:       { current: current.date, previous: previous.date },
    speedDelta: parseFloat(speedDelta.toFixed(2)),
    hrDelta:    parseFloat(hrDelta.toFixed(1)),
    teDelta:    parseFloat(teDelta.toFixed(1)),
    distDelta:  parseFloat(distDelta.toFixed(2)),
    aeDelta,
    improved:   speedDelta > 0 && hrDelta <= 2, // faster at same or lower HR
  };
}
