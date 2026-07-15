// Calorie math: BMR (Mifflin-St Jeor), TDEE, budget, BMI, pacing and nudges.
import type { Profile } from './db';

export const ACTIVITY_FACTORS: Record<Profile['activity'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<Profile['activity'], string> = {
  sedentary: 'Mostly sitting',
  light: 'On my feet sometimes',
  moderate: 'Active most days',
  active: 'Training hard',
  very_active: 'Athlete mode',
};

export function bmr(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm' | 'weightKg'>): number {
  const age = new Date().getFullYear() - p.birthYear;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}

export function tdee(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm' | 'weightKg' | 'activity'>): number {
  return Math.round(bmr(p) * ACTIVITY_FACTORS[p.activity]);
}

// 1 kg of body fat is roughly 7700 kcal.
export function dailyBudget(p: Omit<Profile, 'id' | 'dailyBudgetKcal' | 'onboardedAt' | 'strictness' | 'handCm'>): number {
  const maintenance = tdee(p);
  const delta = (p.paceKgPerWeek * 7700) / 7;
  const raw = p.goal === 'lose' ? maintenance - delta : p.goal === 'gain' ? maintenance + delta : maintenance;
  // Never go below a sane floor.
  const floor = p.sex === 'male' ? 1500 : 1200;
  return Math.round(Math.max(raw, floor));
}

export function bmi(heightCm: number, weightKg: number): number {
  const h = heightCm / 100;
  return +(weightKg / (h * h)).toFixed(1);
}

export function bmiCategory(v: number): string {
  if (v < 18.5) return 'under the typical range';
  if (v < 25) return 'in the typical range';
  if (v < 30) return 'above the typical range';
  return 'well above the typical range';
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
export function checkPace(profile: Profile, consumed: number, now: Date): Nudge | null {
  const factor = STRICTNESS_FACTOR[profile.strictness];
  if (!isFinite(factor)) return null;
  const budget = profile.dailyBudgetKcal;
  const expected = expectedFractionByHour(now.getHours() + now.getMinutes() / 60) * budget * factor;
  if (consumed <= expected) return null;

  const remaining = Math.round(budget - consumed);
  const hour = now.getHours();

  if (remaining <= 0) {
    return {
      title: 'Budget reached for today',
      body: 'You are at your calories for the day. Water, tea or a walk beats a snack right now. Tomorrow is a fresh start.',
    };
  }
  if (hour < 15) {
    return {
      title: 'Heads up, big morning',
      body: `You have ${remaining} kcal left and most of the day ahead. Maybe keep lunch or dinner light: a salad, soup or a yogurt would fit nicely.`,
    };
  }
  if (hour < 19) {
    return {
      title: 'Save room for dinner',
      body: `${remaining} kcal left for today. A lighter dinner keeps you on track: grilled veggies, a salad or an omelette would fit.`,
    };
  }
  return {
    title: 'Almost done for today',
    body: `${remaining} kcal left. If you get hungry later, a yogurt or some fruit fits. You have got this.`,
  };
}

export function fmtKcal(n: number): string {
  return Math.round(n).toLocaleString('en-US');
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

export const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
  drink: '☕️',
};
