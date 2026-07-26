// Orchestrates the fitness providers and answers the one question the rest
// of the app asks: "how much extra did the user burn on day X?"
import { getMeta, setMeta, trackedBurnForDay, trackedBurnForRange, trackedStepsForDay, type Profile } from './db';
import { effectiveBudget } from './nutrition';
import * as hc from './health-connect';
import * as strava from './strava';

export function anyProviderConnected(): boolean {
  return strava.stravaConnected() || hc.healthConnectConnected();
}

export function connectedProviderNames(): string[] {
  const names: string[] = [];
  if (strava.stravaConnected()) names.push('Strava');
  if (hc.healthConnectConnected()) names.push('Health Connect');
  return names;
}

// "Count workouts toward my budget" — on by default once something is connected.
export function useTrackedActivity(): boolean {
  return getMeta('use_tracked_activity') !== '0';
}

export function setUseTrackedActivity(on: boolean) {
  setMeta('use_tracked_activity', on ? '1' : '0');
}

// Tracked burn for a day, or null when it shouldn't influence the budget
// (nothing connected, toggle off, or no synced data for that day).
export function burnedForDay(dayKey: string): number | null {
  if (!anyProviderConnected() || !useTrackedActivity()) return null;
  return trackedBurnForDay(dayKey);
}

export function budgetForDay(profile: Profile, dayKey: string): { budget: number; burn: number | null } {
  const burn = burnedForDay(dayKey);
  return { budget: effectiveBudget(profile, burn), burn };
}

// Per-day tracked burn for a range; empty when tracking shouldn't apply.
export function burnedForRange(fromDayKey: string, toDayKey: string): Map<string, number> {
  if (!anyProviderConnected() || !useTrackedActivity()) return new Map();
  return trackedBurnForRange(fromDayKey, toDayKey);
}

// Steps for a day across sources (largest single source wins, same rule the
// burn aggregation uses, so two providers reporting the same day don't stack).
export function stepsForDay(dayKey: string): number {
  if (!anyProviderConnected()) return 0;
  return trackedStepsForDay(dayKey);
}

export function lastSyncAt(): string | null {
  return getMeta('activity_last_sync');
}

// --- diagnostics: what actually happened the last time we tried to sync ---
// A user complaint of "sync is broken" is undiagnosable without this: every
// previous version wrote a row even when a provider silently returned
// nothing, so a permission failure and a genuine rest day looked identical.

export type ActivitySyncReport = {
  ranAt: string;
  providersAttempted: string[];
  providersSucceeded: string[];
  errors: string[];
  hc?: {
    daysChecked: number;
    activeDaysFound: number;
    totalFallbackDaysFound: number;
    stepDaysFound: number;
    metricUsed: 'active' | 'total_estimate' | 'none';
  };
};

export function lastSyncReport(): ActivitySyncReport | null {
  const raw = getMeta('activity_last_report');
  if (!raw) return null;
  try { return JSON.parse(raw) as ActivitySyncReport; } catch { return null; }
}

export function lastSyncError(): string | null {
  const raw = getMeta('activity_last_error');
  return raw && raw.length ? raw : null;
}

// Sync every connected provider. Throttled so screens can call it freely on
// focus; a manual "Sync now" passes force=true, which always runs regardless
// of the cooldown — a user-initiated sync is never silently swallowed by the
// throttle, only an automatic background one is.
// Returns whether fresh data landed (callers refresh the UI only then,
// avoiding focus→sync→refresh loops).
// Throws only when *every* provider failed, so one flaky API doesn't hide
// the other's data — but every run, throttled or not, records a report so
// Connections can always explain what happened.
export async function syncActivity(force = false): Promise<boolean> {
  if (!anyProviderConnected()) return false;
  if (!force) {
    const last = lastSyncAt();
    if (last && Date.now() - new Date(last).getTime() < 30 * 60_000) return false;
  }

  const providersAttempted: string[] = [];
  const providersSucceeded: string[] = [];
  const errors: string[] = [];
  let hcReport: hc.HcSyncReport | null = null;

  if (strava.stravaConnected()) {
    providersAttempted.push('Strava');
    try {
      await strava.syncStrava();
      providersSucceeded.push('Strava');
    } catch (e) {
      errors.push(`Strava: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (hc.healthConnectConnected()) {
    providersAttempted.push('Health Connect');
    try {
      hcReport = await hc.syncHealthConnect();
      providersSucceeded.push('Health Connect');
      if (hcReport.errors.length) errors.push(...hcReport.errors.map(e => `Health Connect: ${e}`));
    } catch (e) {
      errors.push(`Health Connect: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const succeeded = providersSucceeded.length;
  if (succeeded > 0) setMeta('activity_last_sync', new Date().toISOString());

  const report: ActivitySyncReport = {
    ranAt: new Date().toISOString(),
    providersAttempted,
    providersSucceeded,
    errors,
    ...(hcReport ? {
      hc: {
        daysChecked: hcReport.daysChecked,
        activeDaysFound: hcReport.activeDaysFound,
        totalFallbackDaysFound: hcReport.totalFallbackDaysFound,
        stepDaysFound: hcReport.stepDaysFound,
        metricUsed: hcReport.metricUsed,
      },
    } : {}),
  };
  setMeta('activity_last_report', JSON.stringify(report));
  setMeta('activity_last_error', errors.join(' · '));

  if (succeeded === 0 && errors.length) throw new Error(errors.join(' · '));
  return succeeded > 0;
}
