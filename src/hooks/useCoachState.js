import { useMemo, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { DEFAULT_ATHLETE_PROFILE, defaultDailyCheckin, defaultWorkoutReflection } from '../core/coachEngine.js';
import { buildAthleteDigest } from '../core/coachDigest.js';
import { generateMesocycle } from '../core/trainingEngine.js';
import { describeWeekPlan, buildDescribeContext } from '../core/coachPlanMatcher.js';
import { calcTrainingLoad } from '../core/trainingEngine.js';
import { localDateIso } from '../core/format.js';

function todayIso() {
  return localDateIso();
}

function storageKey(userId) {
  return `coach_state_v1_${userId || 'anon'}`;
}

function digestStorageKey(userId) {
  return `coach_athlete_digest_${userId || 'anon'}`;
}

function readDigest(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeDigest(key, digest) {
  try {
    localStorage.setItem(key, digest || '');
  } catch {}
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

function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const today = new Date();
  const dob   = new Date(birthday);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function mapProfileFromDb(row) {
  if (!row) return null;
  const birthday = row.birthday ?? null;
  return {
    targetSport: row.target_sport,
    primaryGoal: row.primary_goal,
    goalDate:    row.goal_date,
    weeklyHours: Number(row.weekly_hours ?? 6),
    constraints: row.constraints,
    injuryNotes: row.injury_notes,
    medical:     row.medical_profile ?? {},
    birthday,
    age:         ageFromBirthday(birthday),
    weightKg:    row.weight_kg != null ? Number(row.weight_kg) : null,
    heightCm:    row.height_cm != null ? Number(row.height_cm) : null,
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

function mesocycleStorageKey(userId) {
  return `coach_mesocycle_v1_${userId || 'anon'}`;
}

function readMesocycle(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeMesocycle(key, mc) {
  try {
    localStorage.setItem(key, mc ? JSON.stringify(mc) : '');
  } catch {}
}

function mapMesocycleFromDb(row) {
  if (!row) return null;
  const weeks = Array.isArray(row.weeks) ? row.weeks : [];
  const generatedBy = row.generated_by ?? 'template';
  const meta = { ...(row.meta || {}), aiGenerated: generatedBy === 'ai' };
  if (!meta.totalWeeks) meta.totalWeeks = weeks.length || 0;

  const today = localDateIso();
  const idx = weeks.findIndex((wk) => today >= wk?.startDate && today <= wk?.endDate);

  return {
    id:               row.id ?? null,
    weeks,
    meta,
    generatedBy,
    revisionNo:       row.revision_no ?? null,
    status:           row.status ?? null,
    pausedAt:         row.paused_at ?? null,
    effectiveFrom:    row.effective_from ?? null,
    lockedBeforeDate: row.locked_before_date ?? null,
    currentWeekIndex: Math.max(0, idx),
  };
}

function addDaysIso(isoDate, delta) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function firstUncompletedPlannedDate(weeks = [], historyWorkouts = [], todayIsoValue = todayIso()) {
  const done = new Set((historyWorkouts || []).map((w) => w?.date).filter(Boolean));
  const planned = [];
  for (const wk of weeks || []) {
    for (const day of wk?.days || []) {
      if (!day?.dateIso) continue;
      if (day.type === 'rest') continue;
      if (day.dateIso < todayIsoValue) continue;
      planned.push(day.dateIso);
    }
  }
  planned.sort();
  const next = planned.find((d) => !done.has(d));
  return next || todayIsoValue;
}

function mergeWeeksByPivot(oldWeeks = [], newWeeks = [], pivotDate) {
  const oldByDate = new Map();
  for (const wk of oldWeeks || []) {
    for (const d of wk?.days || []) {
      if (d?.dateIso) oldByDate.set(d.dateIso, d);
    }
  }
  return (newWeeks || []).map((wk) => ({
    ...wk,
    days: (wk.days || []).map((d) => {
      if (!d?.dateIso) return d;
      if (d.dateIso < pivotDate && oldByDate.has(d.dateIso)) return oldByDate.get(d.dateIso);
      return d;
    }),
  }));
}

export function useCoachState(userId) {
  const key = useMemo(() => storageKey(userId), [userId]);
  const digestKey = useMemo(() => digestStorageKey(userId), [userId]);
  const mcKey = useMemo(() => mesocycleStorageKey(userId), [userId]);
  const [state, setState] = useState(initialState);
  const [athleteDigest, setAthleteDigest] = useState(() => readDigest(digestKey));
  const [mesocycle, setMesocycle] = useState(() => readMesocycle(mesocycleStorageKey(userId)));
  const [labValues, setLabValues] = useState([]);

  const fetchSharedMedicalDocs = useCallback(async () => {
    if (!userId) return [];
    const { data, error } = await supabase
      .from('medical_documents')
      .select('key_findings')
      .eq('user_id', userId)
      .eq('share_with_coach', true)
      .neq('key_findings', '');
    if (error) throw error;
    return data ?? [];
  }, [userId]);

  const rebuildAthleteDigest = useCallback(async (profileOverride) => {
    const baseProfile = profileOverride ? { ...state.profile, ...profileOverride } : state.profile;
    try {
      const docs = await fetchSharedMedicalDocs();
      const digest = buildAthleteDigest(baseProfile, docs);
      setAthleteDigest(digest);
      writeDigest(digestKey, digest);
      return digest;
    } catch {
      const digest = buildAthleteDigest(baseProfile, []);
      setAthleteDigest(digest);
      writeDigest(digestKey, digest);
      return digest;
    }
  }, [state.profile, fetchSharedMedicalDocs, digestKey]);

  const persistLocal = useCallback((next) => {
    setState(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }, [key]);

  useEffect(() => {
    let alive = true;
    const localState = readLocal(key);
    const localDigest = readDigest(digestKey);
    const localMesocycle = readMesocycle(mcKey);
    setAthleteDigest(localDigest);
    setMesocycle(localMesocycle);

    async function load() {
      if (!userId) {
        if (alive) {
          setState(localState);
          setMesocycle(localMesocycle);
          if (!localDigest) {
            const digest = buildAthleteDigest(localState.profile, []);
            setAthleteDigest(digest);
            writeDigest(digestKey, digest);
          }
        }
        return;
      }

      const [profileRes, checkinsRes, notesRes, mesocycleRes] = await Promise.all([
        supabase.from('athlete_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('daily_readiness_checkins').select('*').eq('user_id', userId),
        supabase.from('workout_reflections').select('*').eq('user_id', userId),
        supabase
          .from('mesocycles')
          .select('id,weeks,meta,revision_no,status,effective_from,locked_before_date,generated_by,paused_at')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
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
      const dbMesocycle = mapMesocycleFromDb(mesocycleRes?.data);
      const nextMesocycle = dbMesocycle || localMesocycle;
      setMesocycle(nextMesocycle);
      writeMesocycle(mcKey, nextMesocycle);
      const [docs, labRes] = await Promise.all([
        fetchSharedMedicalDocs().catch(() => []),
        supabase.from('lab_values').select('*').eq('user_id', userId).order('test_date', { ascending: false }).catch(() => ({ data: [] })),
      ]);
      if (alive && labRes?.data?.length) setLabValues(labRes.data);
      const digest = buildAthleteDigest(merged.profile, docs);
      setAthleteDigest(digest);
      writeDigest(digestKey, digest);
    }

    load().catch(() => {
      if (alive) setState(localState);
    });

    return () => { alive = false; };
  }, [key, userId, digestKey, mcKey, fetchSharedMedicalDocs]);

  const saveProfile = useCallback(async (patch) => {
    const next = {
      ...state,
      profile: { ...state.profile, ...patch },
    };
    persistLocal(next);

    if (!userId) {
      await rebuildAthleteDigest(next.profile);
      return;
    }
    const payload = {
      user_id:         userId,
      target_sport:    next.profile.targetSport ?? 'mixed',
      primary_goal:    next.profile.primaryGoal ?? '',
      goal_date:       next.profile.goalDate || null,
      weekly_hours:    next.profile.weeklyHours ?? 6,
      constraints:     next.profile.constraints ?? '',
      injury_notes:    next.profile.injuryNotes ?? '',
      medical_profile: next.profile.medical ?? {},
      birthday:        next.profile.birthday || null,
      weight_kg:       next.profile.weightKg != null ? Number(next.profile.weightKg) : null,
      height_cm:       next.profile.heightCm != null ? Number(next.profile.heightCm) : null,
    };
    await supabase.from('athlete_profiles').upsert(payload, { onConflict: 'user_id' });
    await rebuildAthleteDigest(next.profile);
  }, [persistLocal, state, userId, rebuildAthleteDigest]);

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

  const _commitMesocycleRevision = useCallback(async (mc, opts = {}) => {
    if (!userId || !mc?.weeks?.length) return null;
    const kind = opts.kind ?? 'initial';
    const reason = opts.reason ?? 'manual_regenerate';
    const generatedBy = opts.generatedBy ?? 'template';
    const historyWorkouts = opts.historyWorkouts ?? [];
    try {
      const { data: activeRows, error: activeError } = await supabase
        .from('mesocycles')
        .select('id,revision_no,weeks,meta')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(20);
      if (activeError) throw activeError;

      const current = activeRows?.[0] ?? null;
      const pivotDate = kind === 'future_adjustment'
        ? firstUncompletedPlannedDate(current?.weeks || mc.weeks, historyWorkouts, todayIso())
        : (mc.meta?.planStartDate || mc.meta?.startDate || todayIso());

      const mergedWeeks = kind === 'future_adjustment'
        ? mergeWeeksByPivot(current?.weeks || [], mc.weeks || [], pivotDate)
        : mc.weeks;

      const mergedMc = {
        ...mc,
        weeks: mergedWeeks,
        meta: {
          ...(mc.meta || {}),
          revisionKind: kind,
          pivotDate,
        },
      };

      if (activeRows?.length) {
        await supabase
          .from('mesocycles')
          .update({
            is_active: false,
            status: 'superseded',
            effective_to: addDaysIso(pivotDate, -1),
          })
          .in('id', activeRows.map((r) => r.id));
      }

      const insertPayload = {
        user_id: userId,
        goal_date: mergedMc.meta.goalDate || null,
        goal_description: mergedMc.meta.goal || null,
        total_weeks: mergedMc.meta.totalWeeks,
        weeks: mergedMc.weeks,
        meta: mergedMc.meta,
        is_active: true,
        status: 'active',
        revision_no: (current?.revision_no ?? 0) + 1,
        parent_mesocycle_id: current?.id ?? null,
        effective_from: pivotDate,
        effective_to: null,
        locked_before_date: pivotDate,
        change_reason: reason,
        plan_kind: kind,
        generated_by: generatedBy,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('mesocycles')
        .insert(insertPayload)
        .select('id,revision_no,status,effective_from,locked_before_date')
        .single();
      if (insertError) throw insertError;

      const committed = {
        ...mergedMc,
        id: inserted?.id ?? null,
        revisionNo: inserted?.revision_no ?? null,
        status: inserted?.status ?? 'active',
        effectiveFrom: inserted?.effective_from ?? pivotDate,
        lockedBeforeDate: inserted?.locked_before_date ?? pivotDate,
      };
      setMesocycle(committed);
      writeMesocycle(mcKey, committed);
      return committed;
    } catch (e) {
      console.error('[useCoachState] mesocycle commit failed', e);
      return null;
    }
  }, [userId, mcKey]);

  const regenerateMesocycle = useCallback(async (historyWorkouts = [], startDate = null, weather = null, profileOverrides = null) => {
    const profileForPlan = profileOverrides ? { ...state.profile, ...profileOverrides } : state.profile;

    // 1) Generate synchronously and show preview immediately.
    const mc = generateMesocycle(profileForPlan, historyWorkouts, startDate);
    setMesocycle(mc);
    writeMesocycle(mcKey, mc);

    // 2) Enrich current week only (~2k tokens). If it fails, commit raw plan.
    let finalMc = mc;
    const cwIdx = mc.currentWeekIndex ?? 0;
    const currentWeekDays = mc.weeks?.[cwIdx]?.days;
    if (currentWeekDays?.length) {
      try {
        const ctx = buildDescribeContext({
          athleteDigest,
          recentWorkouts: (historyWorkouts ?? []).slice(0, 6),
          load: calcTrainingLoad(historyWorkouts ?? []),
          readiness: null,
          weather,
          sport: mc.meta?.sport ?? state.profile?.targetSport ?? 'running',
        });
        const enrichedDays = await describeWeekPlan(currentWeekDays, ctx);
        const enrichedMc = {
          ...mc,
          weeks: mc.weeks.map((w, i) =>
            i === cwIdx ? { ...w, days: enrichedDays } : w
          ),
        };
        finalMc = enrichedMc;
      } catch {
        // keep raw
      }
    }

    const committed = await _commitMesocycleRevision(finalMc, {
      kind: 'initial',
      reason: 'manual_regenerate',
      historyWorkouts,
    });
    return committed || finalMc;
  }, [state.profile, athleteDigest, mcKey, _commitMesocycleRevision]);

  const updateFutureMesocycle = useCallback(async (historyWorkouts = [], weather = null, profileOverrides = null) => {
    const profileForPlan = profileOverrides ? { ...state.profile, ...profileOverrides } : state.profile;
    const existing = mesocycle;
    const startDate = existing?.meta?.planStartDate || existing?.meta?.startDate || null;

    const candidate = generateMesocycle(profileForPlan, historyWorkouts, startDate);
    setMesocycle(candidate);
    writeMesocycle(mcKey, candidate);

    let finalCandidate = candidate;
    const cwIdx = candidate.currentWeekIndex ?? 0;
    const currentWeekDays = candidate.weeks?.[cwIdx]?.days;
    if (currentWeekDays?.length) {
      try {
        const ctx = buildDescribeContext({
          athleteDigest,
          recentWorkouts: (historyWorkouts ?? []).slice(0, 6),
          load: calcTrainingLoad(historyWorkouts ?? []),
          readiness: null,
          weather,
          sport: candidate.meta?.sport ?? state.profile?.targetSport ?? 'running',
        });
        const enrichedDays = await describeWeekPlan(currentWeekDays, ctx);
        finalCandidate = {
          ...candidate,
          weeks: candidate.weeks.map((w, i) =>
            i === cwIdx ? { ...w, days: enrichedDays } : w
          ),
        };
      } catch {
        // keep raw
      }
    }

    const committed = await _commitMesocycleRevision(finalCandidate, {
      kind: 'future_adjustment',
      reason: 'manual_update_future',
      generatedBy: existing?.generatedBy ?? (existing?.meta?.aiGenerated ? 'ai' : 'template'),
      historyWorkouts,
    });
    return committed || finalCandidate;
  }, [state.profile, mesocycle, mcKey, athleteDigest, _commitMesocycleRevision]);

  const enrichWeekDays = useCallback(async (weekIndex, weekDays, weather = null, historyWorkouts = [], sport = 'running') => {
    if (!weekDays?.length) return;
    try {
      const ctx = buildDescribeContext({
        athleteDigest,
        recentWorkouts: (historyWorkouts ?? []).slice(0, 6),
        load: calcTrainingLoad(historyWorkouts ?? []),
        readiness: null,
        weather,
        sport,
      });
      const enrichedDays = await describeWeekPlan(weekDays, ctx);
      setMesocycle(prev => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          weeks: prev.weeks.map((w, i) =>
            i === weekIndex ? { ...w, days: enrichedDays } : w
          ),
        };
        writeMesocycle(mcKey, updated);
        return updated;
      });
    } catch {
      // Silent — user still sees raw plan
    }
  }, [athleteDigest, mcKey]);

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

  const pauseMesocycle = useCallback(async () => {
    if (!mesocycle) return;
    const pausedAt = new Date().toISOString();
    const updated = { ...mesocycle, status: 'paused', pausedAt };
    setMesocycle(updated);
    writeMesocycle(mcKey, updated);
    if (userId && mesocycle.id) {
      await supabase.from('mesocycles')
        .update({ status: 'paused', paused_at: pausedAt })
        .eq('id', mesocycle.id);
    }
  }, [mesocycle, mcKey, userId]);

  const resumeMesocycle = useCallback(async (historyWorkouts = []) => {
    if (!mesocycle) return;

    // Evaluate whether future weeks need recalculation.
    // Criteria: paused ≥ 3 days, OR current date has moved past the plan's current-week end.
    const pausedAt   = mesocycle.pausedAt ?? mesocycle.effectiveFrom ?? null;
    const daysPaused = pausedAt
      ? Math.floor((Date.now() - new Date(pausedAt).getTime()) / 86400000)
      : 0;
    const currentWeek = mesocycle.weeks?.[mesocycle.currentWeekIndex ?? 0];
    const pastCurrentWeek = currentWeek?.endDate ? localDateIso() > currentWeek.endDate : false;
    const needsUpdate = daysPaused >= 3 || pastCurrentWeek;

    if (needsUpdate) {
      // Delegate to updateFutureMesocycle — it preserves past weeks and keeps generated_by
      return updateFutureMesocycle(historyWorkouts);
    }

    // No structural change needed — just flip status back to active
    const updated = { ...mesocycle, status: 'active', pausedAt: null };
    setMesocycle(updated);
    writeMesocycle(mcKey, updated);
    if (userId && mesocycle.id) {
      await supabase.from('mesocycles')
        .update({ status: 'active', paused_at: null })
        .eq('id', mesocycle.id);
    }
    return updated;
  }, [mesocycle, mcKey, userId, updateFutureMesocycle]);

  const saveAIMesocycle = useCallback(async (aiMc, historyWorkouts = []) => {
    if (!aiMc?.weeks?.length) return null;
    // Show immediately in local state, then persist
    setMesocycle(aiMc);
    writeMesocycle(mcKey, aiMc);
    const committed = await _commitMesocycleRevision(aiMc, {
      kind: 'initial',
      reason: 'ai_generated',
      generatedBy: 'ai',
      historyWorkouts,
    });
    return committed || aiMc;
  }, [mcKey, _commitMesocycleRevision]);

  return {
    profile: state.profile,
    athleteDigest,
    rebuildAthleteDigest,
    saveProfile,
    getDailyCheckin,
    saveDailyCheckin,
    getWorkoutNote,
    saveWorkoutNote,
    saveWeeklyPlan,
    mesocycle,
    regenerateMesocycle,
    updateFutureMesocycle,
    pauseMesocycle,
    resumeMesocycle,
    enrichWeekDays,
    saveAIMesocycle,
    labValues,
    todayIso: todayIso(),
  };
}
