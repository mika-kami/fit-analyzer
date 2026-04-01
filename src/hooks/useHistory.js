/** useHistory.js â€” Workout history via window.storage with in-memory fallback. */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useHistory â€” persists workout summaries via window.storage.
 * Schema:
 *   "fit:index"         â†’ JSON string[]  (ISO date keys, newest first)
 *   "fit:YYYY-MM-DD"    â†’ JSON WorkoutSummary  (lightweight, no timeSeries)
 *   "fit:YYYY-MM-DD:ts" â†’ JSON DataPoint[]     (timeSeries, loaded on demand)
 */

// WorkoutSummary â€” what we store per workout (no heavy timeSeries)
function summarize(workout) {
  return {
    date:          workout.date,
    startTime:     workout.startTime,
    sport:         workout.sportLabel,
    bike:          workout.bike,
    fileName:      workout.fileName,
    distance:      workout.distance,
    duration:      workout.duration,
    calories:      workout.calories,
    heartRate:     workout.heartRate,
    speed:         workout.speed,
    elevation:     workout.elevation,
    trainingEffect: workout.trainingEffect,
    thresholdHr:   workout.thresholdHr,
    hrZones:       workout.hrZones,
    multiZones:    workout.multiZones,
    load:          workout.load,
    savedAt:       new Date().toISOString(),
  };
}

export function useHistory() {
  const [history,   setHistory]   = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [storageOk, setStorageOk] = useState(false);

  // â”€â”€ Storage abstraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Tries window.storage (Claude artifact persistent store).
  // Falls back to a session-scoped in-memory Map if unavailable.
  const memStore = useRef(new Map());

  const store = {
    async get(key) {
      try {
        if (window.storage) {
          const r = await window.storage.get(key);
          return r ? r.value : null;
        }
      } catch {}
      return memStore.current.has(key) ? memStore.current.get(key) : null;
    },
    async set(key, value) {
      try {
        if (window.storage) {
          await window.storage.set(key, value);
          return true;
        }
      } catch {}
      memStore.current.set(key, value);
      return true;
    },
    async del(key) {
      try {
        if (window.storage) await window.storage.delete(key);
      } catch {}
      memStore.current.delete(key);
    },
  };

  // â”€â”€ Detect storage availability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    (async () => {
      let ok = false;
      try {
        if (typeof window.storage !== 'undefined' && window.storage) {
          // Probe with a test write
          await window.storage.set('fit:probe', '1');
          await window.storage.delete('fit:probe');
          ok = true;
        }
      } catch {}
      setStorageOk(ok);

      // Load saved workouts (from persistent or memory store)
      try {
        const indexRaw = await store.get('fit:index');
        const index    = indexRaw ? JSON.parse(indexRaw) : [];
        const summaries = await Promise.all(
          index.map(async (date) => {
            try {
              const r = await store.get(`fit:${date}`);
              return r ? JSON.parse(r) : null;
            } catch { return null; }
          })
        );
        setHistory(summaries.filter(Boolean));
      } catch {}

      setLoadingDb(false);
    })();
  }, []);

  // â”€â”€ Save a workout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const saveWorkout = useCallback(async (workout) => {
    try {
      const summary = summarize(workout);
      const key     = `fit:${workout.date}`;

      await store.set(key, JSON.stringify(summary));

      if (workout.timeSeries?.length) {
        await store.set(`${key}:ts`, JSON.stringify(
          workout.timeSeries.filter((_, i) => i % 4 === 0)
        ));
      }

      const existing = history.map(h => h.date);
      const newIndex = [workout.date, ...existing.filter(d => d !== workout.date)];
      await store.set('fit:index', JSON.stringify(newIndex));

      setHistory(prev => {
        const filtered = prev.filter(h => h.date !== workout.date);
        return [summary, ...filtered].sort((a,b) => b.date.localeCompare(a.date));
      });
      return true;
    } catch (e) {
      console.error('[useHistory] save failed', e);
      return false;
    }
  }, [history]);

  // â”€â”€ Delete a workout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const deleteWorkout = useCallback(async (date) => {
    try {
      await store.del(`fit:${date}`);
      await store.del(`fit:${date}:ts`);
      const newHistory = history.filter(h => h.date !== date);
      await store.set('fit:index', JSON.stringify(newHistory.map(h => h.date)));
      setHistory(newHistory);
    } catch (e) {
      console.error('[useHistory] delete failed', e);
    }
  }, [history]);

  // â”€â”€ Recent N workouts for AI context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const recentWorkouts = useCallback((n = 10) => {
    return history.slice(0, n);
  }, [history]);

  // â”€â”€ Aggregate stats for a period â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const aggregateStats = useCallback((workouts) => {
    if (!workouts.length) return null;
    return {
      count:        workouts.length,
      totalDistKm:  parseFloat((workouts.reduce((s,w) => s + (w.distance||0), 0) / 1000).toFixed(1)),
      totalActiveH: parseFloat((workouts.reduce((s,w) => s + (w.duration?.active||0), 0) / 3600).toFixed(1)),
      totalAscent:  workouts.reduce((s,w) => s + (w.elevation?.ascent||0), 0),
      totalCals:    workouts.reduce((s,w) => s + (w.calories||0), 0),
      avgHr:        Math.round(workouts.reduce((s,w) => s + (w.heartRate?.avg||0), 0) / workouts.length),
      avgTE:        parseFloat((workouts.reduce((s,w) => s + (w.trainingEffect?.aerobic||0), 0) / workouts.length).toFixed(1)),
      highLoadDays: workouts.filter(w => w.load?.level === 'high').length,
    };
  }, []);

  return { history, loadingDb, storageOk, saveWorkout, deleteWorkout, recentWorkouts, aggregateStats };
}
