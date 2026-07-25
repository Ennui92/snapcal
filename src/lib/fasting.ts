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
// ── Day-level queries ─────────────────────────────────────────────────────
// Fasting used to be a screen that knew nothing about the rest of the app and
// which nothing else could ask about. These let stats, share cards, the diary,
// the coach and the nudges all reason about a fast.

/** The wall-clock window a dayKey covers. Days flip at 03:00, per dayKeyFor. */
function dayWindow(dayKey: string): { start: number; end: number } {
  const [y, m, d] = dayKey.split('-').map(Number);
  const start = new Date(y, m - 1, d, 3, 0, 0, 0).getTime();
  return { start, end: start + 24 * 3600_000 };
}

/**
 * Hours spent fasting during a given day, summing the overlap of every session
 * with that day's window (a 16h fast usually straddles two days, so this
 * attributes the right slice to each).
 */
export function fastingHoursForDay(dayKey: string): number {
  initFasting();
  const { start, end } = dayWindow(dayKey);
  const rows = db.getAllSync<{ startAt: string; endAt: string | null }>(
    // Any session that could overlap this window: started before it ended, and
    // either still running or ended after the window began.
    `SELECT startAt, endAt FROM fasting_sessions
     WHERE startAt <= ? AND (endAt IS NULL OR endAt >= ?)`,
    new Date(end).toISOString(), new Date(start).toISOString(),
  );
  let ms = 0;
  for (const r of rows) {
    const s = new Date(r.startAt).getTime();
    const e = r.endAt ? new Date(r.endAt).getTime() : Date.now();
    ms += Math.max(0, Math.min(e, end) - Math.max(s, start));
  }
  return Math.round((ms / 3600_000) * 10) / 10;
}

export function fastingHoursForRange(fromDayKey: string, toDayKey: string): Map<string, number> {
  const out = new Map<string, number>();
  const [fy, fm, fd] = fromDayKey.split('-').map(Number);
  const cursor = new Date(fy, fm - 1, fd, 12, 0, 0, 0);
  for (let i = 0; i < 400; i++) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    out.set(key, fastingHoursForDay(key));
    if (key >= toDayKey) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export type ActiveFast = { elapsedHours: number; targetHours: number; reachedTarget: boolean };

/** The running fast, if any — the thing other features need to not talk nonsense. */
export function activeFast(): ActiveFast | null {
  const s = getActiveSession();
  if (!s) return null;
  const elapsed = (Date.now() - new Date(s.startAt).getTime()) / 3600_000;
  return {
    elapsedHours: Math.round(elapsed * 10) / 10,
    targetHours: s.targetHours,
    reachedTarget: elapsed >= s.targetHours,
  };
}

export function getRecentSessions(limit = 10): FastingSession[] {
  initFasting();
  return db.getAllSync<FastingSession>(
    'SELECT * FROM fasting_sessions WHERE endAt IS NOT NULL ORDER BY startAt DESC LIMIT ?',
    limit,
  );
}
