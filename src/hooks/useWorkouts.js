/**
 * useWorkouts.js — Replaces useHistory.js for production.
 * Stores workouts in Supabase instead of window.storage.
 * API is compatible with useHistory so Dashboard/HistoryTab need no changes.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { parseFit } from '../core/fitParser.js';
import { buildWorkoutModel } from '../core/workoutAnalyzer.js';

// Convert WorkoutModel → DB row
function toRow(workout, userId) {
  return {
    user_id:      userId,
    workout_date: workout.date,
    start_time:   workout.startTime,
    sport:        workout.sportLabel,
    source:       workout.source ?? 'upload',
    distance_m:   Math.round(workout.distance ?? 0),
    duration_s:   Math.round(workout.duration?.active ?? 0),
    calories:     workout.calories ?? 0,
    avg_hr:       workout.heartRate?.avg ?? null,
    max_hr:       workout.heartRate?.max ?? null,
    ascent_m:     workout.elevation?.ascent ?? null,
    aerobic_te:   workout.trainingEffect?.aerobic ?? null,
    load_level:   workout.load?.level ?? null,
    summary_json: {
      // Store everything needed for Dashboard cards + Plan
      date:            workout.date,
      startTime:       workout.startTime,
      sport:           workout.sportLabel,
      sportLabel:      workout.sportLabel,
      bike:            workout.bike,
      fileName:        workout.fileName,
      distance:        workout.distance,
      duration:        workout.duration,
      calories:        workout.calories,
      heartRate:       workout.heartRate,
      speed:           workout.speed,
      elevation:       workout.elevation,
      trainingEffect:  workout.trainingEffect,
      hrZones:         workout.hrZones,
      multiZones:      workout.multiZones,
      load:            workout.load,
      thresholdHr:     workout.thresholdHr,
      recommendations: workout.recommendations,
      // Downsample timeSeries to every 4th point (~60KB) for Charts + Map
      timeSeries: (workout.timeSeries ?? []).filter((_, i) => i % 4 === 0),
    },
  };
}

// Convert DB row → WorkoutSummary (for cards + plan)
function fromRow(row) {
  return {
    ...row.summary_json,
    id:           row.id,
    date:         row.workout_date,
    // Ensure timeSeries is always an array (old rows may not have it)
    timeSeries:   row.summary_json?.timeSeries ?? [],
  };
}

export function useWorkouts(user) {
  const [history,   setHistory]   = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [error,     setError]     = useState(null);

  // Load workouts from Supabase on mount / user change
  useEffect(() => {
    if (!user) { setHistory([]); setLoadingDb(false); return; }

    setLoadingDb(true);
    supabase
      .from('workouts')
      .select('*')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); }
        else     { setHistory((data ?? []).map(fromRow)); }
        setLoadingDb(false);
      });
  }, [user?.id]);

  // Save a parsed WorkoutModel + optionally upload the FIT file
  const saveWorkout = useCallback(async (workout, fitFile = null) => {
    if (!user) return false;
    try {
      const row = toRow(workout, user.id);

      // Upload FIT to Storage if provided
      if (fitFile) {
        const path = `${user.id}/${workout.date}_${workout.startTime?.replace(':','')}.fit`;
        const { error: uploadErr } = await supabase.storage
          .from('fit-files')
          .upload(path, fitFile, { upsert: true });
        if (!uploadErr) row.fit_path = path;
      }

      // Upsert workout (update if same date+source exists)
      // Insert new workout; if same date already exists, update it
      const existing = history.find(h => h.date === workout.date);
      const { data, error: dbErr } = existing?.id
        ? await supabase.from('workouts').update(row).eq('id', existing.id).select().single()
        : await supabase.from('workouts').insert(row).select().single();

      if (dbErr) throw dbErr;

      setHistory(prev => {
        const filtered = prev.filter(w => w.date !== workout.date);
        return [fromRow(data), ...filtered].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      });
      return true;
    } catch (e) {
      console.error('[useWorkouts] save failed', e);
      setError(e.message);
      return false;
    }
  }, [user]);

  // Delete a workout
  const deleteWorkout = useCallback(async (date) => {
    if (!user) return;
    const w = history.find(h => h.date === date);
    if (!w) return;

    // Delete FIT file from storage if exists
    if (w.fit_path) {
      await supabase.storage.from('fit-files').remove([w.fit_path]);
    }

    const { error: dbErr } = await supabase
      .from('workouts')
      .delete()
      .eq('id', w.id)
      .eq('user_id', user.id);

    if (!dbErr) setHistory(prev => prev.filter(h => h.date !== date));
  }, [user, history]);

  // Parse and save a new FIT file directly
  const uploadFit = useCallback(async (file) => {
    if (!user) throw new Error('Not logged in');
    const buffer  = await file.arrayBuffer();
    const fitData = parseFit(buffer);
    const model   = buildWorkoutModel(fitData, file.name);
    await saveWorkout(model, file);
    return model;
  }, [user, saveWorkout]);

  // Recent N workouts for AI context (same API as useHistory)
  const recentWorkouts = useCallback((n = 10) => {
    return history.slice(0, n);
  }, [history]);

  // Aggregate stats for a period (same API as useHistory)
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

  // Chat messages
  const getChatHistory = useCallback(async (workoutId = null) => {
    if (!user) return [];
    const q = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (workoutId) q.eq('workout_id', workoutId);
    const { data } = await q.limit(50);
    return (data ?? []).map(m => ({ role: m.role, content: m.content }));
  }, [user]);

  const saveChatMessage = useCallback(async (role, content, workoutId = null) => {
    if (!user) return;
    await supabase.from('chat_messages').insert({
      user_id:    user.id,
      workout_id: workoutId ?? null,
      role,
      content,
    });
  }, [user]);

  return {
    // Same API as useHistory:
    history, loadingDb, storageOk: !!user,
    saveWorkout, deleteWorkout, recentWorkouts, aggregateStats,
    // New:
    uploadFit, error, getChatHistory, saveChatMessage,
  };
}