// Voice logging: "I had a cup of Greek yogurt with honey and some grapes" in,
// a parsed meal out. One Gemini call transcribes the recording AND extracts
// structured items in the same pass — no separate speech-to-text step.
//
// The recorder hook itself (useAudioRecorder) has to live in a component, so
// this module only holds the non-hook parts: the mic permission helper and
// the transcribe+parse+save pipeline. See src/app/add.tsx for the recording
// UI.
import * as FileSystem from 'expo-file-system/legacy';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import {
  ANALYZER_PROXY_URL, GEMINI_API_KEY, GEMINI_BASE, MODEL_FALLBACK, MODEL_PRIMARY,
} from './config';
import { insertManualEntry, replaceItems, setEntryAnalysis, type Item } from './db';
import { getLanguage, LANG_NAME_EN, localeTag } from './i18n';

export type ParsedMealItem = {
  name: string;
  portionGrams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
};

export type ParsedMeal = {
  transcript: string;
  mealType: string;
  items: ParsedMealItem[];
};

/** Ask for microphone access and put the audio session into recording mode. */
export async function ensureMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  if (granted) {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  }
  return granted;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    mealType: { type: 'STRING', enum: ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          portionGrams: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          proteinG: { type: 'NUMBER' },
          carbsG: { type: 'NUMBER' },
          fatG: { type: 'NUMBER' },
          sugarG: { type: 'NUMBER' },
        },
        required: ['name', 'portionGrams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'sugarG'],
      },
    },
  },
  required: ['transcript', 'mealType', 'items'],
};

function buildPrompt(when: string): string {
  const language = LANG_NAME_EN[getLanguage()];
  return `You are a nutrition analyst inside a calorie tracking app. The user just spoke a short voice note describing what they ate or drank, recorded on ${when}. Listen to the audio, transcribe it, and extract the food items with estimated nutrition.

Rules:
- First transcribe exactly what was said (in the language it was spoken in) into "transcript".
- Then extract each distinct food or drink item mentioned into "items", with your best estimate of portion size and nutrition.
- The user often speaks vaguely ("a cup of", "some", "a handful", "a couple of"). Convert vague quantities into sensible gram or milliliter estimates using common serving sizes; prefer slight overestimates to underestimates (users under-log).
- sugarG is the total sugar in the portion (a subset of carbsG); estimate 0 for water, plain coffee and unseasoned meat.
- Guess which meal this most likely is (breakfast, lunch, dinner, snack, or drink) from context and time of day into "mealType".
- Write all item names in ${language}, regardless of the language spoken.
- If the recording contains no food or drink mention, return an empty items array and still fill in "transcript".`;
}

function mimeTypeForUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
  switch (ext) {
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case '3gp':
      return 'audio/3gpp';
    default:
      return 'audio/mp4';
  }
}

async function callGemini(model: string, base64: string, mimeType: string, when: string): Promise<ParsedMeal> {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: buildPrompt(when) },
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
    return JSON.parse(text) as ParsedMeal;
  } finally {
    clearTimeout(timeout);
  }
}

/** Transcribe a recorded voice note and extract a structured meal from it in one call. */
export async function transcribeAndParse(audioUri: string): Promise<ParsedMeal> {
  const base64 = await FileSystem.readAsStringAsync(audioUri, { encoding: 'base64' });
  const mimeType = mimeTypeForUri(audioUri);
  const when = new Date().toLocaleString(localeTag(), { weekday: 'long', hour: '2-digit', minute: '2-digit' });

  try {
    return await callGemini(MODEL_PRIMARY, base64, mimeType, when);
  } catch {
    return await callGemini(MODEL_FALLBACK, base64, mimeType, when);
  }
}

/** Write a parsed voice meal using the existing manual-entry + items pipeline. */
export function saveParsedMeal(parsed: ParsedMeal, takenAt: Date, mealType: string): number {
  const items = parsed.items.length > 0 ? parsed.items : [{
    name: parsed.transcript || 'Voice note', portionGrams: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, sugarG: 0,
  }];
  const first = items[0];
  const entryId = insertManualEntry({
    name: first.name,
    kcal: first.kcal,
    grams: first.portionGrams,
    sugarG: first.sugarG,
    mealType,
    takenAt,
  });
  replaceItems(entryId, items.map((it): Omit<Item, 'id' | 'entryId'> => ({
    name: it.name,
    brand: null,
    portionGrams: it.portionGrams,
    kcal: it.kcal,
    proteinG: it.proteinG,
    carbsG: it.carbsG,
    fatG: it.fatG,
    sugarG: it.sugarG,
    isPackaged: 0,
    kcalPer100g: it.portionGrams > 0 ? (it.kcal / it.portionGrams) * 100 : 0,
    confidence: 1,
  })));
  const description = parsed.transcript || items.map(i => i.name).join(', ');
  setEntryAnalysis(entryId, description, mealType);
  return entryId;
}
