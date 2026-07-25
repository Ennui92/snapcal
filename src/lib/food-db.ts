// Multi-source product resolver + local cache for barcode/product lookups.
//
// Open Food Facts alone has thin coverage for Greek supermarket items, so
// this file layers four sources, cheapest and most reliable first:
//   1. Local cache (this file's own `product_catalog` table) — instant, free,
//      works offline. This table also holds the bundled seed catalogue
//      (seeded once at init), so a scan of a seeded barcode is a step-1 hit.
//   2. (folded into step 1 — see above)
//   3. Open Food Facts, country-aware: the device's own country subdomain
//      first (e.g. gr.openfoodfacts.org), then world.openfoodfacts.org.
//   4. AI label reading: `identifyProductByPhoto` sends a photo of the pack
//      to Gemini and asks it to transcribe the nutrition panel. This is the
//      caller's job to trigger (it needs a photo), not part of the barcode
//      cascade itself.
// Anything resolved via OFF or AI is written back into the cache so the next
// lookup for that barcode is an instant step-1 hit.
import { getLocales } from 'expo-localization';
import * as SQLite from 'expo-sqlite';
import { GEMINI_API_KEY, GEMINI_BASE, MODEL_FALLBACK, MODEL_PRIMARY } from '@/lib/config';
import { getLanguage, LANG_NAME_EN } from '@/lib/i18n';
import { SEED_PRODUCTS, type SeedProduct } from '@/data/seed-products';
import CATALOGUE_GR from '@/data/catalogue-gr.json';
import CATALOGUE_CY from '@/data/catalogue-cy.json';
import CATALOGUE_GLOBAL from '@/data/catalogue-global.json';

// Compact bulk row: [barcode, name, brand, kcal, protein, carbs, fat, sugar]
// per 100g. Stored as arrays rather than objects to keep the bundled JSON
// small and the parse cheap.
type BulkRow = [string, string, string, number, number, number, number, number];
const BULK_CHUNK = 400;

export type CatalogRow = {
  id: number;
  barcode: string | null;
  name: string;
  brand: string | null;
  country: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sugarPer100g: number;
  servingGrams: number | null;
  source: string;
  updatedAt: string;
};

export type ResolvedSource = 'local' | 'off';

export type ResolvedProduct = {
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sugarPer100g: number;
  servingGrams: number | null;
  source: ResolvedSource;
};

export type AiPhotoProduct = {
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sugarPer100g: number;
  servingGrams: number | null;
};

const db = SQLite.openDatabaseSync('snapcal.db');

// Bump this whenever SEED_PRODUCTS changes meaningfully; refreshCatalog()
// re-seeds when the stored version doesn't match.
const SEED_VERSION = '2';

let initialized = false;

/** Guarded — safe to call as many times as you like, from anywhere. */
export function initFoodDb() {
  if (initialized) return;
  initialized = true;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS product_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT,
      name TEXT NOT NULL,
      brand TEXT,
      country TEXT,
      kcalPer100g REAL,
      proteinPer100g REAL,
      carbsPer100g REAL,
      fatPer100g REAL,
      sugarPer100g REAL,
      servingGrams REAL,
      source TEXT,
      updatedAt TEXT,
      UNIQUE(barcode)
    );
    CREATE INDEX IF NOT EXISTS idx_product_catalog_name ON product_catalog(name);
    CREATE TABLE IF NOT EXISTS product_catalog_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  refreshCatalog();
}

function getCatalogMeta(key: string): string | null {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM product_catalog_meta WHERE key=?', key);
  return row?.value ?? null;
}

function setCatalogMeta(key: string, value: string) {
  db.runSync('INSERT OR REPLACE INTO product_catalog_meta (key, value) VALUES (?,?)', key, value);
}

/**
 * Re-seeds the bundled catalogue if SEED_VERSION changed since last run;
 * cheap no-op otherwise. Safe to call on every app open.
 */
export function refreshCatalog() {
  if (getCatalogMeta('seed_version') === SEED_VERSION) return;

  // The curated list is tiny, so it lands immediately.
  db.withTransactionSync(() => {
    for (const p of SEED_PRODUCTS) {
      seedOne(p);
    }
  });

  // The bulk catalogues are ~17k rows. Inserting those synchronously would
  // stall the very first launch after an update, so they go in just after the
  // first frame. The version marker is only written once the bulk finishes, so
  // an app killed mid-seed simply picks it up again next launch.
  if (bulkSeedScheduled) return;
  bulkSeedScheduled = true;
  setTimeout(() => {
    try {
      db.withTransactionSync(() => {
        seedBulk();
        // Curated entries win over bulk rows, so re-apply them on top.
        for (const p of SEED_PRODUCTS) seedOne(p);
      });
      setCatalogMeta('seed_version', SEED_VERSION);
    } catch {
      // Leave the version unset so the next launch retries.
    } finally {
      bulkSeedScheduled = false;
    }
  }, 0);
}

let bulkSeedScheduled = false;

/**
 * Load the bundled bulk catalogues: this device's country (where we ship one)
 * plus the globally most-scanned products, which is what people actually put
 * in front of a scanner regardless of where they live.
 */
function seedBulk() {
  const region = deviceRegion();
  const packs: BulkRow[][] = [];
  if (region === 'GR') packs.push(CATALOGUE_GR as BulkRow[]);
  if (region === 'CY') packs.push(CATALOGUE_CY as BulkRow[]);
  // Greek-speaking markets get both; everyone gets the global staples.
  if (region === 'GR') packs.push(CATALOGUE_CY as BulkRow[]);
  packs.push(CATALOGUE_GLOBAL as BulkRow[]);

  const country = region ?? 'XX';
  for (const pack of packs) {
    // Insert in chunks: one statement per chunk is far cheaper than one per row.
    for (let i = 0; i < pack.length; i += BULK_CHUNK) {
      insertBulk(pack.slice(i, i + BULK_CHUNK), country);
    }
  }
}

function seedOne(p: SeedProduct) {
  const now = new Date().toISOString();
  if (p.barcodes.length === 0) {
    // No verified barcode — still worth having for name search. Insert
    // unconditionally; UNIQUE(barcode) doesn't dedupe NULLs, so guard against
    // re-running this exact seed twice by checking name+brand first.
    const existing = db.getFirstSync<{ id: number }>(
      'SELECT id FROM product_catalog WHERE barcode IS NULL AND lower(name)=lower(?) AND lower(COALESCE(brand,\'\'))=lower(COALESCE(?,\'\'))',
      p.name, p.brand,
    );
    if (existing) return;
    db.runSync(
      `INSERT INTO product_catalog (barcode, name, brand, country, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, sugarPer100g, servingGrams, source, updatedAt)
       VALUES (NULL,?,?,?,?,?,?,?,?,?,'seed',?)`,
      p.name, p.brand, p.country, p.kcalPer100g, p.proteinPer100g, p.carbsPer100g, p.fatPer100g,
      p.sugarPer100g, p.servingGrams ?? null, now,
    );
    return;
  }
  for (const barcode of p.barcodes) {
    db.runSync(
      `INSERT INTO product_catalog (barcode, name, brand, country, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, sugarPer100g, servingGrams, source, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,'seed',?)
       ON CONFLICT(barcode) DO UPDATE SET
         name=excluded.name, brand=excluded.brand, country=excluded.country,
         kcalPer100g=excluded.kcalPer100g, proteinPer100g=excluded.proteinPer100g,
         carbsPer100g=excluded.carbsPer100g, fatPer100g=excluded.fatPer100g,
         sugarPer100g=excluded.sugarPer100g, servingGrams=excluded.servingGrams,
         updatedAt=excluded.updatedAt`,
      barcode, p.name, p.brand, p.country, p.kcalPer100g, p.proteinPer100g, p.carbsPer100g,
      p.fatPer100g, p.sugarPer100g, p.servingGrams ?? null, now,
    );
  }
}

export function lookupByBarcode(code: string): CatalogRow | null {
  initFoodDb();
  return db.getFirstSync<CatalogRow>('SELECT * FROM product_catalog WHERE barcode = ?', code) ?? null;
}

export function searchByName(query: string, limit = 20): CatalogRow[] {
  initFoodDb();
  const trimmed = query.trim();
  if (!trimmed) return [];
  const like = `%${trimmed}%`;
  return db.getAllSync<CatalogRow>(
    'SELECT * FROM product_catalog WHERE name LIKE ? OR brand LIKE ? ORDER BY name ASC LIMIT ?',
    like, like, limit,
  );
}

export function catalogCount(): number {
  initFoodDb();
  const row = db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM product_catalog');
  return row?.n ?? 0;
}

/** Upsert a resolved product into the cache, keyed by barcode when we have one. */
export function saveProduct(p: {
  barcode?: string | null;
  name: string;
  brand?: string | null;
  country?: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sugarPer100g: number;
  servingGrams?: number | null;
  source: string;
}) {
  initFoodDb();
  const now = new Date().toISOString();
  const barcode = p.barcode ?? null;
  if (barcode) {
    db.runSync(
      `INSERT INTO product_catalog (barcode, name, brand, country, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, sugarPer100g, servingGrams, source, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(barcode) DO UPDATE SET
         name=excluded.name, brand=excluded.brand, country=excluded.country,
         kcalPer100g=excluded.kcalPer100g, proteinPer100g=excluded.proteinPer100g,
         carbsPer100g=excluded.carbsPer100g, fatPer100g=excluded.fatPer100g,
         sugarPer100g=excluded.sugarPer100g, servingGrams=excluded.servingGrams,
         source=excluded.source, updatedAt=excluded.updatedAt`,
      barcode, p.name, p.brand ?? null, p.country ?? null, p.kcalPer100g, p.proteinPer100g,
      p.carbsPer100g, p.fatPer100g, p.sugarPer100g, p.servingGrams ?? null, p.source, now,
    );
    return;
  }
  const existing = db.getFirstSync<{ id: number }>(
    'SELECT id FROM product_catalog WHERE barcode IS NULL AND lower(name)=lower(?) AND lower(COALESCE(brand,\'\'))=lower(COALESCE(?,\'\'))',
    p.name, p.brand ?? null,
  );
  if (existing) {
    db.runSync(
      `UPDATE product_catalog SET country=?, kcalPer100g=?, proteinPer100g=?, carbsPer100g=?, fatPer100g=?,
       sugarPer100g=?, servingGrams=?, source=?, updatedAt=? WHERE id=?`,
      p.country ?? null, p.kcalPer100g, p.proteinPer100g, p.carbsPer100g, p.fatPer100g,
      p.sugarPer100g, p.servingGrams ?? null, p.source, now, existing.id,
    );
  } else {
    db.runSync(
      `INSERT INTO product_catalog (barcode, name, brand, country, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, sugarPer100g, servingGrams, source, updatedAt)
       VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?)`,
      p.name, p.brand ?? null, p.country ?? null, p.kcalPer100g, p.proteinPer100g, p.carbsPer100g,
      p.fatPer100g, p.sugarPer100g, p.servingGrams ?? null, p.source, now,
    );
  }
}

function rowToResolved(row: CatalogRow, source: ResolvedSource): ResolvedProduct {
  return {
    name: row.name,
    brand: row.brand,
    kcalPer100g: row.kcalPer100g,
    proteinPer100g: row.proteinPer100g,
    carbsPer100g: row.carbsPer100g,
    fatPer100g: row.fatPer100g,
    sugarPer100g: row.sugarPer100g,
    servingGrams: row.servingGrams,
    source,
  };
}

// --- Open Food Facts ---

const OFF_FIELDS = 'product_name,product_name_el,brands,nutriments,serving_size,quantity,countries_tags';

function numOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

// serving_size/quantity are free text like "30 g", "1 bar (45g)" or "330 ml".
// Pull the first gram-or-millilitre-ish number out; ml is treated as grams,
// a fine approximation for the drinks and sauces this matters for.
function parseGrams(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/([\d.,]+)\s*(g|ml)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return isFinite(n) && n > 0 ? n : null;
}

type OffProduct = {
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sugarPer100g: number;
  servingGrams: number | null;
};

async function fetchOffFrom(host: string, code: string): Promise<OffProduct | null> {
  const url = `https://${host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status !== 1 || !json?.product) return null;

    const product = json.product;
    const nutriments = product.nutriments ?? {};
    const preferGreek = getLanguage() === 'el';
    const nameEl: string | undefined = product.product_name_el;
    const nameDefault: string | undefined = product.product_name;
    const name = (preferGreek && nameEl?.trim()) ? nameEl.trim() : (nameDefault?.trim() || nameEl?.trim());
    if (!name) return null;

    const kcalPer100g = numOrZero(nutriments['energy-kcal_100g']);
    if (kcalPer100g <= 0) return null;

    return {
      name,
      brand: typeof product.brands === 'string' && product.brands.trim() ? product.brands.split(',')[0].trim() : null,
      kcalPer100g,
      proteinPer100g: numOrZero(nutriments['proteins_100g']),
      carbsPer100g: numOrZero(nutriments['carbohydrates_100g']),
      fatPer100g: numOrZero(nutriments['fat_100g']),
      sugarPer100g: numOrZero(nutriments['sugars_100g']),
      servingGrams: parseGrams(product.serving_size) ?? parseGrams(product.quantity),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Device country as an OFF subdomain host, e.g. 'GR' -> 'gr.openfoodfacts.org'. */
function deviceCountryHost(): string | null {
  try {
    const region = getLocales()?.[0]?.regionCode;
    if (!region || typeof region !== 'string') return null;
    return `${region.toLowerCase()}.openfoodfacts.org`;
  } catch {
    return null;
  }
}

const WORLD_HOST = 'world.openfoodfacts.org';

/**
 * The barcode cascade: local cache/seed catalogue first (instant), then
 * Open Food Facts (country subdomain, then world). Returns null when nothing
 * knows this code — the caller can then offer the AI label-photo fallback.
 */
export async function resolveBarcode(code: string): Promise<ResolvedProduct | null> {
  initFoodDb();

  const cached = lookupByBarcode(code);
  if (cached && cached.kcalPer100g > 0) {
    return rowToResolved(cached, 'local');
  }

  const countryHost = deviceCountryHost();
  let off: OffProduct | null = null;
  if (countryHost && countryHost !== WORLD_HOST) {
    off = await fetchOffFrom(countryHost, code);
  }
  if (!off) {
    off = await fetchOffFrom(WORLD_HOST, code);
  }
  if (!off) return null;

  saveProduct({
    barcode: code,
    name: off.name,
    brand: off.brand,
    country: countryHost ? countryHost.split('.')[0].toUpperCase() : null,
    kcalPer100g: off.kcalPer100g,
    proteinPer100g: off.proteinPer100g,
    carbsPer100g: off.carbsPer100g,
    fatPer100g: off.fatPer100g,
    sugarPer100g: off.sugarPer100g,
    servingGrams: off.servingGrams,
    source: 'off',
  });

  return {
    name: off.name,
    brand: off.brand,
    kcalPer100g: off.kcalPer100g,
    proteinPer100g: off.proteinPer100g,
    carbsPer100g: off.carbsPer100g,
    fatPer100g: off.fatPer100g,
    sugarPer100g: off.sugarPer100g,
    servingGrams: off.servingGrams,
    source: 'off',
  };
}

// --- AI label reading (last resort: no barcode match anywhere) ---

const AI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    brand: { type: 'STRING', nullable: true },
    kcalPer100g: { type: 'NUMBER' },
    proteinPer100g: { type: 'NUMBER' },
    carbsPer100g: { type: 'NUMBER' },
    fatPer100g: { type: 'NUMBER' },
    sugarPer100g: { type: 'NUMBER' },
    servingGrams: { type: 'NUMBER', nullable: true },
  },
  required: ['name', 'kcalPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g', 'sugarPer100g'],
};

function buildLabelPrompt(): string {
  const language = LANG_NAME_EN[getLanguage()];
  return `You are reading a photo of a packaged food or drink product, taken because a barcode scan could not identify it. Read the printed nutrition facts table (values per 100g or 100ml) and the product name directly off the packaging.

Rules:
- Report kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g and sugarPer100g exactly as printed for the "per 100g" or "per 100ml" column. If only a per-serving value is printed, divide by the serving size to get per-100g values.
- sugarPer100g is a subset of carbsPer100g.
- brand is the manufacturer/brand name as printed, or null if not visible.
- servingGrams is the pack or single-serving size in grams if printed (e.g. "30g" bar, "330ml" can), else null.
- Write the product name in ${language}, keeping the brand name exactly as printed on the packaging.
- If you cannot read a nutrition table at all, still do your best estimate from the product identity — never leave a numeric field empty.`;
}

async function callGeminiLabel(model: string, base64: string): Promise<AiPhotoProduct> {
  const body = {
    systemInstruction: { parts: [{ text: buildLabelPrompt() }] },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        { text: 'Read the nutrition label in this photo.' },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: AI_RESPONSE_SCHEMA,
    },
  };

  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
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
    const parsed = JSON.parse(text) as AiPhotoProduct;
    return {
      name: parsed.name,
      brand: parsed.brand ?? null,
      kcalPer100g: numOrZero(parsed.kcalPer100g),
      proteinPer100g: numOrZero(parsed.proteinPer100g),
      carbsPer100g: numOrZero(parsed.carbsPer100g),
      fatPer100g: numOrZero(parsed.fatPer100g),
      sugarPer100g: numOrZero(parsed.sugarPer100g),
      servingGrams: parsed.servingGrams ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Last-resort fallback: the caller supplies a base64 JPEG of the product's
 * nutrition label (and the barcode it was trying to match, if any — used
 * only by the caller to cache the result, not by this function). Returns
 * null on any failure so the UI can fall back to manual entry.
 */
export async function identifyProductByPhoto(base64Jpeg: string, barcode?: string): Promise<AiPhotoProduct | null> {
  void barcode; // caller's concern for caching; kept in the signature per spec
  try {
    let result: AiPhotoProduct;
    try {
      result = await callGeminiLabel(MODEL_PRIMARY, base64Jpeg);
    } catch {
      result = await callGeminiLabel(MODEL_FALLBACK, base64Jpeg);
    }
    if (!result.name?.trim() || !(result.kcalPer100g > 0)) return null;
    return { ...result, name: result.name.trim() };
  } catch {
    return null;
  }
}

// ── Per-country catalogue sync ────────────────────────────────────────────
// The bundled seed covers Greece offline from day one. For every other market
// we cannot ship a catalogue in the APK (Germany alone is ~418k products), so
// instead each install slowly pulls its OWN country's catalogue from Open Food
// Facts in the background and keeps it on the device. A few pages per launch,
// resumable, so it costs almost nothing and converges over a week of use.
//
// This is what makes barcode scanning fast and offline wherever the user is,
// not just in Greece.

const SYNC_PAGE_SIZE = 100;
const PAGES_PER_LAUNCH = 3;
const SYNC_FIELDS = 'code,product_name,product_name_el,brands,nutriments';

/** ISO region for the OFF `countries_tags_en` filter, e.g. 'GR' -> 'greece'. */
const COUNTRY_SLUGS: Record<string, string> = {
  GR: 'greece', DE: 'germany', FR: 'france', ES: 'spain', IT: 'italy',
  GB: 'united-kingdom', US: 'united-states', NL: 'netherlands', BE: 'belgium',
  AT: 'austria', CH: 'switzerland', PT: 'portugal', SE: 'sweden', PL: 'poland',
  CY: 'cyprus', IE: 'ireland', DK: 'denmark', NO: 'norway', FI: 'finland',
};

function deviceRegion(): string | null {
  try {
    const r = getLocales()?.[0]?.regionCode;
    return typeof r === 'string' && r.length === 2 ? r.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Bulk-insert rows in one statement — far cheaper than a call per product. */
function insertBulk(rows: [string, string, string, number, number, number, number, number][], country: string) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
  const args: (string | number | null)[] = [];
  for (const r of rows) {
    args.push(r[0], r[1], r[2] || null, country, r[3], r[4], r[5], r[6], r[7], 'off-sync', now);
  }
  db.runSync(
    `INSERT INTO product_catalog
       (barcode, name, brand, country, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, sugarPer100g, source, updatedAt)
     VALUES ${placeholders}
     ON CONFLICT(barcode) DO NOTHING`,
    ...args,
  );
}

/**
 * Pull the next few pages of this device's country catalogue. Fire and forget
 * on app open; safe to call often (it no-ops once the country is fully synced).
 */
export async function syncCountryCatalogue(maxPages = PAGES_PER_LAUNCH): Promise<number> {
  initFoodDb();
  const region = deviceRegion();
  const slug = region ? COUNTRY_SLUGS[region] : null;
  if (!slug) return 0; // unknown market: live lookups + AI fallback still cover it

  const doneKey = `sync_${slug}_done`;
  if (getCatalogMeta(doneKey) === '1') return 0;

  const pageKey = `sync_${slug}_page`;
  let page = parseInt(getCatalogMeta(pageKey) ?? '1', 10);
  if (!isFinite(page) || page < 1) page = 1;

  let added = 0;
  for (let i = 0; i < maxPages; i++) {
    const url = `https://${WORLD_HOST}/api/v2/search?countries_tags_en=${slug}`
      + `&fields=${SYNC_FIELDS}&page_size=${SYNC_PAGE_SIZE}&page=${page}`;
    let json: { count?: number; products?: unknown[] } | null = null;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SnapCal (offline catalogue sync)' },
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      if (!text.startsWith('{')) break; // throttled — try again next launch
      json = JSON.parse(text);
    } catch {
      break; // offline or slow; nothing lost, resume next launch
    }

    const products = (json?.products ?? []) as Record<string, unknown>[];
    if (products.length === 0) {
      setCatalogMeta(doneKey, '1');
      break;
    }

    const rows: [string, string, string, number, number, number, number, number][] = [];
    for (const p of products) {
      const n = (p.nutriments ?? {}) as Record<string, unknown>;
      const kcal = typeof n['energy-kcal_100g'] === 'number' ? (n['energy-kcal_100g'] as number) : null;
      const nameRaw = (p.product_name_el as string) || (p.product_name as string) || '';
      const name = String(nameRaw).replace(/\s+/g, ' ').trim();
      const code = String(p.code ?? '').trim();
      if (!code || !name || name.length < 2 || name.length > 60) continue;
      if (kcal === null || kcal < 0 || kcal > 900) continue;
      const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
      rows.push([
        code, name, String(p.brands ?? '').split(',')[0].slice(0, 28),
        kcal, num(n.proteins_100g), num(n.carbohydrates_100g), num(n.fat_100g), num(n.sugars_100g),
      ]);
    }

    if (rows.length) {
      db.withTransactionSync(() => insertBulk(rows, region!));
      added += rows.length;
    }

    page++;
    setCatalogMeta(pageKey, String(page));
    if (json?.count && (page - 1) * SYNC_PAGE_SIZE >= json.count) {
      setCatalogMeta(doneKey, '1');
      break;
    }
  }
  return added;
}

/** How far along this device's country sync is, for the settings screen. */
export function catalogSyncStatus(): { country: string | null; count: number; done: boolean } {
  const region = deviceRegion();
  const slug = region ? COUNTRY_SLUGS[region] : null;
  return {
    country: region,
    count: catalogCount(),
    done: slug ? getCatalogMeta(`sync_${slug}_done`) === '1' : false,
  };
}

// Run once, as soon as this module is imported — no dependency on _layout.tsx
// wiring; barcode.ts (and anything else importing this file) gets a ready
// catalogue for free.
initFoodDb();
