import { useMemo, useState, useEffect, useCallback } from 'react';
import { DEFAULT_ATHLETE_PROFILE, defaultDailyCheckin, defaultWorkoutReflection } from '../core/coachEngine.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function storageKey(userId) {
  return `coach_state_v1_${userId || 'anon'}`;
}

function initialState() {
  return {
    profile: { ...DEFAULT_ATHLETE_PROFILE },
    dailyCheckins: {},   // date -> checkin
    workoutNotes: {},    // workoutId|date -> note
  };
}

export function useCoachState(userId) {
  const key = useMemo(() => storageKey(userId), [userId]);
  const [state, setState] = useState(initialState);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setState(initialState());
        return;
      }
      const parsed = JSON.parse(raw);
      setState({
        profile: { ...DEFAULT_ATHLETE_PROFILE, ...(parsed?.profile || {}) },
        dailyCheckins: parsed?.dailyCheckins || {},
        workoutNotes: parsed?.workoutNotes || {},
      });
    } catch {
      setState(initialState());
    }
  }, [key]);

  const persist = useCallback((next) => {
    setState(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }, [key]);

  const saveProfile = useCallback((patch) => {
    const next = {
      ...state,
      profile: { ...state.profile, ...patch },
    };
    persist(next);
  }, [state, persist]);

  const saveDailyCheckin = useCallback((dateIso, payload) => {
    const base = defaultDailyCheckin(dateIso);
    const nextCheckin = { ...base, ...(state.dailyCheckins?.[dateIso] || {}), ...payload, date: dateIso };
    const next = {
      ...state,
      dailyCheckins: { ...state.dailyCheckins, [dateIso]: nextCheckin },
    };
    persist(next);
  }, [state, persist]);

  const saveWorkoutNote = useCallback((workoutKey, payload) => {
    if (!workoutKey) return;
    const nextNote = { ...(state.workoutNotes?.[workoutKey] || {}), ...payload };
    const next = {
      ...state,
      workoutNotes: { ...state.workoutNotes, [workoutKey]: nextNote },
    };
    persist(next);
  }, [state, persist]);

  const getDailyCheckin = useCallback((dateIso = todayIso()) => {
    return state.dailyCheckins?.[dateIso] || defaultDailyCheckin(dateIso);
  }, [state.dailyCheckins]);

  const getWorkoutNote = useCallback((workout) => {
    const keyById = workout?.id ? String(workout.id) : null;
    const keyByDate = workout?.date ? `date:${workout.date}` : null;
    if (keyById && state.workoutNotes?.[keyById]) return state.workoutNotes[keyById];
    if (keyByDate && state.workoutNotes?.[keyByDate]) return state.workoutNotes[keyByDate];
    return defaultWorkoutReflection(workout);
  }, [state.workoutNotes]);

  return {
    profile: state.profile,
    saveProfile,
    getDailyCheckin,
    saveDailyCheckin,
    getWorkoutNote,
    saveWorkoutNote,
    todayIso: todayIso(),
  };
}
