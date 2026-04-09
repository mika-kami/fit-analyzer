/**
 * useAlerts.js — React hook: evaluates alert rules, tracks dismissed state.
 */
import { useMemo, useState, useCallback } from 'react';
import { evaluateAlerts } from '../core/alertEngine.js';

const DISMISSED_KEY = 'coach_dismissed_alerts_v1';

function readDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function writeDismissed(set) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {}
}

export function useAlerts({ load, readiness, historyWorkouts, profile, mesocycle, gear, dailyCheckins, acwr }) {
  const [dismissed, setDismissed] = useState(readDismissed);

  const context = useMemo(() => ({
    load,
    readiness,
    historyWorkouts: historyWorkouts ?? [],
    profile,
    medicalProfile: profile?.medical ?? {},
    mesocycle,
    gear: gear ?? [],
    dailyCheckins: dailyCheckins ?? {},
    acwr,
  }), [load, readiness, historyWorkouts, profile, mesocycle, gear, dailyCheckins, acwr]);

  const allAlerts = useMemo(() => evaluateAlerts(context), [context]);

  const activeAlerts = useMemo(() =>
    allAlerts.filter(a => !dismissed.has(a.id)),
    [allAlerts, dismissed]
  );

  const dismiss = useCallback((id) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  }, []);

  return { alerts: activeAlerts, dismiss };
}
