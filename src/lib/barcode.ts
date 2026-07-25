// Barcode -> nutrition lookup. Checks the local known-products cache first
// (things we've already scanned or logged before), then falls back to the
// Open Food Facts public database. Values are always normalized to per-100g
// so the caller can scale by whatever portion the user actually eats.
import { findKnownProduct, insertManualEntry, replaceItems, upsertKnownProduct, type Entry } from '@/lib/db';

export type ProductLookup =
  | {
      found: true;
      name: string;
      brand: string | null;
      kcalPer100g: number;
      proteinPer100g: number;
      carbsPer100g: number;
      fatPer100g: number;
      sugarPer100g: number;
      servingGrams: number | null;
    }
  | { found: false };

const OFF_URL = (code: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments,serving_size`;

// Open Food Facts serving_size is a free-text string like "30 g" or "1 bar (45g)".
// Pull the first gram-ish number out of it; anything odder is ignored.
function parseServingGrams(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/([\d.,]+)\s*g\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return isFinite(n) && n > 0 ? n : null;
}

function numOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

/**
 * Look up a scanned barcode. Local known-products cache wins (it's what we
 * already remember from a past scan or manual entry with this code as its
 * "name"), otherwise we hit Open Food Facts. Network/parse failures resolve
 * to `{ found: false }` rather than throwing, so the screen can always fall
 * back to manual entry.
 */
export async function lookupBarcode(code: string): Promise<ProductLookup> {
  // The local cache is keyed by (name, brand); a barcode scan has no brand
  // yet, so we look it up the same way logScannedProduct will have stored it:
  // by the barcode itself standing in as the product "name" isn't useful for
  // display, so we only use this as a fast path when we've already resolved
  // this exact code before (see logScannedProduct, which remembers products
  // under their real name/brand — this lookup is a best-effort convenience).
  const cached = findKnownProduct(code, null);
  if (cached) {
    return {
      found: true,
      name: cached.name,
      brand: cached.brand,
      kcalPer100g: cached.kcalPer100g,
      proteinPer100g: cached.proteinPer100g,
      carbsPer100g: cached.carbsPer100g,
      fatPer100g: cached.fatPer100g,
      sugarPer100g: cached.sugarPer100g,
      servingGrams: cached.packageSizeGrams,
    };
  }

  try {
    const res = await fetch(OFF_URL(code));
    if (!res.ok) return { found: false };
    const json = await res.json();
    if (json?.status !== 1 || !json?.product) return { found: false };

    const product = json.product;
    const nutriments = product.nutriments ?? {};
    const name: string | undefined = product.product_name;
    if (!name || !name.trim()) return { found: false };

    const kcalPer100g = numOrZero(nutriments['energy-kcal_100g']);
    if (kcalPer100g <= 0) return { found: false };

    return {
      found: true,
      name: name.trim(),
      brand: typeof product.brands === 'string' && product.brands.trim() ? product.brands.split(',')[0].trim() : null,
      kcalPer100g,
      proteinPer100g: numOrZero(nutriments['proteins_100g']),
      carbsPer100g: numOrZero(nutriments['carbohydrates_100g']),
      fatPer100g: numOrZero(nutriments['fat_100g']),
      sugarPer100g: numOrZero(nutriments['sugars_100g']),
      servingGrams: parseServingGrams(product.serving_size),
    };
  } catch {
    // offline, timeout, bad JSON — treat exactly like "not found"
    return { found: false };
  }
}

/**
 * Log a scanned (or manually entered) product as a photo-less entry, scaled
 * from its per-100g values to the actual grams eaten, and remember it in the
 * known-products cache so next time it's a local hit.
 */
export function logScannedProduct(
  product: Extract<ProductLookup, { found: true }>,
  grams: number,
  mealType: string,
): number {
  const factor = grams / 100;
  const kcal = product.kcalPer100g * factor;
  const proteinG = product.proteinPer100g * factor;
  const carbsG = product.carbsPer100g * factor;
  const fatG = product.fatPer100g * factor;
  const sugarG = product.sugarPer100g * factor;
  const displayName = product.brand ? `${product.name} (${product.brand})` : product.name;

  // insertManualEntry gives us a photo-less, already-"done" entry — exactly
  // what a barcode scan is. It only accepts kcal/sugar though, so we follow
  // up with replaceItems to fill in the full macro breakdown it can't take.
  const entryId = insertManualEntry({
    name: displayName,
    kcal,
    grams,
    sugarG,
    mealType,
    takenAt: new Date(),
  });

  replaceItems(entryId, [
    {
      name: product.name,
      brand: product.brand,
      portionGrams: grams,
      kcal,
      proteinG,
      carbsG,
      fatG,
      sugarG,
      isPackaged: 1,
      kcalPer100g: product.kcalPer100g,
      confidence: 1,
    },
  ]);

  upsertKnownProduct({
    name: product.name,
    brand: product.brand,
    kcalPer100g: product.kcalPer100g,
    proteinPer100g: product.proteinPer100g,
    carbsPer100g: product.carbsPer100g,
    fatPer100g: product.fatPer100g,
    sugarPer100g: product.sugarPer100g,
    packageSizeGrams: product.servingGrams,
  });

  return entryId;
}

export type { Entry };
