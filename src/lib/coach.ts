// AI nutrition coach: a small persistent chat backed by its own table in the
// shared on-device DB. Talks to Gemini the same way analyzer.ts does (REST
// fetch, systemInstruction + contents), but with text in, text out instead
// of a photo + JSON schema.
import * as SQLite from 'expo-sqlite';
import { GEMINI_API_KEY, GEMINI_BASE, MODEL_FALLBACK, MODEL_PRIMARY } from './config';
import { getDayContext, describeDayForAI } from './day-context';

export type CoachRole = 'user' | 'assistant';

export type CoachMessage = {
  id: number;
  role: CoachRole;
  content: string;
  createdAt: string;
};

const db = SQLite.openDatabaseSync('snapcal.db');

let initialized = false;

/** Creates the coach_messages table if needed. Safe to call more than once. */
export function initCoach() {
  if (initialized) return;
  initialized = true;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS coach_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
}

initCoach();

export function getMessages(): CoachMessage[] {
  return db.getAllSync<CoachMessage>('SELECT * FROM coach_messages ORDER BY id ASC');
}

export function addMessage(role: CoachRole, content: string): CoachMessage {
  const createdAt = new Date().toISOString();
  const res = db.runSync(
    'INSERT INTO coach_messages (role, content, createdAt) VALUES (?, ?, ?)',
    role, content, createdAt,
  );
  return { id: Number(res.lastInsertRowId), role, content, createdAt };
}

export function clearMessages(): void {
  db.runSync('DELETE FROM coach_messages');
}

// How many recent turns to send back to Gemini as context. Keeps requests
// small and cheap while still giving the model the thread so far.
const HISTORY_WINDOW = 20;

function buildSystemPrompt(): string {
  const ctx = getDayContext();
  const profile = ctx.profile;

  return `You are the in-app AI nutrition coach for SnapCal, a photo-based calorie tracking app. You chat with the user about their eating, their goals, their training and their calorie budget.

User context:
- Sex: ${profile.sex}
- Goal: ${profile.goal}${profile.goal !== 'maintain' ? ` at ${profile.paceKgPerWeek} kg/week` : ''}
${describeDayForAI(ctx)}

Style:
- Be friendly, encouraging and concise. Prefer short paragraphs or a tight bullet list over long essays.
- Be practical: give concrete food, portion and timing suggestions tied to the user's remaining budget, their training and their goal.
- If they are mid-fast, respect it: suggest zero-calorie options until the fast is due to end, and never nag them to eat during it.
- Reference their numbers above when it's useful, but don't recite all of them every reply.
- Never invent entries or numbers you weren't given.

Boundaries:
- You are not a doctor. Do not diagnose conditions, interpret symptoms, or advise on medication, supplements dosing, or medical treatment. If the user asks something medical, briefly say that's outside what you can help with and suggest they check with a doctor or registered dietitian, then move on.`;
}

async function callGemini(model: string, systemPrompt: string, contents: { role: string; parts: { text: string }[] }[]): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
  };
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

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
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends userText plus recent conversation history to Gemini and returns the
 * coach's reply text. Does not persist anything itself — the caller decides
 * when/what to save via addMessage().
 */
export async function askCoach(userText: string): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const history = getMessages().slice(-HISTORY_WINDOW);
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: userText }] });

  try {
    return await callGemini(MODEL_PRIMARY, systemPrompt, contents);
  } catch {
    return await callGemini(MODEL_FALLBACK, systemPrompt, contents);
  }
}
