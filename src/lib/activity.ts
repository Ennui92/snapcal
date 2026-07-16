// Orchestrates the fitness providers and answers the one question the rest
// of the app asks: "how much extra did the user burn on day X?"
import { getMeta, setMeta, trackedBurnForDay, trackedBurnForRange, type Profile } from './db';
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

export function lastSyncAt(): string | null {
  return getMeta('activity_last_sync');
}

// Sync every connected provider. Throttled so screens can call it freely on
// focus; a manual "Sync now" passes force. Returns whether fresh data landed
// (callers refresh the UI only then, avoiding focus→sync→refresh loops).
// Throws only when *every* provider failed, so one flaky API doesn't hide
// the other's data.
export async function syncActivity(force = false): Promise<boolean> {
  if (!anyProviderConnected()) return false;
  if (!force) {
    const last = lastSyncAt();
    if (last && Date.now() - new Date(last).getTime() < 30 * 60_000) return false;
  }

  const errors: string[] = [];
  let succeeded = 0;
  if (strava.stravaConnected()) {
    try { await strava.syncStrava(); succeeded++; } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  if (hc.healthConnectConnected()) {
    try { await hc.syncHealthConnect(); succeeded++; } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }

  if (succeeded > 0) setMeta('activity_last_sync', new Date().toISOString());
  if (succeeded === 0 && errors.length) throw new Error(errors.join(' · '));
  return succeeded > 0;
}
