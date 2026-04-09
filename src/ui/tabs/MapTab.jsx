/**
 * MapTab.jsx — Route map using Leaflet.js (loaded via CDN).
 * Renders the GPS track with HR-based colour gradient.
 * Falls back gracefully when no GPS data is present.
 * Props: { workout }
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import { Card, CardLabel } from './OverviewTab.jsx';
import { downloadGPX }   from '../../core/gpxExport.js';
import { fingerprint, findRouteMatches } from '../../core/routeMatcher.js';

// HR zone colours (matches rest of app)
const HR_COLORS = ['#4ade80','#a3e635','#fbbf24','#f97316','#ef4444'];

function hrColor(hr, maxHr) {
  if (!hr || !maxHr) return '#60a5fa';
  const pct = hr / maxHr;
  if (pct < 0.60) return HR_COLORS[0];
  if (pct < 0.70) return HR_COLORS[1];
  if (pct < 0.80) return HR_COLORS[2];
  if (pct < 0.90) return HR_COLORS[3];
  return HR_COLORS[4];
}

function loadLeaflet(cb) {
  if (window.L) { cb(); return; }
  const css = document.createElement('link');
  css.rel  = 'stylesheet';
  css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  document.head.appendChild(css);
  const js = document.createElement('script');
  js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  js.onload = cb;
  document.head.appendChild(js);
}

export function MapTab({ workout: w, history }) {
  const mapRef    = useRef(null);
  const mapInst   = useRef(null);
  const [ready,   setReady]   = useState(false);
  const [noGps,   setNoGps]   = useState(false);

  // Extract GPS points with HR
  const pts = (w.timeSeries ?? []).filter(p => p.lat != null && p.lon != null);

  // Find best previous matching route for overlay
  const prevRoute = useMemo(() => {
    if (pts.length < 20) return null;
    const fp = fingerprint(w.timeSeries);
    if (!fp) return null;
    const histWorkouts = history?.history ?? [];
    const matches = findRouteMatches(fp, histWorkouts.filter(h => h.date !== w.date));
    if (!matches.length) return null;
    const best = matches[0].workout;
    const prevPts = (best.timeSeries ?? []).filter(p => p.lat != null && p.lon != null);
    return prevPts.length > 0 ? { pts: prevPts, date: best.date } : null;
  }, [w.date, w.timeSeries, pts.length, history]);

  useEffect(() => {
    if (pts.length === 0) { setNoGps(true); return; }

    loadLeaflet(() => {
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || mapInst.current) return;

    const L = window.L;
    const maxHr = w.heartRate?.max || 180;

    // Init map
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true });
    mapInst.current = map;

    // Dark tile layer — CartoDB Dark Matter
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(map);

    // Faded overlay: previous matching route
    if (prevRoute) {
      const prevLatLons = prevRoute.pts.map(p => [p.lat, p.lon]);
      L.polyline(prevLatLons, { color: '#6b7280', weight: 2, opacity: 0.35, dashArray: '4 4' })
        .bindPopup(`<b>Previous run</b><br>${prevRoute.date}`)
        .addTo(map);
    }

    // Draw coloured polyline segments
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const color = hrColor((a.hr + (b.hr || a.hr)) / 2, maxHr);
      L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
        color,
        weight: 3,
        opacity: 0.85,
      }).addTo(map);
    }

    // Start marker (green dot)
    const startPt = pts[0];
    L.circleMarker([startPt.lat, startPt.lon], {
      radius: 7, fillColor: '#4ade80', color: '#07080c',
      weight: 2, fillOpacity: 1,
    }).bindPopup(`<b>Start</b><br>${w.startTime}`).addTo(map);

    // Finish marker (red dot)
    const endPt = pts[pts.length - 1];
    L.circleMarker([endPt.lat, endPt.lon], {
      radius: 7, fillColor: '#ef4444', color: '#07080c',
      weight: 2, fillOpacity: 1,
    }).bindPopup(`<b>Finish</b><br>${(w.distance/1000).toFixed(2)} km`).addTo(map);

    // Fit bounds with padding
    const lats = pts.map(p => p.lat);
    const lons = pts.map(p => p.lon);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ], { padding: [24, 24] });

    return () => {
      map.remove();
      mapInst.current = null;
    };
  }, [ready, prevRoute]);

  if (noGps) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 'var(--sp-3)' }}>📍</div>
          <div style={{ fontSize: 13 }}>No GPS data in this workout</div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Map container */}
      <div style={{
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        height: 420,
        background: 'var(--bg-overlay)',
        position: 'relative',
      }}>
        {!ready && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 'var(--sp-3)',
          }}>
            <div style={{
              width: 28, height: 28, border: '2px solid var(--border-mid)',
              borderTopColor: 'var(--accent)', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Map loading…
            </div>
          </div>
        )}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {prevRoute && (
        <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <div style={{ width: 28, height: 3, background: '#6b7280', borderRadius: 2, opacity: 0.5, flexShrink: 0, backgroundImage: 'repeating-linear-gradient(90deg, #6b7280 0 4px, transparent 4px 8px)' }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Previous run on this route · {prevRoute.date}</div>
        </div>
      )}

      {/* HR legend */}
      <Card>
        <CardLabel>Track color - HR zones</CardLabel>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          {[
            { color: HR_COLORS[0], label: 'Z1 < 60%' },
            { color: HR_COLORS[1], label: 'Z2 60–70%' },
            { color: HR_COLORS[2], label: 'Z3 70–80%' },
            { color: HR_COLORS[3], label: 'Z4 80–90%' },
            { color: HR_COLORS[4], label: 'Z5 > 90%' },
          ].map(z => (
            <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 4, borderRadius: 2, background: z.color }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {z.label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-3)' }}>
        {[
          { label: 'GPS points',  value: pts.length.toLocaleString() },
          { label: 'Distance', value: `${(w.distance/1000).toFixed(2)} km` },
          { label: 'Ascent',      value: `+${w.elevation?.ascent ?? 0} m` },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* GPX Export */}
      <GPXExportButton workout={w} hasGps={pts.length > 0} />
    </div>
  );
}

function GPXExportButton({ workout, hasGps }) {
  const [status, setStatus] = useState(null); // null | 'ok' | 'err'

  const handleExport = () => {
    try {
      downloadGPX(workout);
      setStatus('ok');
      setTimeout(() => setStatus(null), 2500);
    } catch (e) {
      setStatus('err');
      setTimeout(() => setStatus(null), 3000);
    }
  };

  if (!hasGps) return null;

  return (
    <button
      onClick={handleExport}
      style={{
        width: '100%',
        background: status === 'ok'  ? 'rgba(74,222,128,0.1)'
                  : status === 'err' ? 'rgba(239,68,68,0.1)'
                  : 'var(--bg-overlay)',
        border: `1px solid ${
          status === 'ok'  ? 'rgba(74,222,128,0.35)'
        : status === 'err' ? 'rgba(239,68,68,0.35)'
        : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-md)',
        padding: 'var(--sp-3) var(--sp-4)',
        color: status === 'ok'  ? '#4ade80'
             : status === 'err' ? '#ef4444'
             : 'var(--text-secondary)',
        fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        transition: 'all var(--t-base) var(--ease-snappy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {status === 'ok'  ? '✓ GPX saved'
     : status === 'err' ? '✗ No GPS data'
     : '↓ Export GPX'}
    </button>
  );
}


