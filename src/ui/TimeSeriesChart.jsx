import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * TimeSeriesChart.jsx
 * Reusable area chart for workout time series data.
 * Accepts any numeric dataKey from the timeSeries array.
 */


const GRID_COLOR   = 'rgba(255,255,255,0.04)';
const TICK_COLOR   = '#3a3d4e';
const TICK_SIZE    = 10;

function CustomTooltip({ active, payload, label, unit, xLabel }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div style={{
      background: 'var(--bg-raised)',
      border:     '1px solid var(--border-mid)',
      borderRadius: 'var(--r-md)',
      padding:    '8px 12px',
      fontSize:   12,
      fontFamily: 'var(--font-mono)',
      color:      'var(--text-primary)',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>
        {typeof label === 'number' ? label.toFixed(2) : label} km
      </div>
      <div style={{ color: payload[0]?.color }}>
        {val != null ? Number(val).toFixed(1) : '—'} {unit}
      </div>
    </div>
  );
}

export function TimeSeriesChart({
  data,
  dataKey,
  color,
  unit = '',
  height = 130,
  xKey = 'distKm',
  yDomain = ['auto', 'auto'],
  xTickFormatter = v => `${Number(v).toFixed(0)} km`,
  gradientOpacity = [0.3, 0.02],
  interpolationType = 'monotone',
  yTickFormatter,
  yTicks,
}) {
  const gradId = `grad_${dataKey}`;

  // Filter: must have both the data value AND a valid X axis position
  const clean = data.filter(p => p[dataKey] != null && p[xKey] != null);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={clean} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={gradientOpacity[0]} />
            <stop offset="100%" stopColor={color} stopOpacity={gradientOpacity[1]} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />

        <XAxis
          dataKey={xKey}
          type="number"
          domain={[0, 'dataMax']}
          tick={{ fill: TICK_COLOR, fontSize: TICK_SIZE, fontFamily: 'var(--font-mono)' }}
          tickFormatter={xTickFormatter}
          tickCount={6}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          domain={yDomain}
          tick={{ fill: TICK_COLOR, fontSize: TICK_SIZE, fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={yTickFormatter}
          ticks={yTicks}
        />

        <Tooltip
          content={<CustomTooltip unit={unit} xLabel="dist" />}
          cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
        />

        <Area
          type={interpolationType}
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          connectNulls
          isAnimationActive={true}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}


// ────────────────────────────────────────────────────────────

