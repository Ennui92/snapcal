// Google Health Connect (Android): the successor to the retired Google Fit
// API. One connection covers whatever feeds it — Google Fit, Garmin, Samsung
// Health, Fitbit… The native module is loaded lazily so the JS bundle still
// runs on platforms where it doesn't exist (web, iOS until that build).
import { Platform } from 'react-native';
import { clearActivitySource, dayKeyFor, getMeta, getProfile, setMeta, upsertActivityDay } from './db';

export const SOURCE = 'health_connect';

let HC: any = null;
if (Platform.OS === 'android') {
  try { HC = require('react-native-health-connect'); } catch { HC = null; }
}

export const healthConnectSupported = !!HC;

export function healthConnectConnected(): boolean {
  return healthConnectSupported && getMeta('hc_connected') === '1';
}

async function ensureInit() {
  if (!HC) throw new Error('Health Connect is not available in this build');
  const ok = await HC.initialize();
  if (!ok) throw new Error('Health Connect is not available on this phone');
}

export async function connectHealthConnect(): Promise<boolean> {
  await ensureInit();
  const granted: any[] = await HC.requestPermission([
    { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    { accessType: 'read', recordType: 'TotalCaloriesBurned' },
    { accessType: 'read', recordType: 'Steps' },
  ]);
  if (!granted || granted.length === 0) return false;
  setMeta('hc_connected', '1');
  return true;
}

export function disconnectHealthConnect() {
  setMeta('hc_connected', '0');
  clearActivitySource(SOURCE);
}

// Start of the SnapCal day `i` days ago. Days flip at 03:00 local (matching
// dayKeyFor), so each window runs 03:00 → 03:00.
function windowStart(daysAgo: number): Date {
  const d = new Date();
  d.setHours(3, 0, 0, 0);
  if (new Date() < d) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

async function aggregate(recordType: string, start: Date, end: Date): Promise<any> {
  return HC.aggregateRecord({
    recordType,
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
  });
}

// Rough resting-burn estimate (Mifflin-St Jeor) so a day's worth of BMR can be
// subtracted out of TotalCaloriesBurned when ActiveCaloriesBurned isn't
// populated — some phones/providers (several Pixels included) only ever
// report Total + Steps. Falls back to a mid-range default if the profile
// can't be read, since this is a "better than reporting 0" estimate, not a
// clinical one.
function estimateBmrKcal(): number {
  try {
    const p = getProfile();
    const age = Math.max(15, new Date().getFullYear() - p.birthYear);
    const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age;
    return Math.round(p.sex === 'male' ? base + 5 : base - 161);
  } catch {
    return 1600;
  }
}

export type HcSyncReport = {
  ranAt: string;
  daysChecked: number;
  // Days where ActiveCaloriesBurned itself returned a non-zero value.
  activeDaysFound: number;
  // Days where we had to fall back to TotalCaloriesBurned minus the estimated
  // BMR share, because ActiveCaloriesBurned was absent/zero.
  totalFallbackDaysFound: number;
  stepDaysFound: number;
  // Which metric actually ended up feeding the stored numbers, across the
  // whole sync — tells the UI whether to explain the fallback.
  metricUsed: 'active' | 'total_estimate' | 'none';
  // Per-record-type failures, never swallowed silently.
  errors: string[];
};

export async function syncHealthConnect(days = 14): Promise<HcSyncReport> {
  await ensureInit();

  const errors: string[] = [];
  let activeDaysFound = 0;
  let totalFallbackDaysFound = 0;
  let stepDaysFound = 0;
  const bmrKcal = estimateBmrKcal();

  for (let i = 0; i < days; i++) {
    const start = windowStart(i);
    const end = new Date(start.getTime() + 24 * 3600_000);
    const dayKey = dayKeyFor(start);

    let activeKcal = 0;
    let totalKcal = 0;
    let steps = 0;

    try {
      const r = await aggregate('ActiveCaloriesBurned', start, end);
      activeKcal = r?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0;
    } catch (e) {
      errors.push(`ActiveCaloriesBurned ${dayKey}: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (activeKcal <= 0) {
      // Either genuinely zero effort that day, or this phone/provider just
      // doesn't populate ActiveCaloriesBurned (common on Pixels that only log
      // Total + Steps) — try Total minus an estimated resting share instead of
      // silently reporting a burn of 0.
      try {
        const r = await aggregate('TotalCaloriesBurned', start, end);
        totalKcal = r?.TOTAL_CALORIES_TOTAL?.inKilocalories ?? 0;
      } catch (e) {
        errors.push(`TotalCaloriesBurned ${dayKey}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    try {
      const r = await aggregate('Steps', start, end);
      steps = r?.COUNT_TOTAL ?? 0;
    } catch (e) {
      errors.push(`Steps ${dayKey}: ${e instanceof Error ? e.message : String(e)}`);
    }

    let kcal = 0;
    if (activeKcal > 0) {
      kcal = activeKcal;
      activeDaysFound++;
    } else if (totalKcal > 0) {
      kcal = Math.max(0, Math.round(totalKcal - bmrKcal));
      if (kcal > 0) totalFallbackDaysFound++;
    }
    if (steps > 0) stepDaysFound++;

    upsertActivityDay({ dayKey, source: SOURCE, activeKcal: Math.round(kcal), steps: Math.round(steps) });
  }

  return {
    ranAt: new Date().toISOString(),
    daysChecked: days,
    activeDaysFound,
    totalFallbackDaysFound,
    stepDaysFound,
    metricUsed: activeDaysFound > 0 ? 'active' : totalFallbackDaysFound > 0 ? 'total_estimate' : 'none',
    errors,
  };
}
