// One description of a day, assembled once and read by everything.
//
// Before this, each feature saw a different slice: the coach knew the budget
// but not what you burned or whether you were fasting, the nudge could suggest
// a snack in the middle of an 18-hour fast, share cards showed calories eaten
// with no mention of a workout, and the fasting screen was an island. This is
// the single place that answers "what happened on this day".
import { consumedForDay, dayKeyFor, getEntriesForDay, getProfile, type Profile } from './db';
import { budgetForDay, stepsForDay, anyProviderConnected } from './activity';
import { activeFast, fastingHoursForDay, type ActiveFast } from './fasting';
import { fmtKcal } from './nutrition';

export type DayContext = {
  dayKey: string;
  profile: Profile;
  /** Budget already includes tracked burn on days that have it. */
  budget: number;
  consumed: number;
  remaining: number;
  burn: number | null;
  steps: number;
  fitnessConnected: boolean;
  /** consumed minus burn: the number that actually moves the scale. */
  net: number;
  meals: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fastingHours: number;
  activeFast: ActiveFast | null;
};

export function getDayContext(dayKey: string = dayKeyFor(new Date())): DayContext {
  const profile = getProfile();
  const { budget, burn } = budgetForDay(profile, dayKey);
  const consumed = consumedForDay(dayKey);
  const entries = getEntriesForDay(dayKey);

  let protein = 0, carbs = 0, fat = 0, sugar = 0;
  for (const e of entries) {
    const f = (e.eatenPct ?? 100) / 100;
    protein += (e.proteinG ?? 0) * f;
    carbs += (e.carbsG ?? 0) * f;
    fat += (e.fatG ?? 0) * f;
    sugar += (e.sugarG ?? 0) * f;
  }

  return {
    dayKey,
    profile,
    budget,
    consumed,
    remaining: budget - consumed,
    burn,
    steps: stepsForDay(dayKey),
    fitnessConnected: anyProviderConnected(),
    net: consumed - (burn ?? 0),
    meals: entries.length,
    protein, carbs, fat, sugar,
    fastingHours: fastingHoursForDay(dayKey),
    activeFast: activeFast(),
  };
}

/**
 * A compact plain-text briefing for the AI features (coach, recipes), so their
 * advice accounts for training and fasting instead of calories alone.
 */
export function describeDayForAI(ctx: DayContext = getDayContext()): string {
  const lines: string[] = [
    `- Daily calorie budget: ${Math.round(ctx.budget)} kcal`,
    `- Eaten so far today: ${Math.round(ctx.consumed)} kcal across ${ctx.meals} ${ctx.meals === 1 ? 'entry' : 'entries'}`,
    `- Remaining: ${Math.round(ctx.remaining)} kcal`,
  ];

  if (ctx.burn != null && ctx.burn > 0) {
    lines.push(
      `- Tracked exercise today: ${Math.round(ctx.burn)} kcal burned${ctx.steps > 0 ? `, ${ctx.steps.toLocaleString()} steps` : ''}. ` +
      `Their budget already accounts for this, so do not tell them to eat it back a second time.`,
    );
  } else if (ctx.fitnessConnected) {
    lines.push('- No tracked exercise recorded for today yet.');
  }

  if (ctx.protein + ctx.carbs + ctx.fat > 0) {
    lines.push(`- Macros so far: ${Math.round(ctx.protein)}g protein, ${Math.round(ctx.carbs)}g carbs, ${Math.round(ctx.fat)}g fat, ${Math.round(ctx.sugar)}g sugar`);
  }

  if (ctx.activeFast) {
    lines.push(
      `- THEY ARE FASTING RIGHT NOW: ${ctx.activeFast.elapsedHours}h into a ${ctx.activeFast.targetHours}h fast` +
      (ctx.activeFast.reachedTarget
        ? ', and they have already passed their target, so it is fine to suggest breaking it.'
        : `, with ${Math.max(0, Math.round((ctx.activeFast.targetHours - ctx.activeFast.elapsedHours) * 10) / 10)}h to go. Do NOT suggest eating before then unless they ask to break the fast; suggest water, black coffee or tea instead.`),
    );
  } else if (ctx.fastingHours > 0) {
    lines.push(`- They fasted about ${ctx.fastingHours}h during this day.`);
  }

  return lines.join('\n');
}

/** One-line summary used in shared text, e.g. the stats share message. */
export function describeDayForShare(ctx: DayContext = getDayContext()): string {
  const bits = [`${fmtKcal(ctx.consumed)} in`];
  if (ctx.burn != null && ctx.burn > 0) bits.push(`${fmtKcal(ctx.burn)} out`);
  if (ctx.fastingHours >= 1) bits.push(`${ctx.fastingHours}h fasted`);
  return bits.join(' · ');
}
