/**
 * GearPanel.jsx — Equipment management: shoes, bikes, tires, chains.
 * Tracks mileage per item and alerts when approaching replacement threshold.
 * Props: { gear, onAdd, onRetire, onDelete }
 */
import { useState } from 'react';
import { Card, CardLabel } from './tabs/OverviewTab.jsx';
import { GEAR_DEFAULTS, gearStatus } from '../core/gearTracker.js';

const ALERT_COLOR = { overdue: '#ef4444', soon: '#f97316', watch: '#fbbf24', none: '#4ade80' };

function GearCard({ item, onRetire }) {
  const status = gearStatus(item);
  const alertColor = ALERT_COLOR[status.alert] ?? '#6b7280';
  const usedKm = Math.round((item.total_distance_m ?? 0) / 1000);

  return (
    <div style={{
      background: 'var(--bg-overlay)', border: `1px solid ${status.alert !== 'none' && status.alert ? alertColor + '40' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
      opacity: item.is_retired ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {item.type} · {item.sport} · {item.total_sessions ?? 0} sessions
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: alertColor, fontFamily: 'var(--font-display)' }}>{usedKm} km</div>
          {item.max_distance_m > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>/ {Math.round(item.max_distance_m / 1000)} km max</div>
          )}
        </div>
      </div>

      {status.pct != null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 4, background: 'var(--bg-raised)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, status.pct)}%`, background: alertColor, borderRadius: 2, transition: 'width 0.5s' }} />
          </div>
          {status.alert !== 'none' && (
            <div style={{ fontSize: 10, color: alertColor, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {status.alert === 'overdue' ? 'Replace now' : status.alert === 'soon' ? `~${status.remainingKm} km remaining` : `${status.pct}% used`}
            </div>
          )}
        </div>
      )}

      {!item.is_retired && (
        <button
          onClick={() => onRetire(item.id)}
          style={{ marginTop: 8, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: '3px 10px', fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
        >Retire</button>
      )}
    </div>
  );
}

function AddGearForm({ onAdd, onCancel }) {
  const [name, setName]     = useState('');
  const [type, setType]     = useState('shoes');
  const [sport, setSport]   = useState('running');
  const [maxKm, setMaxKm]   = useState(() => String(GEAR_DEFAULTS['shoes']?.maxKm ?? ''));

  const handleTypeChange = (t) => {
    setType(t);
    setMaxKm(String(GEAR_DEFAULTS[t]?.maxKm ?? ''));
    setSport({ shoes: 'running', bike: 'cycling', tires: 'cycling', chain: 'cycling', insoles: 'running', helmet: 'cycling' }[t] ?? 'running');
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), type, sport, max_distance_m: maxKm ? Number(maxKm) * 1000 : null });
  };

  const inp = { background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, width: '100%' };
  const sel = { ...inp, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', background: 'var(--bg-raised)', border: '1px solid var(--border-mid)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ADD GEAR</div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (e.g. Nike Vaporfly 3)" style={inp} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        <select value={type} onChange={e => handleTypeChange(e.target.value)} style={sel}>
          {Object.keys(GEAR_DEFAULTS).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sport} onChange={e => setSport(e.target.value)} style={sel}>
          <option value="running">Running</option>
          <option value="cycling">Cycling</option>
          <option value="hiking">Hiking</option>
        </select>
      </div>
      <input value={maxKm} onChange={e => setMaxKm(e.target.value)} placeholder="Max km (optional)" type="number" style={inp} />
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button onClick={handleSubmit} style={{ flex: 1, background: 'rgba(232,168,50,0.12)', border: '1px solid rgba(232,168,50,0.4)', borderRadius: 'var(--r-sm)', padding: '7px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}>Add</button>
        <button onClick={onCancel} style={{ flex: 1, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: '7px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

export function GearPanel({ gear = [], onAdd, onRetire }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  const active  = gear.filter(g => !g.is_retired);
  const retired = gear.filter(g => g.is_retired);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>GEAR · {active.length} ACTIVE</div>
        <button onClick={() => setShowAdd(v => !v)} style={{ background: 'rgba(232,168,50,0.08)', border: '1px solid rgba(232,168,50,0.3)', borderRadius: 'var(--r-sm)', padding: '4px 12px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
          {showAdd ? 'Cancel' : '+ Add gear'}
        </button>
      </div>

      {showAdd && <AddGearForm onAdd={(item) => { onAdd?.(item); setShowAdd(false); }} onCancel={() => setShowAdd(false)} />}

      {active.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-muted)', fontSize: 12 }}>No gear tracked yet. Add your shoes or bike.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {active.map(item => <GearCard key={item.id} item={item} onRetire={onRetire} />)}
      </div>

      {retired.length > 0 && (
        <>
          <button onClick={() => setShowRetired(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer', textAlign: 'left' }}>
            {showRetired ? '▼' : '▶'} {retired.length} retired item{retired.length > 1 ? 's' : ''}
          </button>
          {showRetired && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {retired.map(item => <GearCard key={item.id} item={item} onRetire={onRetire} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
