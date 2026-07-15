// On-device SQLite. Everything the user logs lives here and only here.
import * as SQLite from 'expo-sqlite';

export type Profile = {
  id: number;
  sex: 'male' | 'female';
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
  paceKgPerWeek: number; // 0 for maintain
  strictness: 'off' | 'gentle' | 'normal' | 'strict';
  handCm: number;
  dailyBudgetKcal: number;
  onboardedAt: string | null;
};

export type Entry = {
  id: number;
  takenAt: string; // ISO
  dayKey: string; // YYYY-MM-DD, day flips at 03:00 so midnight snacks count for the evening before
  photoUri: string | null;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  errorMsg: string | null;
  mealType: string;
  description: string;
  eatenPct: number; // 0..100
  totalKcal: number; // for 100% eaten; multiply by eatenPct for consumed
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type Item = {
  id: number;
  entryId: number;
  name: string;
  brand: string | null;
  portionGrams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isPackaged: number;
  kcalPer100g: number;
  confidence: number;
};

export type KnownProduct = {
  id: number;
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  packageSizeGrams: number | null;
  timesSeen: number;
  lastSeenAt: string;
};

const db = SQLite.openDatabaseSync('snapcal.db');

export function initDb() {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sex TEXT NOT NULL DEFAULT 'male',
      birthYear INTEGER NOT NULL DEFAULT 1990,
      heightCm REAL NOT NULL DEFAULT 175,
      weightKg REAL NOT NULL DEFAULT 75,
      activity TEXT NOT NULL DEFAULT 'light',
      goal TEXT NOT NULL DEFAULT 'lose',
      paceKgPerWeek REAL NOT NULL DEFAULT 0.5,
      strictness TEXT NOT NULL DEFAULT 'normal',
      handCm REAL NOT NULL DEFAULT 18.5,
      dailyBudgetKcal INTEGER NOT NULL DEFAULT 2000,
      onboardedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      takenAt TEXT NOT NULL,
      dayKey TEXT NOT NULL,
      photoUri TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      errorMsg TEXT,
      mealType TEXT NOT NULL DEFAULT 'snack',
      description TEXT NOT NULL DEFAULT '',
      eatenPct INTEGER NOT NULL DEFAULT 100,
      totalKcal REAL NOT NULL DEFAULT 0,
      proteinG REAL NOT NULL DEFAULT 0,
      carbsG REAL NOT NULL DEFAULT 0,
      fatG REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_entries_day ON entries(dayKey);
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entryId INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      brand TEXT,
      portionGrams REAL NOT NULL DEFAULT 0,
      kcal REAL NOT NULL DEFAULT 0,
      proteinG REAL NOT NULL DEFAULT 0,
      carbsG REAL NOT NULL DEFAULT 0,
      fatG REAL NOT NULL DEFAULT 0,
      isPackaged INTEGER NOT NULL DEFAULT 0,
      kcalPer100g REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS known_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT,
      kcalPer100g REAL NOT NULL,
      proteinPer100g REAL NOT NULL DEFAULT 0,
      carbsPer100g REAL NOT NULL DEFAULT 0,
      fatPer100g REAL NOT NULL DEFAULT 0,
      packageSizeGrams REAL,
      timesSeen INTEGER NOT NULL DEFAULT 1,
      lastSeenAt TEXT NOT NULL,
      UNIQUE(name, brand)
    );
    CREATE TABLE IF NOT EXISTS weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weightKg REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    INSERT OR IGNORE INTO profile (id) VALUES (1);
  `);
}

// Day flips at 03:00 local: a 00:30 snack belongs to the previous day.
export function dayKeyFor(date: Date): string {
  const d = new Date(date.getTime() - 3 * 3600 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getProfile(): Profile {
  return db.getFirstSync<Profile>('SELECT * FROM profile WHERE id = 1')!;
}

export function saveProfile(p: Partial<Profile>) {
  const cur = getProfile();
  const next = { ...cur, ...p };
  db.runSync(
    `UPDATE profile SET sex=?, birthYear=?, heightCm=?, weightKg=?, activity=?, goal=?,
     paceKgPerWeek=?, strictness=?, handCm=?, dailyBudgetKcal=?, onboardedAt=? WHERE id=1`,
    next.sex, next.birthYear, next.heightCm, next.weightKg, next.activity, next.goal,
    next.paceKgPerWeek, next.strictness, next.handCm, next.dailyBudgetKcal, next.onboardedAt,
  );
}

export function insertEntry(photoUri: string, mealType: string): number {
  const now = new Date();
  const res = db.runSync(
    'INSERT INTO entries (takenAt, dayKey, photoUri, status, mealType) VALUES (?, ?, ?, ?, ?)',
    now.toISOString(), dayKeyFor(now), photoUri, 'pending', mealType,
  );
  return Number(res.lastInsertRowId);
}

export function getEntry(id: number): Entry | null {
  return db.getFirstSync<Entry>('SELECT * FROM entries WHERE id = ?', id) ?? null;
}

export function getEntriesForDay(dayKey: string): Entry[] {
  return db.getAllSync<Entry>('SELECT * FROM entries WHERE dayKey = ? ORDER BY takenAt DESC', dayKey);
}

export function getPendingEntries(): Entry[] {
  return db.getAllSync<Entry>(
    "SELECT * FROM entries WHERE status IN ('pending','error','analyzing') ORDER BY takenAt ASC",
  );
}

export function setEntryStatus(id: number, status: Entry['status'], errorMsg: string | null = null) {
  db.runSync('UPDATE entries SET status=?, errorMsg=? WHERE id=?', status, errorMsg, id);
}

export function setEntryEatenPct(id: number, pct: number) {
  db.runSync('UPDATE entries SET eatenPct=? WHERE id=?', pct, id);
}

export function deleteEntry(id: number) {
  db.runSync('DELETE FROM items WHERE entryId=?', id);
  db.runSync('DELETE FROM entries WHERE id=?', id);
}

export function getItems(entryId: number): Item[] {
  return db.getAllSync<Item>('SELECT * FROM items WHERE entryId=?', entryId);
}

export function replaceItems(entryId: number, items: Omit<Item, 'id' | 'entryId'>[]) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM items WHERE entryId=?', entryId);
    for (const it of items) {
      db.runSync(
        `INSERT INTO items (entryId, name, brand, portionGrams, kcal, proteinG, carbsG, fatG, isPackaged, kcalPer100g, confidence)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        entryId, it.name, it.brand, it.portionGrams, it.kcal, it.proteinG, it.carbsG, it.fatG,
        it.isPackaged, it.kcalPer100g, it.confidence,
      );
    }
    recomputeEntryTotals(entryId);
  });
}

export function updateItemPortion(itemId: number, portionGrams: number) {
  const it = db.getFirstSync<Item>('SELECT * FROM items WHERE id=?', itemId);
  if (!it) return;
  const factor = it.portionGrams > 0 ? portionGrams / it.portionGrams : 0;
  db.runSync(
    'UPDATE items SET portionGrams=?, kcal=?, proteinG=?, carbsG=?, fatG=? WHERE id=?',
    portionGrams, it.kcal * factor, it.proteinG * factor, it.carbsG * factor, it.fatG * factor, itemId,
  );
  recomputeEntryTotals(it.entryId);
}

export function deleteItem(itemId: number) {
  const it = db.getFirstSync<Item>('SELECT * FROM items WHERE id=?', itemId);
  if (!it) return;
  db.runSync('DELETE FROM items WHERE id=?', itemId);
  recomputeEntryTotals(it.entryId);
}

export function addManualItem(entryId: number, name: string, kcal: number) {
  db.runSync(
    `INSERT INTO items (entryId, name, brand, portionGrams, kcal, proteinG, carbsG, fatG, isPackaged, kcalPer100g, confidence)
     VALUES (?,?,NULL,0,?,0,0,0,0,0,1)`,
    entryId, name, kcal,
  );
  recomputeEntryTotals(entryId);
}

export function recomputeEntryTotals(entryId: number) {
  const row = db.getFirstSync<{ k: number; p: number; c: number; f: number }>(
    'SELECT COALESCE(SUM(kcal),0) k, COALESCE(SUM(proteinG),0) p, COALESCE(SUM(carbsG),0) c, COALESCE(SUM(fatG),0) f FROM items WHERE entryId=?',
    entryId,
  )!;
  db.runSync('UPDATE entries SET totalKcal=?, proteinG=?, carbsG=?, fatG=? WHERE id=?',
    row.k, row.p, row.c, row.f, entryId);
}

export function setEntryAnalysis(entryId: number, description: string, mealType: string) {
  db.runSync('UPDATE entries SET description=?, mealType=?, status=? WHERE id=?',
    description, mealType, 'done', entryId);
}

// Consumed kcal for a day, honoring the eaten percentage.
export function consumedForDay(dayKey: string): number {
  const row = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(totalKcal * eatenPct / 100.0), 0) total FROM entries WHERE dayKey=?', dayKey,
  );
  return Math.round(row?.total ?? 0);
}

export type DaySummary = { dayKey: string; consumed: number; entries: number };

export function daySummaries(fromDayKey: string, toDayKey: string): DaySummary[] {
  return db.getAllSync<DaySummary>(
    `SELECT dayKey, ROUND(COALESCE(SUM(totalKcal * eatenPct / 100.0),0)) consumed, COUNT(*) entries
     FROM entries WHERE dayKey >= ? AND dayKey <= ? GROUP BY dayKey ORDER BY dayKey ASC`,
    fromDayKey, toDayKey,
  );
}

export function getKnownProducts(limit = 30): KnownProduct[] {
  return db.getAllSync<KnownProduct>(
    'SELECT * FROM known_products ORDER BY timesSeen DESC, lastSeenAt DESC LIMIT ?', limit,
  );
}

export function findKnownProduct(name: string, brand: string | null): KnownProduct | null {
  return db.getFirstSync<KnownProduct>(
    'SELECT * FROM known_products WHERE lower(name)=lower(?) AND lower(COALESCE(brand,\'\'))=lower(COALESCE(?,\'\'))',
    name, brand,
  ) ?? null;
}

export function upsertKnownProduct(p: {
  name: string; brand: string | null; kcalPer100g: number; proteinPer100g: number;
  carbsPer100g: number; fatPer100g: number; packageSizeGrams: number | null;
}) {
  const existing = findKnownProduct(p.name, p.brand);
  if (existing) {
    db.runSync(
      'UPDATE known_products SET timesSeen=timesSeen+1, lastSeenAt=? WHERE id=?',
      new Date().toISOString(), existing.id,
    );
  } else {
    db.runSync(
      `INSERT INTO known_products (name, brand, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, packageSizeGrams, lastSeenAt)
       VALUES (?,?,?,?,?,?,?,?)`,
      p.name, p.brand, p.kcalPer100g, p.proteinPer100g, p.carbsPer100g, p.fatPer100g,
      p.packageSizeGrams, new Date().toISOString(),
    );
  }
}

export function logWeight(weightKg: number) {
  db.runSync('INSERT INTO weights (date, weightKg) VALUES (?,?)', new Date().toISOString(), weightKg);
  saveProfile({ weightKg });
}

export function getWeights(): { date: string; weightKg: number }[] {
  return db.getAllSync('SELECT date, weightKg FROM weights ORDER BY date ASC');
}

export function getMeta(key: string): string | null {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key=?', key);
  return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db.runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)', key, value);
}

export function exportAllData(): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    profile: getProfile(),
    entries: db.getAllSync('SELECT * FROM entries'),
    items: db.getAllSync('SELECT * FROM items'),
    knownProducts: db.getAllSync('SELECT * FROM known_products'),
    weights: getWeights(),
  }, null, 2);
}
