// Background photo analysis. Fire analyzeEntry() right after the shutter and
// forget about it: the entry sits in the log as "analyzing" and fills in when
// Gemini answers. Known packaged products are matched against the local DB
// first so repeat foods stay consistent (and cheap).
import * as ImageManipulator from 'expo-image-manipulator';
import * as Notifications from 'expo-notifications';
import {
  ANALYZER_PROXY_URL, GEMINI_API_KEY, GEMINI_BASE, MODEL_FALLBACK, MODEL_PRIMARY,
  UPLOAD_JPEG_QUALITY, UPLOAD_WIDTH,
} from './config';
import {
  consumedForDay, dayKeyFor, findKnownProduct, getEntry, getItems, getKnownProducts,
  getMeta, getPendingEntries, getProfile, replaceItems, setEntryAnalysis, setEntryStatus,
  setMeta, upsertKnownProduct,
} from './db';
import { checkPace } from './nutrition';

type AiItem = {
  name: string;
  brand?: string | null;
  portionGrams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isPackaged: boolean;
  packageSizeGrams?: number | null;
  kcalPer100g: number;
  confidence: number;
};

type AiResult = {
  items: AiItem[];
  mealGuess: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
  description: string;
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          brand: { type: 'STRING', nullable: true },
          portionGrams: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          proteinG: { type: 'NUMBER' },
          carbsG: { type: 'NUMBER' },
          fatG: { type: 'NUMBER' },
          isPackaged: { type: 'BOOLEAN' },
          packageSizeGrams: { type: 'NUMBER', nullable: true },
          kcalPer100g: { type: 'NUMBER' },
          confidence: { type: 'NUMBER' },
        },
        required: ['name', 'portionGrams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'isPackaged', 'kcalPer100g', 'confidence'],
      },
    },
    mealGuess: { type: 'STRING', enum: ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] },
    description: { type: 'STRING' },
  },
  required: ['items', 'mealGuess', 'description'],
};

function buildSystemPrompt(handCm: number): string {
  const known = getKnownProducts(30);
  const knownBlock = known.length
    ? `\nThe user regularly consumes these known products (from their personal history). If the photo shows one of them, reuse these exact per-100g values instead of guessing:\n` +
      known.map(k => `- ${k.brand ? k.brand + ' ' : ''}${k.name}: ${k.kcalPer100g} kcal/100g${k.packageSizeGrams ? `, package ${k.packageSizeGrams}g` : ''}`).join('\n')
    : '';
  return `You are a nutrition analyst inside a calorie tracking app. The user photographs food or drink right before consuming it. Analyze the photo and estimate calories and macros.

Rules:
- If a human hand is visible, use it for scale. The user's hand measures ${handCm} cm from the start of the palm to the tip of the middle finger.
- For packaged or branded products (soda cans, chocolate bars, snacks), identify the brand and product and use known nutrition data for the package size you see.
- Estimate portions in grams or milliliters. Prefer slight overestimates to underestimates (users under-log).
- A meal can include multiple items and a drink. List each separately.
- If the image contains no food or drink, return an empty items array with a description of what you see.
- Plain water, black coffee and tea have roughly 0 to 5 kcal. Still list them.${knownBlock}`;
}

async function callGemini(model: string, base64: string, handCm: number, takenAt: Date): Promise<AiResult> {
  const when = takenAt.toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(handCm) }] },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        { text: `Analyze this photo taken on ${when}.` },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const url = ANALYZER_PROXY_URL
    ? ANALYZER_PROXY_URL
    : `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
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
    return JSON.parse(text) as AiResult;
  } finally {
    clearTimeout(timeout);
  }
}

const inFlight = new Set<number>();

export async function analyzeEntry(entryId: number): Promise<void> {
  if (inFlight.has(entryId)) return;
  inFlight.add(entryId);
  try {
    const entry = getEntry(entryId);
    if (!entry || !entry.photoUri) return;
    setEntryStatus(entryId, 'analyzing');

    // Downscale + strip to base64. 1024px is plenty for recognition.
    const manipulated = await ImageManipulator.manipulateAsync(
      entry.photoUri,
      [{ resize: { width: UPLOAD_WIDTH } }],
      { compress: UPLOAD_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!manipulated.base64) throw new Error('could not read photo');

    const profile = getProfile();
    let result: AiResult;
    try {
      result = await callGemini(MODEL_PRIMARY, manipulated.base64, profile.handCm, new Date(entry.takenAt));
    } catch {
      result = await callGemini(MODEL_FALLBACK, manipulated.base64, profile.handCm, new Date(entry.takenAt));
    }

    // Prefer the user's own product history over fresh guesses for packaged items.
    const items = result.items.map((it) => {
      const known = it.isPackaged ? findKnownProduct(it.name, it.brand ?? null) : null;
      if (known && known.kcalPer100g > 0 && it.portionGrams > 0) {
        const g = it.portionGrams;
        return {
          ...it,
          kcal: (known.kcalPer100g * g) / 100,
          proteinG: (known.proteinPer100g * g) / 100,
          carbsG: (known.carbsPer100g * g) / 100,
          fatG: (known.fatPer100g * g) / 100,
          kcalPer100g: known.kcalPer100g,
        };
      }
      return it;
    });

    replaceItems(entryId, items.map(it => ({
      name: it.name,
      brand: it.brand ?? null,
      portionGrams: it.portionGrams,
      kcal: it.kcal,
      proteinG: it.proteinG,
      carbsG: it.carbsG,
      fatG: it.fatG,
      isPackaged: it.isPackaged ? 1 : 0,
      kcalPer100g: it.kcalPer100g,
      confidence: it.confidence,
    })));

    // Remember packaged products for next time.
    for (const it of items) {
      if (it.isPackaged && it.kcalPer100g > 0) {
        const g = it.portionGrams || 100;
        upsertKnownProduct({
          name: it.name,
          brand: it.brand ?? null,
          kcalPer100g: it.kcalPer100g,
          proteinPer100g: (it.proteinG / g) * 100,
          carbsPer100g: (it.carbsG / g) * 100,
          fatPer100g: (it.fatG / g) * 100,
          packageSizeGrams: it.packageSizeGrams ?? null,
        });
      }
    }

    const description = result.description || items.map(i => i.name).join(', ');
    setEntryAnalysis(entryId, description, result.mealGuess || entry.mealType);

    await maybeNudge();
  } catch (err) {
    setEntryStatus(entryId, 'error', err instanceof Error ? err.message : String(err));
  } finally {
    inFlight.delete(entryId);
  }
}

// Re-run anything that never finished (killed app, no network, API hiccup).
export function retryPending(): void {
  for (const e of getPendingEntries()) {
    void analyzeEntry(e.id);
  }
}

// Gentle intervention when the day is running hot. At most one nudge per 4 hours.
async function maybeNudge(): Promise<void> {
  try {
    const profile = getProfile();
    const now = new Date();
    const consumed = consumedForDay(dayKeyFor(now));
    const nudge = checkPace(profile, consumed, now);
    if (!nudge) return;

    const last = getMeta('lastNudgeAt');
    if (last && now.getTime() - new Date(last).getTime() < 4 * 3600 * 1000) return;

    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return;

    await Notifications.scheduleNotificationAsync({
      content: { title: nudge.title, body: nudge.body },
      trigger: null, // now
    });
    setMeta('lastNudgeAt', now.toISOString());
  } catch {
    // Nudges are best-effort; never let them break logging.
  }
}
