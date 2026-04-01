/** useGarmin.js — Bridge to garmin_server.py on localhost:8765. */

import { useState, useEffect, useCallback, useRef } from 'react';

const BRIDGE_URL = 'http://localhost:8765';

export function useGarmin(onSyncComplete) {
  const [serverFound, setServerFound] = useState(false);
  const [probeError,  setProbeError]  = useState('');
  const [syncing,     setSyncing]     = useState(false);
  const [step,        setStep]        = useState('');
  const [message,     setMessage]     = useState('');
  const [error,       setError]       = useState('');
  const [filters,     setFilters]     = useState([]);   // available filter values from config
  const pollRef = useRef(null);

  // ── probe + load config ───────────────────────────────────────────────────
  const probe = useCallback(async () => {
    setProbeError('');
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(`${BRIDGE_URL}/ping`,
        { signal: ctrl.signal, cache: 'no-store', mode: 'cors' });
      clearTimeout(tid);
      if (r.ok) {
        setServerFound(true);
        // Load filters from config
        try {
          const cfg = await fetch(`${BRIDGE_URL}/config`).then(r => r.json());
          setFilters(cfg.FILTERS ?? []);
        } catch (_) {}
      } else {
        setServerFound(false);
      }
    } catch (e) {
      clearTimeout(tid);
      setServerFound(false);
      setProbeError(e.name === 'AbortError'
        ? 'Timeout — сервер не ответил за 4 сек'
        : (e.message || String(e)));
    }
  }, []);

  useEffect(() => { probe(); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── syncActivities ────────────────────────────────────────────────────────
  const syncActivities = useCallback(async (knownGarminIds = [], activityType = 'all') => {
    setSyncing(true);
    setStep('Opening browser…');
    setMessage('');
    setError('');

    try {
      const r = await fetch(`${BRIDGE_URL}/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          known_ids:     knownGarminIds,
          activity_type: activityType,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);

      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          try {
            const s = await fetch(`${BRIDGE_URL}/sync/status`).then(r => r.json());
            if (s.step) setStep(s.step);
            if (s.done) {
              clearInterval(pollRef.current);
              s.error ? reject(new Error(s.error)) : resolve(s);
            }
          } catch (_) {}
        }, 1500);
      });

      const final = await fetch(`${BRIDGE_URL}/sync/status`).then(r => r.json());
      setMessage(final.message ?? '');

      if (final.results?.length) {
        setStep('Saving to database...');
        await onSyncComplete(final.results);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
      setStep('');
    }
  }, [onSyncComplete]);

  return {
    serverFound, probeError, syncing, step, message, error, filters,
    probe, syncActivities,
  };
}

