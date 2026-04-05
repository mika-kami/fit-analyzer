import { useMemo, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
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
    dailyCheckins: {},
    workoutNotes: {},
  };
}

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    return {
      profile: { ...DEFAULT_ATHLETE_PROFILE, ...(parsed?.profile || {}) },
      dailyCheckins: parsed?.dailyCheckins || {},
      workoutNotes: parsed?.workoutNotes || {},
    };
  } catch {
    return initialState();
  }
}

function mapProfileFromDb(row) {
  if (!row) return null;
  return {
    targetSport: row.target_sport,
    primaryGoal: row.primary_goal,
    goalDate: row.goal_date,
    weeklyHours: Number(row.weekly_hours ?? 6),
    constraints: row.constraints,
    injuryNotes: row.injury_notes,
    medical: row.medical_profile ?? {},
  };
}

function mapCheckinFromDb(row) {
  return {
    date: row.checkin_date,
    sleepScore: row.sleep_score,
    healthScore: row.health_score,
    weatherScore: row.weather_score,
    energy: row.energy,
    motivation: row.motivation,
    soreness: row.soreness,
    stress: row.stress,
    restingHrDelta: row.resting_hr_delta,
    sleepHours: Number(row.sleep_hours ?? 0),
  };
}

function parseWorkoutKey(workoutKey) {
  if (!workoutKey) return { workoutId: null, workoutDate: null };
  if (String(workoutKey).startsWith('date:')) {
    return { workoutId: null, workoutDate: String(workoutKey).slice(5) };
  }
  const id = Number(workoutKey);
  if (Number.isFinite(id)) return { workoutId: id, workoutDate: null };
  return { workoutId: null, workoutDate: null };
}

export function useCoachState(userId) {
  const key = useMemo(() => storageKey(userId), [userId]);
  const [state, setState] = useState(initialState);

  const persistLocal = useCallback((next) => {
    setState(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }, [key]);

  useEffect(() => {
    let alive = true;
    const localState = readLocal(key);

    async function load() {
      if (!userId) {
        if (alive) setState(localState);
        return;
      }

      const [profileRes, checkinsRes, notesRes] = await Promise.all([
        supabase.from('athlete_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('daily_readiness_checkins').select('*').eq('user_id', userId),
        supabase.from('workout_reflections').select('*').eq('user_id', userId),
      ]);

      const dbProfile = profileRes?.data ? mapProfileFromDb(profileRes.data) : null;

      const dbCheckins = {};
      for (const row of checkinsRes?.data || []) {
        dbCheckins[row.checkin_date] = mapCheckinFromDb(row);
      }

      const dbNotes = {};
      for (const row of notesRes?.data || []) {
        const note = {
          purpose: row.purpose,
          rpe: row.rpe,
          pain: row.pain,
          felt: row.felt,
          notes: row.notes,
        };
        if (row.workout_id != null) dbNotes[String(row.workout_id)] = note;
        else if (row.workout_date) dbNotes[`date:${row.workout_date}`] = note;
      }

      const merged = {
        profile: { ...DEFAULT_ATHLETE_PROFILE, ...(dbProfile || localState.profile) },
        dailyCheckins: Object.keys(dbCheckins).length ? dbCheckins : localState.dailyCheckins,
        workoutNotes: Object.keys(dbNotes).length ? dbNotes : localState.workoutNotes,
      };

      if (!alive) return;
      setState(merged);
      try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
    }

    load().catch(() => {
      if (alive) setState(localState);
    });

    return () => { alive = false; };
  }, [key, userId]);

  const saveProfile = useCallback(async (patch) => {
    const next = {
      ...state,
      profile: { ...state.profile, ...patch },
    };
    persistLocal(next);

    if (!userId) return;
    const payload = {
      user_id: userId,
      target_sport: next.profile.targetSport ?? 'mixed',
      primary_goal: next.profile.primaryGoal ?? '',
      goal_date: next.profile.goalDate || null,
      weekly_hours: next.profile.weeklyHours ?? 6,
      constraints: next.profile.constraints ?? '',
      injury_notes: next.profile.injuryNotes ?? '',
      medical_profile: next.profile.medical ?? {},
    };
    await supabase.from('athlete_profiles').upsert(payload, { onConflict: 'user_id' });
  }, [persistLocal, state, userId]);

  const saveDailyCheckin = useCallback(async (dateIso, payload) => {
    const base = defaultDailyCheckin(dateIso);
    const nextCheckin = { ...base, ...(state.dailyCheckins?.[dateIso] || {}), ...payload, date: dateIso };
    const next = {
      ...state,
      dailyCheckins: { ...state.dailyCheckins, [dateIso]: nextCheckin },
    };
    persistLocal(next);

    if (!userId) return;
    const row = {
      user_id: userId,
      checkin_date: dateIso,
      sleep_score: nextCheckin.sleepScore ?? 70,
      health_score: nextCheckin.healthScore ?? 75,
      weather_score: nextCheckin.weatherScore ?? 70,
      energy: nextCheckin.energy ?? 6,
      motivation: nextCheckin.motivation ?? 7,
      soreness: nextCheckin.soreness ?? 3,
      stress: nextCheckin.stress ?? 4,
      resting_hr_delta: nextCheckin.restingHrDelta ?? 0,
      sleep_hours: nextCheckin.sleepHours ?? 7.5,
    };
    await supabase.from('daily_readiness_checkins').upsert(row, { onConflict: 'user_id,checkin_date' });
  }, [persistLocal, state, userId]);

  const saveWorkoutNote = useCallback(async (workoutKey, payload) => {
    if (!workoutKey) return;
    const nextNote = { ...(state.workoutNotes?.[workoutKey] || {}), ...payload };
    const next = {
      ...state,
      workoutNotes: { ...state.workoutNotes, [workoutKey]: nextNote },
    };
    persistLocal(next);

    if (!userId) return;
    const { workoutId, workoutDate } = parseWorkoutKey(workoutKey);
    const row = {
      user_id: userId,
      workout_id: workoutId,
      workout_date: workoutDate,
      purpose: nextNote.purpose ?? '',
      rpe: nextNote.rpe ?? 6,
      pain: nextNote.pain ?? 1,
      felt: nextNote.felt ?? '',
      notes: nextNote.notes ?? '',
    };

    let existingId = null;
    if (workoutId != null) {
      const { data } = await supabase
        .from('workout_reflections')
        .select('id')
        .eq('user_id', userId)
        .eq('workout_id', workoutId)
        .maybeSingle();
      existingId = data?.id ?? null;
    } else if (workoutDate) {
      const { data } = await supabase
        .from('workout_reflections')
        .select('id')
        .eq('user_id', userId)
        .is('workout_id', null)
        .eq('workout_date', workoutDate)
        .maybeSingle();
      existingId = data?.id ?? null;
    }

    if (existingId) {
      await supabase.from('workout_reflections').update(row).eq('id', existingId);
    } else {
      await supabase.from('workout_reflections').insert(row);
    }
  }, [persistLocal, state, userId]);

  const saveWeeklyPlan = useCallback(async (payload) => {
    if (!userId || !payload?.weekStartDate || !payload?.planSport) return;
    await supabase.from('coach_weekly_plans').upsert({
      user_id: userId,
      week_start_date: payload.weekStartDate,
      plan_sport: payload.planSport,
      coherence_score: payload.coherenceScore ?? 0,
      required_readiness: payload.requiredReadiness ?? 0,
      chosen_readiness: payload.chosenReadiness ?? 0,
      fallback_used: !!payload.fallbackUsed,
      alignment_reason: payload.alignmentReason ?? '',
      prescription: payload.prescription ?? {},
      aligned_days: payload.alignedDays ?? [],
    }, { onConflict: 'user_id,week_start_date,plan_sport' });
  }, [userId]);

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
    saveWeeklyPlan,
    todayIso: todayIso(),
  };
}

