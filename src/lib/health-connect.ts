// Google Health Connect (Android): the successor to the retired Google Fit
// API. One connection covers whatever feeds it — Google Fit, Garmin, Samsung
// Health, Fitbit… The native module is loaded lazily so the JS bundle still
// runs on platforms where it doesn't exist (web, iOS until that build).
import { Platform } from 'react-native';
import { clearActivitySource, dayKeyFor, getMeta, setMeta, upsertActivityDay } from './db';

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

export async function syncHealthConnect(days = 14): Promise<void> {
  await ensureInit();
  for (let i = 0; i < days; i++) {
    const start = windowStart(i);
    const end = new Date(start.getTime() + 24 * 3600_000);
    const dayKey = dayKeyFor(start);

    let kcal = 0;
    let steps = 0;
    try {
      const r = await aggregate('ActiveCaloriesBurned', start, end);
      kcal = r?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0;
    } catch {}
    try {
      const r = await aggregate('Steps', start, end);
      steps = r?.COUNT_TOTAL ?? 0;
    } catch {}

    upsertActivityDay({ dayKey, source: SOURCE, activeKcal: Math.round(kcal), steps: Math.round(steps) });
  }
}
