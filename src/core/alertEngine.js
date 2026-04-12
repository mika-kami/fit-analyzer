import { gearStatus } from './gearModel.js';
/**
 * alertEngine.js — Proactive coach alert rules.
 * Each rule is a pure function: (context) => Alert | null
 * Context: { load, readiness, historyWorkouts, profile, medicalProfile, mesocycle, compliance }
 */

function severityOrder(s) {
  return { high: 3, medium: 2, low: 1 }[s] ?? 0;
}

function daysBetween(isoA, isoB) {
  return Math.round((new Date(isoA) - new Date(isoB)) / 86400000);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function readinessScore(ctx) {
  const raw = ctx?.readiness;
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw.score === 'number') return raw.score;
  return 50;
}

// ── Alert rules ───────────────────────────────────────────────────────────────

export const ALERT_RULES = [
  {
    id: 'adaptive_plan_update',
    check: (ctx) => {
      const mesocycle = ctx.mesocycle;
      const history = ctx.historyWorkouts ?? [];
      if (!mesocycle?.weeks?.length) return null;

      const today = todayIso();
      const week = mesocycle.weeks[mesocycle.currentWeekIndex];
      if (!week?.days?.length) return null;

      const plannedToday = week.days.find((d) => d.dateIso === today && d.type !== 'rest');
      if (!plannedToday) return null;

      const r = readinessScore(ctx);
      if (r > 45) return null;

      const plannedPast = week.days.filter((d) => d.type !== 'rest' && d.dateIso < today);
      if (!plannedPast.length) return null;

      const workoutByDate = new Map(history.map((w) => [w.date, w]));
      const completedPast = plannedPast.filter((d) => workoutByDate.has(d.dateIso));
      const missed = plannedPast.length - completedPast.length;

      const offTarget = completedPast.filter((d) => {
        const c = workoutByDate.get(d.dateIso)?.complianceResult;
        return c && (c.verdict === 'off_target' || (c.score ?? 100) < 60);
      }).length;

      if (completedPast.length < 2) return null;
      if (missed < 1 && offTarget < 1) return null;

      return {
        severity: 'high',
        title: 'Low readiness vs current plan load',
        body: `Today readiness is ${Math.round(r)} with ${missed} missed and ${offTarget} off-target sessions this week. Update future weeks now to reduce overtraining risk.`,
        action: 'update_future',
      };
    },
  },

  {
    id: 'overreach_risk',
    check: (ctx) => {
      if ((ctx.load?.tsb ?? 0) < -20) {
        return {
          severity: 'high',
          title: 'Overreaching risk',
          body: `TSB at ${ctx.load.tsb.toFixed(1)} — fatigue accumulating. Consider 2 easy days or full rest.`,
          action: 'recovery_check',
        };
      }
      return null;
    },
  },

  {
    id: 'ctl_plateau',
    check: (ctx) => {
      const history = ctx.historyWorkouts ?? [];
      if (history.length < 14) return null;
      const today = todayIso();
      const recent14 = history.filter(w => daysBetween(today, w.date) <= 14);
      const older14  = history.filter(w => daysBetween(today, w.date) > 14 && daysBetween(today, w.date) <= 28);
      if (!recent14.length || !older14.length) return null;
      const avgTE = (ws) => ws.reduce((s, w) => s + (w.trainingEffect?.aerobic ?? 0), 0) / ws.length;
      const recentAvg = avgTE(recent14);
      const olderAvg  = avgTE(older14);
      if (olderAvg > 0.5 && Math.abs(recentAvg - olderAvg) / olderAvg < 0.05) {
        return {
          severity: 'low',
          title: 'Training plateau detected',
          body: 'TE trend flat for 14+ days. Consider adding a harder session or changing session structure.',
          action: null,
        };
      }
      return null;
    },
  },

  {
    id: 'missed_sessions',
    check: (ctx) => {
      const mesocycle = ctx.mesocycle;
      const history   = ctx.historyWorkouts ?? [];
      if (!mesocycle?.weeks?.length) return null;

      const today = todayIso();
      const currentWeek = mesocycle.weeks[mesocycle.currentWeekIndex];
      if (!currentWeek) return null;

      const plannedDays = currentWeek.days.filter(d => d.type !== 'rest' && d.dateIso < today);
      const completedDates = new Set(history.map(w => w.date));
      const missed = plannedDays.filter(d => !completedDates.has(d.dateIso));

      if (missed.length >= 2) {
        return {
          severity: 'medium',
          title: `${missed.length} planned sessions missed this week`,
          body: `You've skipped ${missed.length} sessions this week. Consider catching up or adjusting next week's load.`,
          action: 'plan_week',
        };
      }
      return null;
    },
  },

  {
    id: 'resting_hr_spike',
    check: (ctx) => {
      const checkins = ctx.dailyCheckins ?? {};
      const today = todayIso();
      const last3 = [0, 1, 2].map(n => {
        const d = new Date(today); d.setDate(d.getDate() - n);
        return checkins[d.toISOString().slice(0, 10)]?.restingHrDelta ?? 0;
      });
      if (last3.every(delta => delta >= 5)) {
        return {
          severity: 'high',
          title: 'Resting HR elevated 3+ days',
          body: `HR consistently +${Math.round(Math.min(...last3))}+ bpm above baseline. This indicates incomplete recovery.`,
          action: 'recovery_check',
        };
      }
      return null;
    },
  },

  {
    id: 'efficiency_decline',
    check: (ctx) => {
      const history = ctx.historyWorkouts ?? [];
      const today = todayIso();
      const recent3w = history.filter(w => daysBetween(today, w.date) <= 21 && w.speed?.avg > 0 && w.heartRate?.avg > 0);
      const older3w  = history.filter(w => daysBetween(today, w.date) > 21 && daysBetween(today, w.date) <= 42 && w.speed?.avg > 0 && w.heartRate?.avg > 0);
      if (recent3w.length < 3 || older3w.length < 3) return null;

      const ae = (ws) => ws.reduce((s, w) => s + w.speed.avg / w.heartRate.avg, 0) / ws.length;
      const recentAE = ae(recent3w);
      const olderAE  = ae(older3w);
      if (olderAE > 0 && (olderAE - recentAE) / olderAE > 0.10) {
        return {
          severity: 'medium',
          title: 'Aerobic efficiency declining',
          body: 'Speed-per-HR ratio dropped >10% over 3 weeks. Could indicate fatigue, illness, or heat adaptation.',
          action: 'recovery_check',
        };
      }
      return null;
    },
  },

  {
    id: 'bloodwork_overdue',
    check: (ctx) => {
      const med = ctx.medicalProfile ?? {};
      const last = med.lastBloodwork;
      if (!last) return null;
      const months = (Date.now() - new Date(last)) / (30 * 86400000);
      if (months > 6 && (med.ironDeficiency || med.thyroidCondition)) {
        return {
          severity: 'medium',
          title: 'Bloodwork follow-up due',
          body: `Last bloodwork ${Math.round(months)} months ago. With flagged conditions, a recheck is recommended.`,
          action: null,
        };
      }
      return null;
    },
  },

  {
    id: 'zone_imbalance',
    check: (ctx) => {
      const history = ctx.historyWorkouts ?? [];
      const today = todayIso();
      const recent4w = history.filter(w => daysBetween(today, w.date) <= 28);
      if (recent4w.length < 4) return null;

      let loSecs = 0, total = 0;
      for (const w of recent4w) {
        for (const z of (w.hrZones ?? [])) {
          total += z.seconds ?? 0;
          if (z.id === 'z1' || z.id === 'z2') loSecs += z.seconds ?? 0;
        }
      }
      if (total < 3600) return null;
      const easyPct = (loSecs / total) * 100;
      if (easyPct < 70) {
        return {
          severity: 'medium',
          title: 'Zone imbalance — too much intensity',
          body: `Only ${Math.round(easyPct)}% in Z1-Z2 over last 4 weeks (target: ≥80%). Excess middle-intensity accumulates junk load.`,
          action: null,
        };
      }
      return null;
    },
  },

  {
    id: 'recovery_deficit',
    check: (ctx) => {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yIso = yesterday.toISOString().slice(0, 10);
      const history = ctx.historyWorkouts ?? [];
      const yesterdayWorkout = history.find(w => w.date === yIso);
      const readiness = readinessScore(ctx);
      if (yesterdayWorkout?.load?.level === 'high' && readiness < 40) {
        return {
          severity: 'high',
          title: 'Recovery deficit today',
          body: `High-load session yesterday + readiness at ${Math.round(readiness)}%. Today should be full rest or Z1 only.`,
          action: 'recovery_check',
        };
      }
      return null;
    },
  },

  {
    id: 'acwr_danger',
    check: (ctx) => {
      const acwr = ctx.acwr;
      if (acwr == null) return null;
      if (acwr > 1.5) {
        return {
          severity: 'high',
          title: 'Injury risk: ACWR spike',
          body: `Acute:Chronic Workload Ratio at ${acwr.toFixed(2)} (safe range: 0.8–1.3). High injury risk — reduce load immediately.`,
          action: 'recovery_check',
        };
      }
      return null;
    },
  },

  {
    id: 'gear_replacement',
    check: (ctx) => {
      const gear = ctx.gear ?? [];
      const warned = gear
        .filter((item) => !item.is_retired)
        .map((item) => ({ item, status: gearStatus(item) }))
        .filter(({ status }) => status.alert === 'overdue' || status.alert === 'soon')
        .sort((a, b) => {
          const left = a.status.alert === 'overdue' ? 2 : 1;
          const right = b.status.alert === 'overdue' ? 2 : 1;
          return right - left;
        });
      if (warned.length) {
        const { item, status } = warned[0];
        const km = Math.round((item.total_distance_m ?? 0) / 1000);
        const intervalKm = Math.round(((item.service_interval_m || item.max_distance_m) ?? 0) / 1000);
        const isService = !!item.service_interval_m;
        return {
          severity: status.alert === 'overdue' ? 'medium' : 'low',
          title: `${item.name} ${isService ? 'needs service' : 'needs attention'}`,
          body: isService
            ? `${km} km logged since the last service cycle (target ${intervalKm} km).`
            : `${km} km used out of ${intervalKm} km planned lifecycle.`,
          action: null,
        };
      }
      return null;
    },
  },
];

/**
 * evaluateAlerts — run all rules and return sorted active alerts.
 */
export function evaluateAlerts(context) {
  return ALERT_RULES
    .map(rule => {
      try {
        const result = rule.check(context);
        return result ? { id: rule.id, ...result } : null;
      }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity));
}
