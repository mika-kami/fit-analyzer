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
    avg_hr:       workout.heartRate?.avg != null ? Math.round(workout.heartRate.avg) : null,
    max_hr:       workout.heartRate?.max != null ? Math.round(workout.heartRate.max) : null,
    ascent_m:     workout.elevation?.ascent != null ? Math.round(workout.elevation.ascent) : null,
    aerobic_te:         workout.trainingEffect?.aerobic ?? null,
    load_level:         workout.load?.level ?? null,
    garmin_activity_id: workout.garminActivityId ?? null,
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
      laps:            workout.laps ?? [],
      // Downsample timeSeries to every 4th point (~60KB) for Charts + Map
      timeSeries: (workout.timeSeries ?? []).filter((_, i) => i % 4 === 0),
    },
  };
}

// Convert DB row → WorkoutSummary (for cards + plan)
// Estimate aerobic TE from intensity × duration (for Strava workouts without TE)
function estimateTE(avgHr, maxHr, durationSec) {
  if (!avgHr || avgHr < 60 || !maxHr || maxHr < 100 || !durationSec || durationSec < 300) return 0;
  const durationH = durationSec / 3600;
  const intensity = Math.min(1.0, avgHr / maxHr);
  const stress    = durationH * Math.pow(intensity, 2) * 100;
  let te;
  if      (stress < 15)  te = 1.0 + (stress / 15) * 0.5;
  else if (stress < 40)  te = 1.5 + ((stress - 15) / 25) * 1.0;
  else if (stress < 80)  te = 2.5 + ((stress - 40) / 40) * 1.0;
  else if (stress < 150) te = 3.5 + ((stress - 80) / 70) * 0.7;
  else                   te = Math.min(5.0, 4.2 + ((stress - 150) / 150) * 0.8);
  return parseFloat(te.toFixed(1));
}

function fromRow(row) {
  const base = {
    ...row.summary_json,
    id:               row.id,
    date:             row.workout_date,
    timeSeries:       row.summary_json?.timeSeries ?? [],
    garminActivityId: row.garmin_activity_id ?? null,
    source:           row.source ?? 'upload',
    fit_path:         row.fit_path ?? null,
  };

  // Fix TE for Strava workouts: edge function may have saved wrong value (0 or 5).
  // Recalculate client-side from DB columns which are always correct.
  if (row.source === 'strava') {
    const te = estimateTE(row.avg_hr, row.max_hr, row.duration_s);
    // Always override — don't keep a wrong value (0 or 5) from the edge function
    base.trainingEffect = {
      aerobic:   te,          // 0 if no HR data (cycling without monitor)
      anaerobic: 0,
      estimated: te > 0,      // only flag as estimated when we have HR to work with
    };
  }

  return base;
}

// Source priority: garmin FIT > upload FIT > strava (API streams, no laps/TE)
const SOURCE_RANK = { garmin: 3, upload: 2, strava: 1 };

// Score how "rich" a workout's data is — higher = more data
function dataRichness(w) {
  let score = SOURCE_RANK[w.source ?? 'upload'] ?? 0;
  if (w.laps?.length)                    score += 2;
  if (w.timeSeries?.length > 10)         score += 2;
  if (w.trainingEffect?.aerobic > 0 && !w.trainingEffect?.estimated) score += 1;
  if (w.heartRate?.avg > 0)              score += 1;
  if (w.elevation?.ascent > 0)           score += 1;
  return score;
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

     // Find existing workout for this date (any source) — never downgrade richer data
     const existing = history.find(h => h.date === workout.date);
     if (existing && dataRichness(workout) < dataRichness(existing)) {
       return true; // keep existing richer record
     }
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
  }, [user, history]);

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
    const model   = buildWorkoutModel(fitData, file.name, historicalMaxHr);
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

  // Force reload from DB (called after Strava sync)
  const reload = useCallback(() => {
    if (!user) return;
    supabase
      .from('workouts')
      .select('*')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: false })
      .then(({ data }) => {
        if (data) setHistory(data.map(fromRow));
      });
  }, [user?.id]);

  // Best guess at athlete's true max HR from history
  // Uses 95th percentile of session peaks to avoid outliers
  const historicalMaxHr = (() => {
    const peaks = history
      .map(w => w.heartRate?.peakInWorkout || w.heartRate?.max || 0)
      .filter(hr => hr > 100)
      .sort((a, b) => b - a);
    if (!peaks.length) return 0;
    // 95th percentile index
    const idx = Math.max(0, Math.floor(peaks.length * 0.05));
    return peaks[idx] || 0;
  })();

  /**
   * Save activities received from garmin_server.py /sync.
   * Each item: { garmin_activity_id, activity_name, fit_b64 }
   * Parses FIT client-side, saves to DB with garmin_activity_id set.
   */
  const saveGarminActivities = useCallback(async (results) => {
    if (!user || !results?.length) return 0;
    let saved = 0;
    for (const item of results) {
      try {
        // Decode base64 FIT
        const binary  = atob(item.fit_b64);
        const bytes   = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const buffer  = bytes.buffer;

        // Parse FIT → WorkoutModel
        const fitData = parseFit(buffer);
        const model   = buildWorkoutModel(fitData, `${item.garmin_activity_id}.fit`, historicalMaxHr);

        // Attach garmin metadata
        model.garminActivityId = item.garmin_activity_id;
        model.source           = 'garmin';
        if (!model.fileName) model.fileName = item.activity_name;

        const row = {
          ...toRow(model, user.id),
          garmin_activity_id: item.garmin_activity_id,
          source: 'garmin',
        };

        // Check for existing: exact garmin_activity_id match, or same date (Strava duplicate)
        const exactMatch = history.find(h => h.garminActivityId === item.garmin_activity_id);
        const dateMatch  = !exactMatch && history.find(h => h.date === model.date);
        const existing   = exactMatch || dateMatch;

        if (existing) {
          // Only update if new data is richer (e.g. Garmin FIT replacing Strava)
          if (dataRichness(model) <= dataRichness(existing)) continue;

          const { data, error: dbErr } = await supabase
            .from('workouts')
            .update(row)
            .eq('id', existing.id)
            .select()
            .single();

          if (dbErr) {
            console.error('[saveGarminActivities] update failed', dbErr);
            continue;
          }

          console.log(`[saveGarminActivities] upgraded ${existing.source} → garmin for ${model.date}`);
          setHistory(prev =>
            prev.map(w => w.id === existing.id ? fromRow(data) : w)
          );
          saved++;
        } else {
          const { data, error: dbErr } = await supabase
            .from('workouts')
            .insert(row)
            .select()
            .single();

          if (dbErr) {
            console.error('[saveGarminActivities] insert failed', dbErr);
            continue;
          }

          setHistory(prev =>
            [fromRow(data), ...prev].sort((a,b) => b.date.localeCompare(a.date))
          );
          saved++;
        }
      } catch (e) {
        console.error('[saveGarminActivities] parse/save failed', e);
      }
    }
    return saved;
  }, [user, history]);

  return {
    // Same API as useHistory:
    history, loadingDb, storageOk: !!user,
    saveWorkout, deleteWorkout, recentWorkouts, aggregateStats,
    // New:
    uploadFit, reload, error, getChatHistory, saveChatMessage, saveGarminActivities,
    historicalMaxHr,
  };
}