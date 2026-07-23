// Calorie math: BMR (Mifflin-St Jeor), TDEE, budget, BMI, pacing and nudges.
import type { Profile } from './db';
import { localeTag, t, type TKey } from './i18n';

export const ACTIVITY_FACTORS: Record<Profile['activity'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_KEYS = Object.keys(ACTIVITY_FACTORS) as Profile['activity'][];

export function activityLabel(a: Profile['activity']): string {
  return t(`act.${a}` as TKey);
}

export function bmr(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm' | 'weightKg'>): number {
  const age = new Date().getFullYear() - p.birthYear;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}

export function tdee(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm' | 'weightKg' | 'activity'>): number {
  return Math.round(bmr(p) * ACTIVITY_FACTORS[p.activity]);
}

type BudgetInput = Omit<Profile, 'id' | 'dailyBudgetKcal' | 'onboardedAt' | 'strictness' | 'handCm'>;

// 1 kg of body fat is roughly 7700 kcal.
function applyGoal(maintenance: number, p: Pick<BudgetInput, 'sex' | 'goal' | 'paceKgPerWeek'>): number {
  const delta = (p.paceKgPerWeek * 7700) / 7;
  const raw = p.goal === 'lose' ? maintenance - delta : p.goal === 'gain' ? maintenance + delta : maintenance;
  // Never go below a sane floor.
  const floor = p.sex === 'male' ? 1500 : 1200;
  return Math.round(Math.max(raw, floor));
}

export function dailyBudget(p: BudgetInput): number {
  return applyGoal(tdee(p), p);
}

// Budget for a specific day when a fitness tracker reported the workout burn.
// The static activity multiplier from setup already *guesses* exercise, so we
// don't add on top of it — that would double-count. Instead the day is rebuilt
// from a sedentary baseline plus what was actually tracked.
export function effectiveBudget(p: Profile, trackedActiveKcal: number | null): number {
  if (trackedActiveKcal == null) return p.dailyBudgetKcal;
  const maintenance = Math.round(bmr(p) * ACTIVITY_FACTORS.sedentary) + Math.round(trackedActiveKcal);
  return applyGoal(maintenance, p);
}

export function bmi(heightCm: number, weightKg: number): number {
  const h = heightCm / 100;
  return +(weightKg / (h * h)).toFixed(1);
}

export function bmiCategory(v: number): string {
  if (v < 18.5) return t('bmi.under');
  if (v < 25) return t('bmi.typical');
  if (v < 30) return t('bmi.above');
  return t('bmi.wellAbove');
}

// Expected fraction of the daily budget consumed by a given hour.
// Slow start, steady through the day, done by 22:00.
export function expectedFractionByHour(hour: number): number {
  if (hour < 6) return 0.05;
  if (hour >= 22) return 1;
  return 0.05 + 0.95 * ((hour - 6) / 16);
}

const STRICTNESS_FACTOR: Record<Profile['strictness'], number> = {
  off: Infinity,
  gentle: 1.2,
  normal: 1.0,
  strict: 0.85,
};

export type Nudge = { title: string; body: string };

// Returns a nudge when the user is ahead of pace, null otherwise.
// `budget` is the day's effective budget (may include tracked workouts).
export function checkPace(profile: Profile, budget: number, consumed: number, now: Date): Nudge | null {
  const factor = STRICTNESS_FACTOR[profile.strictness];
  if (!isFinite(factor)) return null;
  const expected = expectedFractionByHour(now.getHours() + now.getMinutes() / 60) * budget * factor;
  if (consumed <= expected) return null;

  const remaining = Math.round(budget - consumed);
  const hour = now.getHours();

  if (remaining <= 0) {
    return { title: t('nudge.doneTitle'), body: t('nudge.doneBody') };
  }
  if (hour < 15) {
    return { title: t('nudge.morningTitle'), body: t('nudge.morningBody', { kcal: remaining }) };
  }
  if (hour < 19) {
    return { title: t('nudge.afternoonTitle'), body: t('nudge.afternoonBody', { kcal: remaining }) };
  }
  return { title: t('nudge.eveningTitle'), body: t('nudge.eveningBody', { kcal: remaining }) };
}

export function fmtKcal(n: number): string {
  return Math.round(n).toLocaleString(localeTag());
}

// Guess meal from local time; the AI may refine it later.
export function mealTypeForNow(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 15 && h < 18) return 'snack';
  if (h >= 18 && h < 23) return 'dinner';
  return 'snack';
}

// (meal glyphs removed in v0.3: the UI uses drawn icons, not emoji)

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];

// Localized meal name; unknown types (older data, odd AI output) pass through.
export function mealLabel(type: string): string {
  return MEAL_TYPES.includes(type) ? t(`meal.${type}` as TKey) : type;
}
