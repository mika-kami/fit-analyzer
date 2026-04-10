import { useEffect, useMemo, useState } from 'react';
import { GEAR_DEFAULTS, GEAR_TYPE_OPTIONS, gearStatus } from '../core/gearModel.js';

const ALERT_COLOR = { overdue: '#ef4444', soon: '#f97316', watch: '#fbbf24', none: '#4ade80' };
const TYPE_LABELS = {
  shoes: 'Shoes',
  insoles: 'Insoles',
  bike: 'Bike',
  tires: 'Tires',
  chain: 'Chain',
  cassette: 'Cassette',
  crankset: 'Crankset',
  brakes: 'Brakes',
  chain_cleaning: 'Chain Cleaning',
  chain_waxing: 'Chain Waxing',
  brakes_service: 'Brakes Service',
  shifting_service: 'Shifting Service',
  helmet: 'Helmet',
};
const BIKE_PARENT_TYPES = new Set(['tires', 'chain', 'cassette', 'crankset', 'brakes', 'chain_cleaning', 'chain_waxing', 'brakes_service', 'shifting_service']);

function kmValueToMeters(value) {
  if (value === '' || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 1000) : null;
}

function metersToKm(value) {
  return value != null && value !== '' ? String(Math.round(Number(value) / 1000)) : '';
}

function defaultSportForType(type) {
  return GEAR_DEFAULTS[type]?.sport ?? 'cycling';
}

function warningText(item) {
  return GEAR_DEFAULTS[item.type]?.warning ?? '';
}

function requiresBikeParent(type) {
  return BIKE_PARENT_TYPES.has(type);
}

function GearCard({ item, parentName, isChild, onUpdate, onRetire, onBackfill }) {
  const [busyAction, setBusyAction] = useState('');
  const [info, setInfo] = useState('');
  const status = gearStatus(item);
  const alertColor = ALERT_COLOR[status.alert] ?? '#6b7280';
  const usedKm = Math.round((item.total_distance_m ?? 0) / 1000);
  const thresholdM = item.service_interval_m || item.max_distance_m;
  const thresholdKm = thresholdM ? Math.round(thresholdM / 1000) : null;
  const helper = warningText(item);

  const run = async (action, fn) => {
    setInfo('');
    setBusyAction(action);
    try {
      return await fn?.();
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div style={{
      background: 'var(--bg-overlay)',
      border: `1px solid ${status.alert !== 'none' ? `${alertColor}40` : 'var(--border-subtle)'}`,
      borderRadius: 'var(--r-md)',
      padding: 'var(--sp-3) var(--sp-4)',
      opacity: item.is_retired ? 0.56 : 1,
      marginLeft: isChild ? 18 : 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
            {item.default_for_new ? <Badge color="#4ade80" label="Default for new" /> : null}
            {item.is_retired ? <Badge color="#94a3b8" label="Retired" /> : null}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
            {TYPE_LABELS[item.type] ?? item.type} | {item.sport} | {item.total_sessions ?? 0} activities
            {item.brand ? ` | ${item.brand}` : ''}
            {parentName ? ` | bike ${parentName}` : (item.bike_name ? ` | bike ${item.bike_name}` : '')}
          </div>
          {helper ? (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{helper}</div>
          ) : null}
          {item.notes ? (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{item.notes}</div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: alertColor, fontFamily: 'var(--font-display)' }}>{usedKm} km</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {thresholdKm ? `${item.service_interval_m ? 'every' : 'limit'} ${thresholdKm} km` : 'tracked by activities'}
          </div>
        </div>
      </div>

      {status.pct != null ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 4, background: 'var(--bg-raised)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, status.pct)}%`, background: alertColor, borderRadius: 2, transition: 'width 0.5s' }} />
          </div>
          <div style={{ fontSize: 10, color: status.alert === 'none' ? 'var(--text-dim)' : alertColor, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            {status.alert === 'overdue'
              ? `${status.kind === 'service' ? 'Service overdue' : 'Replacement overdue'}`
              : status.alert === 'soon'
                ? `${status.remainingKm} km remaining`
                : status.alert === 'watch'
                  ? `${status.pct}% used`
                  : `${status.pct}% of interval used`}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {!item.is_retired ? (
          <button
            onClick={() => run('default', () => onUpdate?.(item.id, { default_for_new: !item.default_for_new }))}
            style={actionButton(item.default_for_new ? 'rgba(74,222,128,0.12)' : 'var(--bg-raised)', item.default_for_new ? 'rgba(74,222,128,0.35)' : 'var(--border-subtle)', item.default_for_new ? '#4ade80' : 'var(--text-secondary)')}
          >
            {busyAction === 'default' ? 'Saving...' : item.default_for_new ? 'Unset default' : 'Set default'}
          </button>
        ) : null}
        {!item.is_retired ? (
          <button
            onClick={async () => {
              const count = await run('backfill', () => onBackfill?.(item));
              if (typeof count === 'number') {
                setInfo(count > 0 ? `Linked to ${count} past activit${count === 1 ? 'y' : 'ies'}.` : 'No matching saved activities found.');
              }
            }}
            style={actionButton('rgba(96,165,250,0.08)', 'rgba(96,165,250,0.25)', '#60a5fa')}
          >
            {busyAction === 'backfill' ? 'Applying...' : 'Add to past activities'}
          </button>
        ) : null}
        {!item.is_retired ? (
          <button
            onClick={() => run('retire', () => onRetire?.(item.id))}
            style={actionButton('none', 'var(--border-subtle)', 'var(--text-muted)')}
          >
            {busyAction === 'retire' ? 'Retiring...' : 'Retire'}
          </button>
        ) : null}
      </div>
      {info ? (
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {info}
        </div>
      ) : null}
    </div>
  );
}

function Badge({ color, label }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 7px',
      borderRadius: 999,
      fontSize: 10,
      fontFamily: 'var(--font-mono)',
      background: `${color}18`,
      border: `1px solid ${color}33`,
      color,
    }}>
      {label}
    </span>
  );
}

function actionButton(background, borderColor, color) {
  return {
    background,
    border: `1px solid ${borderColor}`,
    borderRadius: 'var(--r-sm)',
    padding: '4px 10px',
    fontSize: 10,
    color,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
  };
}

function AddGearForm({ gear = [], onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('bike');
  const [sport, setSport] = useState(defaultSportForType('bike'));
  const [brand, setBrand] = useState('');
  const [bikeName, setBikeName] = useState('');
  const [maxKm, setMaxKm] = useState(metersToKm(GEAR_DEFAULTS.bike?.maxKm ? GEAR_DEFAULTS.bike.maxKm * 1000 : null));
  const [serviceKm, setServiceKm] = useState(metersToKm(GEAR_DEFAULTS.bike?.serviceKm ? GEAR_DEFAULTS.bike.serviceKm * 1000 : null));
  const [defaultForNew, setDefaultForNew] = useState(true);
  const [notes, setNotes] = useState('');
  const bikes = useMemo(() => gear.filter((item) => item.type === 'bike' && !item.is_retired), [gear]);
  const [parentGearId, setParentGearId] = useState('');

  useEffect(() => {
    if (requiresBikeParent(type) && !parentGearId && bikes.length) {
      setParentGearId(bikes[0].id);
    }
  }, [bikes, parentGearId, type]);

  const preset = GEAR_DEFAULTS[type] ?? {};

  const handleTypeChange = (nextType) => {
    const nextPreset = GEAR_DEFAULTS[nextType] ?? {};
    setType(nextType);
    setSport(nextPreset.sport ?? 'cycling');
    setMaxKm(nextPreset.maxKm ? String(nextPreset.maxKm) : '');
    setServiceKm(nextPreset.serviceKm ? String(nextPreset.serviceKm) : '');
    if (nextPreset.sport === 'running') setBikeName('');
    if (requiresBikeParent(nextType)) {
      setParentGearId((prev) => prev || bikes[0]?.id || '');
    } else {
      setParentGearId('');
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const selectedBike = bikes.find((item) => item.id === parentGearId);
    if (requiresBikeParent(type) && !selectedBike) return;
    const saved = await onAdd?.({
      name: name.trim(),
      type,
      sport,
      brand: brand.trim(),
      bike_name: requiresBikeParent(type) ? (selectedBike?.name ?? '') : bikeName.trim(),
      parent_gear_id: requiresBikeParent(type) ? (selectedBike?.id ?? null) : null,
      notes: notes.trim(),
      default_for_new: defaultForNew,
      max_distance_m: kmValueToMeters(maxKm),
      service_interval_m: kmValueToMeters(serviceKm),
      auto_create_defaults: type === 'bike',
    });
    if (saved) onCancel?.();
  };

  const inp = { background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, width: '100%' };
  const sel = { ...inp, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', background: 'var(--bg-raised)', border: '1px solid var(--border-mid)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ADD GEAR OR SERVICE TRACKER</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Road bike tyre set, Wax cycle)" style={inp} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <select value={type} onChange={(e) => handleTypeChange(e.target.value)} style={sel}>
          {GEAR_TYPE_OPTIONS.map((itemType) => <option key={itemType} value={itemType}>{TYPE_LABELS[itemType] ?? itemType}</option>)}
        </select>
        <select value={sport} onChange={(e) => setSport(e.target.value)} style={sel}>
          <option value="cycling">Cycling</option>
          <option value="running">Running</option>
          <option value="swimming">Swimming</option>
          <option value="hiking">Hiking</option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" style={inp} />
        {requiresBikeParent(type) ? (
          <select value={parentGearId} onChange={(e) => setParentGearId(e.target.value)} style={sel} disabled={!bikes.length}>
            {bikes.length ? bikes.map((bike) => <option key={bike.id} value={bike.id}>{bike.name}</option>) : <option value="">Add bike first</option>}
          </select>
        ) : (
          <input value={bikeName} onChange={(e) => setBikeName(e.target.value)} placeholder="Bike name (optional)" style={inp} disabled={sport !== 'cycling'} />
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <input value={maxKm} onChange={(e) => setMaxKm(e.target.value)} placeholder="Lifecycle km (optional)" type="number" min="0" style={inp} />
        <input value={serviceKm} onChange={(e) => setServiceKm(e.target.value)} placeholder="Service interval km (optional)" type="number" min="0" style={inp} />
      </div>
      {preset.warning ? (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{preset.warning}</div>
      ) : null}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes, pressure, model, service note..." style={{ ...inp, minHeight: 58, resize: 'vertical' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={defaultForNew} onChange={(e) => setDefaultForNew(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
        Use this automatically for new matching activities
      </label>
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button onClick={handleSubmit} style={{ flex: 1, background: 'rgba(232,168,50,0.12)', border: '1px solid rgba(232,168,50,0.4)', borderRadius: 'var(--r-sm)', padding: '7px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}>Add</button>
        <button onClick={onCancel} style={{ flex: 1, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: '7px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

export function GearPanel({ gear = [], onAdd, onUpdate, onRetire, onBackfill }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  const active = useMemo(() => gear.filter((item) => !item.is_retired), [gear]);
  const retired = useMemo(() => gear.filter((item) => item.is_retired), [gear]);
  const activeBikes = useMemo(() => active.filter((item) => item.type === 'bike'), [active]);
  const activeComponents = useMemo(() => active.filter((item) => item.type !== 'bike'), [active]);
  const unassigned = useMemo(() => activeComponents.filter((item) => !item.parent_gear_id), [activeComponents]);
  const childrenByBikeId = useMemo(() => {
    const map = new Map();
    for (const item of activeComponents) {
      if (!item.parent_gear_id) continue;
      const list = map.get(item.parent_gear_id) ?? [];
      list.push(item);
      map.set(item.parent_gear_id, list);
    }
    return map;
  }, [activeComponents]);
  const allMap = useMemo(() => new Map(gear.map((item) => [item.id, item])), [gear]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>GEAR | {active.length} ACTIVE</div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Default items are auto-linked to new activities. Use "Add to past activities" to backfill history and recalculate mileage.
          </div>
        </div>
        <button onClick={() => setShowAdd((value) => !value)} style={{ background: 'rgba(232,168,50,0.08)', border: '1px solid rgba(232,168,50,0.3)', borderRadius: 'var(--r-sm)', padding: '4px 12px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {showAdd ? 'Cancel' : '+ Add gear'}
        </button>
      </div>

      {showAdd ? <AddGearForm gear={gear} onAdd={onAdd} onCancel={() => setShowAdd(false)} /> : null}

      {!active.length && !showAdd ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-muted)', fontSize: 12 }}>
          No gear tracked yet. Add your bike, tires, chain, or service cycle.
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {activeBikes.map((bike) => (
          <div key={bike.id} style={{ display: 'grid', gap: 8 }}>
            <GearCard item={bike} onUpdate={onUpdate} onRetire={onRetire} onBackfill={onBackfill} />
            {(childrenByBikeId.get(bike.id) ?? []).map((item) => (
              <GearCard
                key={item.id}
                item={item}
                parentName={bike.name}
                isChild={true}
                onUpdate={onUpdate}
                onRetire={onRetire}
                onBackfill={onBackfill}
              />
            ))}
          </div>
        ))}
        {unassigned.map((item) => (
          <GearCard
            key={item.id}
            item={item}
            parentName={item.parent_gear_id ? allMap.get(item.parent_gear_id)?.name : ''}
            onUpdate={onUpdate}
            onRetire={onRetire}
            onBackfill={onBackfill}
          />
        ))}
      </div>

      {retired.length ? (
        <>
          <button onClick={() => setShowRetired((value) => !value)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer', textAlign: 'left' }}>
            {showRetired ? 'v' : '>'} {retired.length} retired item{retired.length > 1 ? 's' : ''}
          </button>
          {showRetired ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {retired.map((item) => (
                <GearCard
                  key={item.id}
                  item={item}
                  parentName={item.parent_gear_id ? allMap.get(item.parent_gear_id)?.name : ''}
                  isChild={!!item.parent_gear_id}
                  onUpdate={onUpdate}
                  onRetire={onRetire}
                  onBackfill={onBackfill}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
