// Intermittent fasting: a fasting session is just a start/end timestamp pair
// against a target duration, kept in its own table. Everything else the
// screen needs (progress, history, presets) is derived from that.
import * as SQLite from 'expo-sqlite';

export type FastingSession = {
  id: number;
  startAt: string; // ISO
  endAt: string | null; // ISO, null while the fast is running
  targetHours: number;
  completed: number; // 0/1 — did elapsed reach the target before ending
};

export type Preset = { label: string; hours: number };

// 16:8, 18:6, 20:4, OMAD (23:1), plus a stand-in for "type your own".
export const PRESETS: Preset[] = [
  { label: '16:8', hours: 16 },
  { label: '18:6', hours: 18 },
  { label: '20:4', hours: 20 },
  { label: 'OMAD', hours: 23 },
];

export const CUSTOM_LABEL = 'Custom';
export const MIN_CUSTOM_HOURS = 1;
export const MAX_CUSTOM_HOURS = 72;

const db = SQLite.openDatabaseSync('snapcal.db');

let initialized = false;

// Creates the fasting_sessions table if it isn't there yet. Safe to call as
// often as needed — the real work only runs once per process.
export function initFasting() {
  if (initialized) return;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS fasting_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startAt TEXT,
      endAt TEXT,
      targetHours REAL,
      completed INTEGER DEFAULT 0
    );
  `);
  initialized = true;
}

// The one session currently running, if any.
export function getActiveSession(): FastingSession | null {
  initFasting();
  return db.getFirstSync<FastingSession>(
    'SELECT * FROM fasting_sessions WHERE endAt IS NULL ORDER BY id DESC LIMIT 1',
  ) ?? null;
}

// Starts a new fast. If one is already running, it is left alone and its id
// is returned instead of starting a second, overlapping fast.
export function startFast(targetHours: number): number {
  initFasting();
  const active = getActiveSession();
  if (active) return active.id;
  const res = db.runSync(
    'INSERT INTO fasting_sessions (startAt, endAt, targetHours, completed) VALUES (?, NULL, ?, 0)',
    new Date().toISOString(), targetHours,
  );
  return Number(res.lastInsertRowId);
}

// Ends the active fast (no-op if none). `completed` is true when the elapsed
// time reached the target, whether the user stopped right on time or let it
// run over.
export function endFast(): void {
  initFasting();
  const active = getActiveSession();
  if (!active) return;
  const now = new Date();
  const elapsedHours = (now.getTime() - new Date(active.startAt).getTime()) / 3_600_000;
  const completed = elapsedHours >= active.targetHours ? 1 : 0;
  db.runSync(
    'UPDATE fasting_sessions SET endAt = ?, completed = ? WHERE id = ?',
    now.toISOString(), completed, active.id,
  );
}

// Most recent finished fasts, newest first.
export function getRecentSessions(limit = 10): FastingSession[] {
  initFasting();
  return db.getAllSync<FastingSession>(
    'SELECT * FROM fasting_sessions WHERE endAt IS NOT NULL ORDER BY startAt DESC LIMIT ?',
    limit,
  );
}
