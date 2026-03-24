/**
 * StravaPanel.jsx — Slide-in panel for Strava integration.
 * OAuth connect, activity list, import with full streams (GPS + HR).
 * Props: { strava, onClose, onImport }
 */
import { useState, useEffect } from 'react';

const SPORT_ICON = {
  Ride: '🚴', VirtualRide: '🚴', EBikeRide: '🚲', GravelRide: '🚴', MountainBikeRide: '🚵',
  Run: '🏃', VirtualRun: '🏃', TrailRun: '🏃',
  Walk: '🚶', Hike: '🥾',
  Swim: '🏊', NordicSki: '⛷️', AlpineSki: '⛷️',
  Rowing: '🚣', Kayaking: '🛶',
  Workout: '💪', WeightTraining: '🏋️', Yoga: '🧘',
};

function fmtDist(m) { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; }
function fmtDur(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, '0')}`; }
function fmtDate(iso) { return iso?.slice(0, 10) ?? ''; }

export function StravaPanel({ strava, onClose, onImport }) {
  const {
    status, athlete, activities, importingId, error, athleteMaxHr,
    connect, disconnect, fetchActivities, importActivity,
  } = strava;

  // Fetch activities when panel opens and connected
  useEffect(() => {
    if (status === 'connected' && activities.length === 0) {
      fetchActivities();
    }
  }, [status]);

  const handleImport = async (id) => {
    const workout = await importActivity(id);
    if (workout) onImport(workout);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380, height: '100%', background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-body)',
          animation: 'slideIn 0.22s var(--ease-snappy)',
        }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Header */}
        <div style={{
          padding: 'var(--sp-5) var(--sp-5) var(--sp-4)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: '#fc4c02', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', marginBottom: 4 }}>
              ◈ STRAVA
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              {status === 'connected' && athlete
                ? `${athlete.firstname ?? ''} ${athlete.lastname ?? ''}`.trim() || 'Strava'
                : 'Strava Connect'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}>x</button>
        </div>

        {/* Not connected */}
        {status === 'idle' && (
          <div style={{ padding: 'var(--sp-5)', flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div style={{
              background: 'rgba(252,76,2,0.06)', border: '1px solid rgba(252,76,2,0.2)',
              borderRadius: 'var(--r-md)', padding: 'var(--sp-5)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 36, marginBottom: 'var(--sp-3)' }}>🏃</div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 'var(--sp-2)' }}>
                Connect to Strava
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 'var(--sp-4)' }}>
                Import activities with full GPS tracks and heart rate data for maps and zone analysis.
              </div>
              <button onClick={connect} style={{
                width: '100%',
                background: '#fc4c02',
                border: 'none',
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-3) var(--sp-4)',
                color: '#fff',
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>
                Authorize with Strava
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, textAlign: 'center' }}>
              We only request read access to your activities. No data is stored on third-party servers.
            </div>

            {error && (
              <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {status === 'loading' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div style={{
              width: 28, height: 28, border: '2px solid var(--border-mid)',
              borderTopColor: '#fc4c02', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Loading activities...
            </div>
          </div>
        )}

        {/* Connected — activity list */}
        {status === 'connected' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-4) var(--sp-5)' }}>
            {/* Athlete max HR info */}
            {athleteMaxHr > 0 && (
              <div style={{
                background: 'rgba(252,76,2,0.06)', border: '1px solid rgba(252,76,2,0.15)',
                borderRadius: 'var(--r-sm)', padding: 'var(--sp-2) var(--sp-3)',
                fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                marginBottom: 'var(--sp-3)',
              }}>
                Max HR from profile: <span style={{ color: '#fc4c02', fontWeight: 600 }}>{athleteMaxHr}</span> bpm
              </div>
            )}

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 'var(--sp-3)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {activities.length} ACTIVITIES
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => fetchActivities()} style={{
                  background: 'none', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-sm)', padding: '3px 10px',
                  color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                }}>
                  Refresh
                </button>
                <button onClick={disconnect} style={{
                  background: 'none', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-sm)', padding: '3px 10px',
                  color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer',
                }}>
                  Disconnect
                </button>
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'var(--font-mono)', marginBottom: 'var(--sp-3)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activities.map(a => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  importing={importingId === a.id}
                  disabled={importingId !== null}
                  onImport={() => handleImport(a.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity: a, importing, disabled, onImport }) {
  const icon = SPORT_ICON[a.type] ?? '🏅';
  const hasHr  = a.has_heartrate;
  const hasGps = a.start_latlng?.length === 2;

  return (
    <div style={{
      background: importing ? 'rgba(252,76,2,0.08)' : 'var(--bg-overlay)',
      border: `1px solid ${importing ? 'rgba(252,76,2,0.3)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: importing ? 'wait' : 'default',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {a.name || a.type}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {fmtDate(a.start_date_local)} · {fmtDist(a.distance)} · {fmtDur(a.moving_time)}
          {a.average_heartrate > 0 && ` · ♥ ${Math.round(a.average_heartrate)}`}
        </div>
        {/* Data availability badges */}
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {hasGps && <Badge color="#60a5fa" label="GPS" />}
          {hasHr  && <Badge color="#f97316" label="HR" />}
          {a.average_watts > 0 && <Badge color="#a855f7" label="PWR" />}
        </div>
      </div>
      <button
        onClick={onImport}
        disabled={disabled}
        style={{
          background: 'none',
          border: `1px solid ${importing ? 'rgba(252,76,2,0.4)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--r-sm)', padding: '4px 10px',
          color: importing ? '#fc4c02' : 'var(--text-secondary)',
          fontSize: 11, cursor: disabled ? 'wait' : 'pointer',
          fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 8,
          transition: 'all var(--t-base) var(--ease-snappy)',
        }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = '#fc4c02'; e.currentTarget.style.color = '#fc4c02'; } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = importing ? 'rgba(252,76,2,0.4)' : 'var(--border-subtle)'; e.currentTarget.style.color = importing ? '#fc4c02' : 'var(--text-secondary)'; }}
      >
        {importing ? '...' : 'Import'}
      </button>
    </div>
  );
}

function Badge({ color, label }) {
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
      color, background: `${color}15`, border: `1px solid ${color}30`,
      borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  );
}
