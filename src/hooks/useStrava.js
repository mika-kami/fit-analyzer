/**
 * useStrava.js — Strava OAuth + activity import hook.
 * Handles: OAuth redirect flow, token refresh, activity listing,
 * full activity import with streams (GPS for maps, HR for zones).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { analyzeHrZones, buildMultiZones, assessLoad, generateRecommendations } from '../core/workoutAnalyzer.js';
import { generateTrainingPlan } from '../core/trainingEngine.js';

const CLIENT_ID    = import.meta.env.VITE_STRAVA_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/`;
const SCOPES       = 'activity:read_all';
const TOKEN_KEY    = 'strava_tokens';

// ── Strava sport type → app sport name ──────────────────────────────────────
const SPORT_MAP = {
  Ride: 'Cycling', VirtualRide: 'Cycling', EBikeRide: 'E-Biking',
  GravelRide: 'Cycling', MountainBikeRide: 'Cycling',
  Run: 'Running', VirtualRun: 'Running', TrailRun: 'Running',
  Walk: 'Walking', Hike: 'Hiking',
  Swim: 'Swimming',
  NordicSki: 'Cross Country Skiing', AlpineSki: 'Alpine Skiing',
  Rowing: 'Rowing', Kayaking: 'Kayaking',
  Workout: 'Fitness Equipment', WeightTraining: 'Training',
  Yoga: 'Training',
};

// ── API helpers ─────────────────────────────────────────────────────────────
function stravaApi(path, token, params = {}) {
  const qs = new URLSearchParams({ path, ...params }).toString();
  return fetch(`/api/strava/proxy?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => {
    if (!r.ok) return r.json().then(d => Promise.reject(new Error(d.message || `HTTP ${r.status}`)));
    return r.json();
  });
}

async function exchangeCode(code) {
  const r = await fetch('/api/strava/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ code }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || data.error || 'Token exchange failed');
  return data;
}

async function doRefresh(refreshToken) {
  const r = await fetch('/api/strava/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || data.error || 'Refresh failed');
  return data;
}

// ── Token persistence ───────────────────────────────────────────────────────
function loadTokens()      { try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; } }
function saveTokens(t)     { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); }
function clearTokens()     { localStorage.removeItem(TOKEN_KEY); }

// ── Build WorkoutModel from Strava data ─────────────────────────────────────
function buildStravaWorkout(activity, streams, athleteMaxHr) {
  const timeArr   = streams.find(s => s.type === 'time')?.data ?? [];
  const hrArr     = streams.find(s => s.type === 'heartrate')?.data ?? [];
  const distArr   = streams.find(s => s.type === 'distance')?.data ?? [];
  const altArr    = streams.find(s => s.type === 'altitude')?.data ?? [];
  const latlngArr = streams.find(s => s.type === 'latlng')?.data ?? [];
  const cadArr    = streams.find(s => s.type === 'cadence')?.data ?? [];
  const wattsArr  = streams.find(s => s.type === 'watts')?.data ?? [];
  const velArr    = streams.find(s => s.type === 'velocity_smooth')?.data ?? [];

  // Build timeSeries — same shape as FIT-parsed records (lat, lon, hr, etc.)
  const startEpoch = new Date(activity.start_date).getTime() / 1000;
  const timeSeries = timeArr.map((t, i) => {
    const pt = { timestamp: startEpoch + t };
    if (hrArr[i] != null)     pt.hr       = hrArr[i];
    if (distArr[i] != null) { pt.distance  = distArr[i]; pt.distKm = parseFloat((distArr[i] / 1000).toFixed(3)); }
    if (altArr[i] != null)    pt.altitude  = altArr[i];
    if (latlngArr[i])       { pt.lat       = latlngArr[i][0]; pt.lon = latlngArr[i][1]; }
    if (cadArr[i] != null)    pt.cadence   = cadArr[i];
    if (wattsArr[i] != null)  pt.power     = wattsArr[i];
    if (velArr[i] != null)  { pt.speed     = velArr[i]; pt.speedKmh = parseFloat((velArr[i] * 3.6).toFixed(2)); }
    return pt;
  });

  const startDate = new Date(activity.start_date);
  const sport     = SPORT_MAP[activity.type] ?? activity.type ?? 'Activity';

  // Max HR priority: athlete profile zones > activity max > stream max
  const streamMaxHr  = hrArr.length ? Math.max(...hrArr.filter(h => h > 0)) : 0;
  const maxHr        = athleteMaxHr || activity.max_heartrate || streamMaxHr;
  const thresholdHr  = maxHr ? Math.round(maxHr * 0.88) : 0;

  // Compute zones from actual HR stream (same logic as FIT-parsed workouts)
  const hrZones    = analyzeHrZones(timeSeries, maxHr);
  const multiZones = buildMultiZones(timeSeries, maxHr, thresholdHr || maxHr * 0.88);

  // Elevation descent from stream (Strava doesn't always give it)
  let descent = 0;
  for (let i = 1; i < altArr.length; i++) {
    const d = altArr[i - 1] - altArr[i];
    if (d > 0) descent += d;
  }

  const workout = {
    fileName:   `strava_${activity.id}`,
    source:     'strava',
    stravaId:   activity.id,
    date:       startDate.toISOString().slice(0, 10),
    startTime:  startDate.toTimeString().slice(0, 5),
    startDate,
    sport,
    subSport:   '',
    sportLabel: sport,
    bike:       activity.gear?.name ?? '',

    duration: {
      total:  activity.elapsed_time ?? 0,
      active: activity.moving_time  ?? 0,
      pause:  (activity.elapsed_time ?? 0) - (activity.moving_time ?? 0),
    },
    distance:   activity.distance ?? 0,
    calories:   activity.calories ?? 0,

    heartRate: {
      avg: activity.average_heartrate ?? 0,
      max: maxHr,
      min: hrArr.length ? Math.min(...hrArr.filter(h => h > 0)) : 0,
    },
    speed: {
      avg:       parseFloat(((activity.average_speed ?? 0) * 3.6).toFixed(2)),
      max:       parseFloat(((activity.max_speed ?? 0) * 3.6).toFixed(2)),
      avgMoving: parseFloat(((activity.average_speed ?? 0) * 3.6).toFixed(2)),
    },
    elevation: {
      ascent:  activity.total_elevation_gain ?? 0,
      descent: Math.round(descent) || (activity.total_elevation_gain ?? 0),
      min:     altArr.length ? Math.min(...altArr) : 0,
      max:     altArr.length ? Math.max(...altArr) : 0,
    },
    cadence: {
      avg: activity.average_cadence ? Math.round(activity.average_cadence) : 0,
      max: 0,
    },
    power: activity.average_watts ? {
      avg: Math.round(activity.average_watts),
      max: activity.max_watts ?? 0,
    } : null,
    temperature: activity.average_temp != null ? {
      avg: activity.average_temp,
      max: activity.average_temp,
    } : null,
    trainingEffect: { aerobic: 0, anaerobic: 0 },

    hrZones,
    thresholdHr,
    multiZones,
    timeSeries,
    lapCount: activity.laps?.length ?? 1,
  };

  workout.load            = assessLoad(workout);
  workout.recommendations = generateRecommendations(workout);
  workout.trainingPlan    = generateTrainingPlan(workout, []);

  return workout;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useStrava() {
  const [status,      setStatus]      = useState('idle');   // idle | connected | loading
  const [athlete,     setAthlete]     = useState(null);
  const [activities,  setActivities]  = useState([]);
  const [importingId, setImportingId] = useState(null);
  const [error,       setError]       = useState('');
  const [athleteMaxHr, setAthleteMaxHr] = useState(0);
  const tokensRef = useRef(loadTokens());

  // Get valid access token, refreshing if expired
  const getToken = useCallback(async () => {
    let tokens = tokensRef.current;
    if (!tokens) return null;

    if (tokens.expires_at && tokens.expires_at < Date.now() / 1000) {
      try {
        const refreshed = await doRefresh(tokens.refresh_token);
        tokens = { ...tokens, ...refreshed };
        tokensRef.current = tokens;
        saveTokens(tokens);
      } catch {
        clearTokens();
        tokensRef.current = null;
        setStatus('idle');
        return null;
      }
    }
    return tokens.access_token;
  }, []);

  // Fetch athlete HR zones → derive maxHR from top zone boundary
  const fetchAthleteZones = useCallback(async (token) => {
    try {
      const data = await stravaApi('athlete/zones', token);
      const hrZones = data?.heart_rate?.zones ?? [];
      if (hrZones.length) {
        const maxBpm = Math.max(...hrZones.map(z => z.max).filter(v => v > 0 && v < 300));
        if (maxBpm > 0) setAthleteMaxHr(maxBpm);
      }
    } catch { /* non-critical — zones will use activity max HR */ }
  }, []);

  // On mount: check URL for OAuth callback code, or restore session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const scope  = params.get('scope');

    if (code && scope?.includes('activity:read')) {
      // OAuth callback — clean URL and exchange code
      window.history.replaceState({}, '', window.location.pathname);
      setStatus('loading');
      exchangeCode(code)
        .then(data => {
          tokensRef.current = data;
          saveTokens(data);
          setAthlete(data.athlete);
          setStatus('connected');
          fetchAthleteZones(data.access_token);
        })
        .catch(e => { setError(e.message); setStatus('idle'); });
      return;
    }

    // Restore existing session
    const tokens = loadTokens();
    if (tokens?.access_token) {
      tokensRef.current = tokens;
      setAthlete(tokens.athlete);
      setStatus('connected');
      getToken().then(t => t && fetchAthleteZones(t));
    }
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!CLIENT_ID) { setError('VITE_STRAVA_CLIENT_ID not set'); return; }
    const url = `https://www.strava.com/oauth/authorize`
      + `?client_id=${CLIENT_ID}`
      + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
      + `&response_type=code&scope=${SCOPES}&approval_prompt=auto`;
    window.location.href = url;
  }, []);

  const disconnect = useCallback(() => {
    clearTokens();
    tokensRef.current = null;
    setAthlete(null);
    setActivities([]);
    setStatus('idle');
    setAthleteMaxHr(0);
  }, []);

  const fetchActivities = useCallback(async (page = 1, perPage = 20) => {
    const token = await getToken();
    if (!token) { setStatus('idle'); return; }

    setStatus('loading');
    setError('');
    try {
      const data = await stravaApi('athlete/activities', token, { page, per_page: perPage });
      setActivities(Array.isArray(data) ? data : []);
      setStatus('connected');
    } catch (e) {
      setError(e.message);
      setStatus('connected');
    }
  }, [getToken]);

  const importActivity = useCallback(async (id) => {
    const token = await getToken();
    if (!token) return null;

    setImportingId(id);
    setError('');
    try {
      // Fetch activity detail + streams in parallel
      const [activity, streams] = await Promise.all([
        stravaApi(`activities/${id}`, token),
        stravaApi(`activities/${id}/streams`, token, {
          keys:     'heartrate,time,distance,altitude,latlng,cadence,watts,velocity_smooth',
          key_type: 'mine',
        }),
      ]);

      return buildStravaWorkout(activity, Array.isArray(streams) ? streams : [], athleteMaxHr);
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setImportingId(null);
    }
  }, [getToken, athleteMaxHr]);

  return {
    status, athlete, activities, importingId, error, athleteMaxHr,
    connect, disconnect, fetchActivities, importActivity,
  };
}
