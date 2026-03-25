/** useGarmin.js — Bridge to garmin_server.py on localhost:8765. */

import { useState, useEffect, useCallback } from 'react';

const BRIDGE_URL = 'http://localhost:8765';

export function useGarmin(onFitLoaded) {
  const [status,      setStatus]      = useState('idle');
  const [serverFound, setServerFound] = useState(false);
  const [probeError,  setProbeError]  = useState('');
  const [userName,    setUserName]    = useState('');
  const [activities,  setActivities]  = useState([]);
  const [loadingId,   setLoadingId]   = useState(null);
  const [error,       setError]       = useState('');

  const probe = useCallback(async () => {
    setStatus('checking');
    setProbeError('');
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(`${BRIDGE_URL}/ping`, {
        signal: ctrl.signal,
        cache:  'no-store',
        mode:   'cors',
      });
      clearTimeout(tid);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setServerFound(true);
      if (d.status === 'connected') {
        setStatus('connected');
        // Session was auto-restored on server — fetch activities directly
        loadActivities();
      } else {
        setStatus('disconnected');
      }
    } catch (e) {
      clearTimeout(tid);
      setServerFound(false);
      setStatus('idle');
      const msg = e.name === 'AbortError'
        ? 'Timeout — сервер не ответил за 4 сек'
        : (e.message || String(e));
      setProbeError(msg);
    }
  }, []);

  // Probe once on mount
  useEffect(() => { probe(); }, []);

  const login = useCallback(async (email, password) => {
    setStatus('checking'); setError('');
    try {
      const r = await fetch(`${BRIDGE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setUserName(d.name ?? email);
      setStatus('connected');
      await loadActivities();
    } catch (e) {
      setError(e.message);
      setStatus('disconnected');
    }
  }, []);

  const loadActivities = useCallback(async () => {
    setStatus('loading');
    try {
      const r = await fetch(`${BRIDGE_URL}/activities?limit=20`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setActivities(d.activities ?? []);
      setStatus('connected');
    } catch (e) {
      setError(e.message);
      setStatus('connected');
    }
  }, []);

  const downloadActivity = useCallback(async (id, name) => {
    setLoadingId(id); setError('');
    try {
      const r = await fetch(`${BRIDGE_URL}/activity/${id}/fit`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const file = new File([blob], `${name || id}.fit`, { type: 'application/octet-stream' });
      onFitLoaded(file);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingId(null);
    }
  }, [onFitLoaded]);

  return { status, serverFound, probeError, userName, activities, loadingId, error,
           probe, login, loadActivities, downloadActivity };
}
