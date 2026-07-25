// Next-meal suggestions. Takes the remaining calories in the user's day
// (budget minus what's already logged) and their goal, and asks Gemini for
// a handful of real, simple meals that fit. Same REST + JSON-schema pattern
// as analyzer.ts — no image involved this time, just numbers and text.
import {
  ANALYZER_PROXY_URL, GEMINI_API_KEY, GEMINI_BASE, MODEL_FALLBACK, MODEL_PRIMARY,
} from './config';
import { consumedForDay, dayKeyFor, getEntriesForDay, getProfile, type Profile } from './db';

export type MealSuggestion = {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  blurb: string;
  ingredients: string[];
};

export type SuggestResult = {
  remainingKcal: number;
  budgetKcal: number;
  consumedKcal: number;
  goal: Profile['goal'];
  meals: MealSuggestion[];
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    meals: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          kcal: { type: 'NUMBER' },
          proteinG: { type: 'NUMBER' },
          carbsG: { type: 'NUMBER' },
          fatG: { type: 'NUMBER' },
          blurb: { type: 'STRING' },
          ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['name', 'kcal', 'proteinG', 'carbsG', 'fatG', 'blurb', 'ingredients'],
      },
    },
  },
  required: ['meals'],
};

function goalLine(goal: Profile['goal']): string {
  if (goal === 'lose') {
    return "The user is losing weight: favor higher-protein, higher-volume, lower calorie-density meals that are filling per calorie.";
  }
  if (goal === 'gain') {
    return 'The user is gaining weight/muscle: favor calorie-dense, higher-protein meals that are easy to eat in one sitting.';
  }
  return 'The user is maintaining their weight: favor balanced, satisfying, everyday meals.';
}

function buildPrompt(opts: {
  remaining: number; budget: number; consumed: number; goal: Profile['goal']; eatenSoFar: string[]; count: number;
}): string {
  const { remaining, budget, consumed, goal, eatenSoFar, count } = opts;
  const eatenLine = eatenSoFar.length
    ? `So far today they have already eaten: ${eatenSoFar.join('; ')}.`
    : "They haven't logged anything yet today.";
  const remainingLine = remaining <= 50
    ? `They have almost nothing left in today's budget (${Math.round(remaining)} kcal remaining out of ${Math.round(budget)}). Suggest very light options, or something small enough to still fit.`
    : `They have ${Math.round(remaining)} kcal left today out of a ${Math.round(budget)} kcal budget (${Math.round(consumed)} kcal already logged).`;

  return `You are a nutrition assistant inside a calorie-tracking app. Suggest what the user could eat next, right now.

${remainingLine}
${goalLine(goal)}
${eatenLine}

Suggest exactly ${count} distinct, real, simple meal ideas a home cook could actually make (or easily buy) that fit within roughly the remaining calories for a single meal — a little under is great, a little over is fine, but never wildly over the remaining budget. Prefer whole, simple foods over fussy recipes, and don't repeat what they already ate today. For each meal give a one-sentence blurb explaining why it fits their remaining calories and goal, and list 3 to 6 short ingredient names (no quantities, keep them short, e.g. "chicken breast" not "200g grilled chicken breast").`;
}

async function callGemini(model: string, prompt: string): Promise<MealSuggestion[]> {
  const body = {
    systemInstruction: {
      parts: [{
        text: 'You are a precise, practical nutrition assistant. Numbers must be realistic and internally consistent '
          + '(protein*4 + carbs*4 + fat*9 should roughly equal kcal). Never invent brand names; suggest real, ordinary food.',
      }],
    },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const url = ANALYZER_PROXY_URL
    ? ANALYZER_PROXY_URL
    : `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('empty model response');
    const parsed = JSON.parse(text) as { meals: MealSuggestion[] };
    return Array.isArray(parsed.meals) ? parsed.meals : [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Suggest 3-4 meals that fit in whatever's left of today's calorie budget.
 * Computes remaining = dailyBudgetKcal - consumedToday from the on-device DB,
 * then asks Gemini (primary model, falling back to the lite model on error)
 * for structured meal ideas respecting the remaining calories and the
 * user's goal (lose/maintain/gain).
 */
export async function suggestMeals(opts: { count?: number } = {}): Promise<SuggestResult> {
  const count = opts.count && opts.count >= 3 && opts.count <= 4 ? opts.count : 4;

  const profile = getProfile();
  const dayKey = dayKeyFor(new Date());
  const consumed = consumedForDay(dayKey);
  const budget = profile.dailyBudgetKcal;
  const remaining = budget - consumed;

  const eatenSoFar = getEntriesForDay(dayKey)
    .filter(e => e.status === 'done' && e.description)
    .map(e => e.description)
    .slice(0, 8);

  const prompt = buildPrompt({ remaining, budget, consumed, goal: profile.goal, eatenSoFar, count });

  let meals: MealSuggestion[];
  try {
    meals = await callGemini(MODEL_PRIMARY, prompt);
  } catch {
    meals = await callGemini(MODEL_FALLBACK, prompt);
  }
  if (!meals.length) throw new Error('no suggestions returned');

  return {
    remainingKcal: remaining,
    budgetKcal: budget,
    consumedKcal: consumed,
    goal: profile.goal,
    meals,
  };
}
