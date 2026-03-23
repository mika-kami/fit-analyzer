/**
 * ZonesTab.jsx — Multi-model HR zone analysis with model switcher.
 * Garmin 5-zone / Seiler 3-zone (polarised) / Coggan 7-zone.
 * Props: { workout }
 */
import { useState, useEffect }                                           from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardLabel }  from './OverviewTab.jsx';

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: Zones
// ═══════════════════════════════════════════════════════════════════════════════
export function ZonesTab({ workout: w }) {
  const [model, setModel] = useState('garmin5');
  const multi = w.multiZones ?? {};
  const zones = multi[model] ?? [];
  const lt2   = w.thresholdHr || 0;
  const maxHr = w.heartRate?.max || 0;

  const modelMeta = {
    garmin5: {
      label:   'Garmin 5 зон',
      desc:    '% от max ЧСС · совместимо с Garmin Connect',
      ref:     `Max ЧСС: ${maxHr} уд/мин`,
      polar:   null,
    },
    seiler3: {
      label:   'Seiler 3 зоны',
      desc:    'Поляризованная модель · научный стандарт выносливости',
      ref:     lt2 ? `LT2: ${lt2} уд/мин` : 'LT2 не определён',
      polar:   zones.length === 3 ? {
        low:  zones[0]?.pct ?? 0,
        mid:  zones[1]?.pct ?? 0,
        high: zones[2]?.pct ?? 0,
      } : null,
    },
    coggan7: {
      label:   'Coggan 7 зон',
      desc:    'Адаптация под ЧСС · от лактатного порога',
      ref:     lt2 ? `LT2: ${lt2} уд/мин` : 'LT2 не определён',
      polar:   null,
    },
  };

  const meta = modelMeta[model];

  // Seiler polarisation score: fraction below LT2 vs above LT2
  const seilerZones = multi['seiler3'] ?? [];
  const seilerBelow = (seilerZones[0]?.pct ?? 0) + (seilerZones[1]?.pct ?? 0);
  const seilerAbove = seilerZones[2]?.pct ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Model switcher */}
      <div style={{ display: 'flex', gap: 6 }}>
        {Object.entries(modelMeta).map(([key, m]) => (
          <button key={key} onClick={() => setModel(key)} style={{
            flex: 1, background: model===key ? 'rgba(232,168,50,0.12)' : 'var(--bg-overlay)',
            border: `1px solid ${model===key ? 'rgba(232,168,50,0.4)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--r-md)', padding: 'var(--sp-2) var(--sp-3)',
            color: model===key ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 11, fontWeight: model===key ? 600 : 400,
            fontFamily: 'var(--font-mono)', cursor: 'pointer',
            transition: 'all var(--t-base) var(--ease-snappy)',
          }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Model description */}
      <div style={{
        background: 'rgba(232,168,50,0.06)', border: '1px solid rgba(232,168,50,0.18)',
        borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{meta.desc}</span>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{meta.ref}</span>
      </div>

      {/* Zone bars */}
      <Card>
        <CardLabel>Время в зонах</CardLabel>
        {zones.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 'var(--sp-4) 0' }}>
            Нет данных — LT2 не определён в файле
          </div>
        )}
        {zones.map(z => (
          <ZoneBarFull key={z.id} zone={z} />
        ))}
      </Card>

      {/* Bar chart */}
      <Card style={{ padding: 'var(--sp-4) var(--sp-3) var(--sp-3)' }}>
        <CardLabel>Минуты в зонах — {meta.label}</CardLabel>
        <ResponsiveContainer width="100%" height={model==='coggan7' ? 140 : 120}>
          <BarChart data={zones} margin={{ top:0, right:4, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="id" tick={{ fill:'#3a3d4e', fontSize:10, fontFamily:'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'#3a3d4e', fontSize:10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background:'var(--bg-raised)', border:'1px solid var(--border-mid)', borderRadius:8, fontSize:12, fontFamily:'var(--font-mono)' }}
              formatter={(v,_,p) => [`${v} мин`, p.payload.name]}
            />
            <Bar dataKey="minutes" radius={[3,3,0,0]}>
              {zones.map((z,i) => <Cell key={i} fill={z.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Seiler polarisation score — always shown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-3)' }}>
        {[
          { label: 'Ниже LT2', value: seilerBelow.toFixed(0)+'%', color:'#4ade80',
            sub: 'Z1+Z2 Seiler · цель ≥ 80%',
            ok: seilerBelow >= 80 },
          { label: 'Выше LT2', value: seilerAbove.toFixed(0)+'%', color:'#ef4444',
            sub: 'Z3 Seiler · лимит ≤ 20%',
            ok: seilerAbove <= 20 },
          { label: 'Поляризация', value: seilerBelow >= 80 ? '✓' : '✗',
            color: seilerBelow >= 80 ? '#4ade80' : '#f97316',
            sub: seilerBelow >= 80 ? 'Поляризованная модель' : 'Слишком интенсивно', ok: seilerBelow >= 80 },
        ].map(item => (
          <div key={item.label} style={{
            background: `${item.color}08`,
            border: `1px solid ${item.color}25`,
            borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
              {item.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, color: item.color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
              {item.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Model explanation */}
      <Card>
        <CardLabel>Что означает эта модель</CardLabel>
        {model === 'garmin5' && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <b style={{ color: 'var(--text-primary)' }}>Garmin 5 зон</b> — стандарт для сравнения с Garmin Connect.
            Границы зон вычисляются как % от max ЧСС из профиля устройства ({maxHr} уд/мин).
            Удобна для отслеживания прогресса внутри экосистемы Garmin, но не отражает
            физиологических порогов конкретного спортсмена.
          </div>
        )}
        {model === 'seiler3' && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <b style={{ color: 'var(--text-primary)' }}>Модель Сейлера</b> — научный консенсус для спорта на выносливость
            (Seiler & Kjerland, 2006). Три зоны относительно лактатного порога LT2 ({lt2 || '?'} уд/мин).
            Элитные спортсмены проводят ~80% тренировок в Z1, ~20% в Z3 и практически ничего в "серой зоне" Z2.
            <br/><br/>
            <span style={{ color: seilerBelow >= 80 ? '#4ade80' : '#f97316' }}>
              {seilerBelow >= 80
                ? `✓ Ваши ${seilerBelow.toFixed(0)}% ниже LT2 соответствуют поляризованной модели.`
                : `⚠ Только ${seilerBelow.toFixed(0)}% ниже LT2 — рекомендуется ≥ 80% для оптимальной адаптации.`
              }
            </span>
          </div>
        )}
        {model === 'coggan7' && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <b style={{ color: 'var(--text-primary)' }}>7 зон Когана</b> — детализированная система из велоспорта,
            адаптированная под ЧСС. Лактатный порог LT2 ({lt2 || '?'} уд/мин) используется как FTP-аналог.
            Зоны Z1–Z2 = аэробная база; Z3 = темп; Z4 = порог; Z5 = VO₂max; Z6–Z7 = анаэробные усилия.
            Подходит для детального планирования интервальных блоков.
          </div>
        )}
      </Card>
    </div>
  );
}

export function ZoneBarFull({ zone }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(zone.pct), 150); return () => clearTimeout(t); }, [zone.pct]);
  const mm = Math.floor(zone.seconds / 60);
  const ss = zone.seconds % 60;
  const timeStr = `${mm}:${String(ss).padStart(2,'0')}`;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 4 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
          <span style={{ fontSize:10, color: zone.color, fontFamily:'var(--font-mono)', width:20 }}>{zone.id.toUpperCase()}</span>
          <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{zone.name}</span>
          {zone.lo !== undefined && (
            <span style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
              {zone.lo}–{zone.hi > 900 ? '∞' : zone.hi} уд/мин
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'baseline' }}>
          <span style={{ fontSize:12, color: zone.color, fontFamily:'var(--font-mono)' }}>{timeStr}</span>
          <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', width:34, textAlign:'right' }}>{zone.pct.toFixed(0)}%</span>
        </div>
      </div>
      <div style={{ height:6, background:'var(--bg-raised)', borderRadius:3, overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${w}%`, background: zone.color, borderRadius:3,
          transition:'width 0.7s var(--ease-snappy)', boxShadow:`0 0 6px ${zone.color}40`,
        }} />
      </div>
    </div>
  );
}
