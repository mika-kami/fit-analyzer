import { useEffect, useMemo, useState } from 'react';
import { defaultGearForWorkout, matchGearToWorkout } from '../core/gearModel.js';

function dedupe(ids = []) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

export function ActivityGearCard({ workout, gear = [], onSaveAssignment }) {
  const [selectedIds, setSelectedIds] = useState(() => dedupe(workout?.gearIds ?? []));
  const [status, setStatus] = useState('');

  const availableGear = useMemo(
    () => matchGearToWorkout(gear, workout?.sport ?? workout?.sportLabel, workout),
    [gear, workout]
  );
  const defaultIds = useMemo(
    () => defaultGearForWorkout(gear, workout).map((item) => item.id),
    [gear, workout]
  );

  useEffect(() => {
    setSelectedIds(dedupe(workout?.gearIds ?? []));
    setStatus('');
  }, [workout?.id, workout?.date, workout?.gearIds]);

  if (!workout) return null;

  const canPersist = !!workout.id;
  const gearById = useMemo(() => new Map((gear ?? []).map((item) => [item.id, item])), [gear]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      const next = [...prev, id];
      const added = gearById.get(id);
      if (!added || added.type !== 'tires' || !added.parent_gear_id) return next;
      // UX guard: only one tire set per bike can be selected for one activity.
      return next.filter((itemId) => {
        const item = gearById.get(itemId);
        if (!item || item.id === added.id) return true;
        return !(item.type === 'tires' && item.parent_gear_id === added.parent_gear_id);
      });
    });
  };

  const handleSave = async () => {
    if (!canPersist || !onSaveAssignment) return;
    setStatus('saving');
    const updated = await onSaveAssignment(workout.id, selectedIds);
    setStatus(updated ? 'saved' : 'error');
    if (updated?.gearIds) setSelectedIds(dedupe(updated.gearIds));
    window.setTimeout(() => setStatus(''), 1800);
  };

  return (
    <div style={{
      background: 'var(--bg-overlay)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-lg)',
      padding: 'var(--sp-5)',
      display: 'grid',
      gap: 'var(--sp-3)',
    }}>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
          Activity Gear
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Link saved gear to this activity. Mileage and activity counts are recalculated from these assignments.
        </div>
      </div>

      {!availableGear.length ? (
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          No matching saved gear yet for this sport or bike.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {availableGear.map((item) => (
            <label key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--sp-3)',
              padding: '8px 10px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--bg-raised)',
              border: `1px solid ${selectedIds.includes(item.id) ? 'rgba(232,168,50,0.35)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {item.type}
                    {item.brand ? ` | ${item.brand}` : ''}
                    {item.bike_name ? ` | bike ${item.bike_name}` : ''}
                    {defaultIds.includes(item.id) ? ' | default' : ''}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                {Math.round((item.total_distance_m ?? 0) / 1000)} km
              </div>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setSelectedIds(defaultIds)}
          disabled={!availableGear.length}
          style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            cursor: availableGear.length ? 'pointer' : 'default',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Apply defaults
        </button>
        <button
          onClick={handleSave}
          disabled={!canPersist}
          style={{
            background: canPersist ? 'rgba(232,168,50,0.12)' : 'var(--bg-raised)',
            border: `1px solid ${canPersist ? 'rgba(232,168,50,0.4)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--r-sm)',
            padding: '6px 10px',
            fontSize: 11,
            color: canPersist ? 'var(--accent)' : 'var(--text-dim)',
            cursor: canPersist ? 'pointer' : 'default',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Retry save' : 'Save gear'}
        </button>
        {!canPersist ? (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            Save this activity first to persist gear links.
          </span>
        ) : null}
      </div>
    </div>
  );
}
