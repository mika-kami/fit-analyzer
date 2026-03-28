/** useWorkout.js — File-load state machine: idle → loading → ready | error. */

import { useState, useCallback } from 'react';
import { parseFit } from '../core/fitParser.js';
import { buildWorkoutModel } from '../core/workoutAnalyzer.js';
import { SAMPLE_WORKOUT } from '../core/sampleWorkout.js';

/**
 * useWorkout.js
 * React hook that owns the workout-loading lifecycle:
 *   idle → loading → ready | error
 *
 * Exposes:
 *   workout      WorkoutModel | null
 *   status       'idle' | 'loading' | 'ready' | 'error'
 *   error        string | null
 *   loadFile     (File) => void
 *   loadSample   () => void
 *   reset        () => void
 */





export function useWorkout() {
  const [workout, setWorkout]   = useState(null);
  const [status,  setStatus]    = useState('idle');   // 'idle'|'loading'|'ready'|'error'
  const [error,   setError]     = useState(null);

  const loadFile = useCallback(async (file, userMaxHr = 0) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.fit')) {
      setError('Поддерживаются только файлы с расширением .fit');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const buffer  = await file.arrayBuffer();
      const fitData = parseFit(buffer);
      const model   = buildWorkoutModel(fitData, file.name, userMaxHr);
      setWorkout(model);
      setStatus('ready');
    } catch (e) {
      console.error('[useWorkout] parse error', e);
      setError(e.message ?? 'Неизвестная ошибка при разборе файла');
      setStatus('error');
    }
  }, []);

  const loadSample = useCallback(() => {
    setWorkout(SAMPLE_WORKOUT);
    setStatus('ready');
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setWorkout(null);
    setStatus('idle');
    setError(null);
  }, []);

  // Load a WorkoutSummary from history (no timeSeries) for detail view
  // Tabs that need timeSeries (Charts, Map) will show a graceful empty state
  const loadFromSummary = useCallback((summary) => {
    if (!summary) return;
    // summary from DB already contains timeSeries (downsampled)
    // Ensure all required fields have defaults
    const model = {
      timeSeries:   [],          // default: empty
      hrZones:      [],
      multiZones:   {},
      recommendations: [],
      ...summary,                // DB values override defaults
      // Always ensure timeSeries is an array
      timeSeries: Array.isArray(summary.timeSeries) ? summary.timeSeries : [],
    };
    setWorkout(model);
    setStatus('ready');
    setError(null);
  }, []);

  return { workout, status, error, loadFile, loadSample, loadFromSummary, reset };
}


// ────────────────────────────────────────────────────────────