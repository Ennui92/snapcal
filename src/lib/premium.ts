// Freemium gating. One place that decides what is free and what needs Plus.
//
// The model (see docs/GTM.md): free logging is never limited, because logging
// is the habit and the word of mouth. What is metered is the thing that costs
// us money (AI photo scans) and the premium-feel extras (coach, recipes,
// barcode, voice, full history, fitness sync, social, themes). A reverse trial
// unlocks everything for the first 7 days.
//
// Entitlement is stored locally for now (meta table). When billing lands
// (RevenueCat), replace isPremium()'s source with the entitlement from the
// store; every call site here stays the same.
import { getMeta, getProfile, setMeta, dayKeyFor, countScansForDay } from './db';

export const FREE_SCAN_LIMIT = 3;
const TRIAL_DAYS = 7;

export type Feature =
  | 'unlimited_scans' | 'coach' | 'recipes' | 'barcode' | 'voice'
  | 'full_history' | 'weight_trend' | 'fitness_sync' | 'social'
  | 'themes' | 'fasting_insights';

// Everything a paying (or trialing) user gets.
const PREMIUM_FEATURES: Feature[] = [
  'unlimited_scans', 'coach', 'recipes', 'barcode', 'voice',
  'full_history', 'weight_trend', 'fitness_sync', 'social', 'themes', 'fasting_insights',
];

function trialActive(): boolean {
  const onboardedAt = getProfile().onboardedAt;
  if (!onboardedAt) return true; // during onboarding, treat as unlocked
  const days = (Date.now() - new Date(onboardedAt).getTime()) / 86_400_000;
  return days < TRIAL_DAYS;
}

/** True if the user currently has full access (paid entitlement or in trial). */
export function isPremium(): boolean {
  if (getMeta('entitlement') === 'plus') return true;
  return trialActive();
}

/** Days left in the reverse trial, or 0 if the trial is over / user is paid. */
export function trialDaysLeft(): number {
  if (getMeta('entitlement') === 'plus') return 0;
  const onboardedAt = getProfile().onboardedAt;
  if (!onboardedAt) return TRIAL_DAYS;
  const used = (Date.now() - new Date(onboardedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRIAL_DAYS - used));
}

/** Gate a named feature. Returns true when the user may use it. */
export function canUse(_feature: Feature): boolean {
  return isPremium();
}

/** AI photo scans remaining today for a free user (Infinity if premium). */
export function scansRemainingToday(): number {
  if (isPremium()) return Infinity;
  const used = countScansForDay(dayKeyFor(new Date()));
  return Math.max(0, FREE_SCAN_LIMIT - used);
}

/** Dev/manual unlock until billing is wired. */
export function setEntitlement(plus: boolean) {
  setMeta('entitlement', plus ? 'plus' : '');
}
