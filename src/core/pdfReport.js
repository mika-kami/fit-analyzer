/**
 * pdfReport.js — Generate and download a workout report as PDF.
 * Uses browser window.print() with @media print CSS.
 * No external dependencies.
 */
import { fmtKm, fmtDuration, fmtDurationShort, fmtNum } from './format.js';

const C = {
  bg:      '#0d0f16',
  text:    '#ecedf0',
  muted:   '#8b909e',
  accent:  '#e8a832',
  border:  'rgba(255,255,255,0.1)',
  cellBg:  'rgba(255,255,255,0.03)',
  cellBdr: 'rgba(255,255,255,0.08)',
  barBg:   'rgba(255,255,255,0.08)',
  z1:      '#4ade80',
  z2:      '#a3e635',
  z3:      '#fbbf24',
  z4:      '#f97316',
  z5:      '#ef4444',
  success: '#4ade80',
  warning: '#f97316',
  info:    '#60a5fa',
};

const REC_COLORS = { warning: C.warning, info: C.info, success: C.success };

function metricCell(value, label) {
  return `
    <div style="background:${C.cellBg};border:1px solid ${C.cellBdr};border-radius:8px;padding:12px;">
      <div style="font-size:28px;font-weight:700;color:${C.text};line-height:1.1;">${value}</div>
      <div style="font-size:9px;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em;margin-top:2px;">${label}</div>
    </div>`;
}

function zoneRow(zone) {
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px;">
      <div style="width:100px;color:${C.muted};white-space:nowrap;">Z${zone.id} ${zone.name}</div>
      <div style="flex:1;max-width:200px;height:6px;border-radius:3px;background:${C.barBg};">
        <div style="height:100%;border-radius:3px;background:${zone.color};width:${Math.min(zone.pct, 100)}%;"></div>
      </div>
      <div style="width:36px;text-align:right;color:${C.text};font-weight:600;">${zone.pct}%</div>
      <div style="width:50px;text-align:right;color:${C.muted};">${zone.minutes} мин</div>
      <div style="width:70px;text-align:right;color:${C.muted};font-size:10px;">${zone.hrLo}–${zone.hrHi}</div>
    </div>`;
}

function teBar(label, value, color) {
  const pct = Math.min((value / 5) * 100, 100);
  return `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
        <span style="color:${C.muted};">${label}</span>
        <span style="color:${C.text};font-weight:600;">${value.toFixed(1)} / 5</span>
      </div>
      <div style="height:8px;background:${C.barBg};border-radius:4px;">
        <div style="height:100%;border-radius:4px;background:${color};width:${pct}%;"></div>
      </div>
    </div>`;
}

function recBlock(rec) {
  const borderColor = REC_COLORS[rec.type] || C.muted;
  return `
    <div style="border-left:3px solid ${borderColor};padding:6px 10px;margin-bottom:6px;background:rgba(255,255,255,0.02);border-radius:0 6px 6px 0;">
      <div style="font-size:11px;color:${C.text};font-weight:600;">${rec.icon || ''} ${rec.title}</div>
      <div style="font-size:10px;color:${C.muted};margin-top:1px;">${rec.text}</div>
    </div>`;
}

function sectionTitle(text) {
  return `<div style="font-size:10px;color:${C.accent};letter-spacing:0.12em;text-transform:uppercase;margin:20px 0 10px;font-weight:600;">${text}</div>`;
}

function buildReportHTML(w) {
  const recs = (w.recommendations || []).slice(0, 3);
  const zones = w.hrZones || [];

  return `
<div style="font-family:'DM Mono',monospace;background:${C.bg};color:${C.text};max-width:800px;margin:0 auto;padding:32px;font-size:12px;line-height:1.5;">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;margin-bottom:24px;border-bottom:1px solid ${C.border};padding-bottom:16px;">
    <div>
      <div style="font-size:9px;color:${C.accent};letter-spacing:0.15em;margin-bottom:4px;">
        ◈ FIT ANALYZER · ОТЧЁТ О ТРЕНИРОВКЕ
      </div>
      <div style="font-size:22px;font-weight:700;color:${C.text};letter-spacing:-0.02em;">
        ${w.sportLabel}${w.bike ? ` — ${w.bike}` : ''}
      </div>
      <div style="font-size:11px;color:${C.muted};margin-top:2px;">
        ${w.startTime} · ${w.fileName}
      </div>
    </div>
    <div style="text-align:right;font-size:11px;color:${C.muted};">
      <div style="font-size:16px;color:${C.text};font-weight:600;">${w.date}</div>
      <div>Создан: ${new Date().toLocaleDateString('ru')}</div>
    </div>
  </div>

  <!-- Metrics -->
  ${sectionTitle('Ключевые метрики')}
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:4px;">
    ${metricCell(fmtKm(w.distance) + ' км', 'Дистанция')}
    ${metricCell(fmtDurationShort(w.duration.active), 'Акт. время')}
    ${metricCell(fmtNum(w.speed.avg) + ' км/ч', 'Ср. скорость')}
    ${metricCell((w.heartRate.avg || '—') + ' уд/мин', 'Ср. ЧСС')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
    ${metricCell('+' + (w.elevation?.ascent || 0) + ' м', 'Набор высоты')}
    ${metricCell((w.calories || '—') + ' ккал', 'Калории')}
    ${metricCell(w.trainingEffect.aerobic.toFixed(1) + ' / 5', 'ТЭ Аэробный')}
    ${metricCell((w.heartRate.max || '—') + ' уд/мин', 'Макс. ЧСС')}
  </div>

  <!-- HR Zones -->
  ${zones.length ? sectionTitle('Зоны ЧСС') + zones.map(zoneRow).join('') : ''}

  <!-- Training Effect -->
  ${sectionTitle('Тренировочный эффект')}
  ${teBar('Аэробный', w.trainingEffect.aerobic, C.accent)}
  ${teBar('Анаэробный', w.trainingEffect.anaerobic, C.info)}

  <!-- Recommendations -->
  ${recs.length ? sectionTitle('Рекомендации тренера') + recs.map(recBlock).join('') : ''}

  <!-- Details -->
  <div style="margin-top:20px;padding-top:12px;border-top:1px solid ${C.border};font-size:10px;color:${C.muted};line-height:1.8;">
    Полное время: ${fmtDuration(w.duration.total)} ·
    Паузы: ${fmtDurationShort(w.duration.pause)} ·
    Ср. каданс: ${w.cadence?.avg || '—'} об/мин ·
    Макс скорость: ${fmtNum(w.speed.max)} км/ч ·
    Нагрузка: ${w.load?.label || '—'} ·
    Восст.: ${w.load?.recoveryDays || '—'} дн.
  </div>

</div>`;
}

export function downloadWorkoutPDF(workout) {
  // Remove any previous report
  document.getElementById('pdf-report')?.remove();

  const html = buildReportHTML(workout);

  // Create container
  const container = document.createElement('div');
  container.id = 'pdf-report';
  container.innerHTML = html;
  container.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;overflow:auto;';
  document.body.appendChild(container);

  // Inject print CSS
  const styleId = 'pdf-print-style';
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @media print {
      body > *:not(#pdf-report) { display: none !important; }
      #pdf-report {
        display: block !important;
        position: static !important;
        background: ${C.bg} !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        size: A4;
        margin: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Show for print
  container.style.display = 'block';

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      container.remove();
      style.remove();
    }, 1000);
  }, 100);
}
