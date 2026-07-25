// Barcode -> nutrition lookup. Delegates to food-db's multi-source cascade
// (local cache/seed catalogue -> country-aware Open Food Facts), which is
// what actually gives Greek supermarket items a fighting chance: OFF's
// `world` endpoint alone has thin coverage there. When nothing resolves, the
// caller (scan.tsx) can offer the AI label-photo fallback, or manual entry.
import { insertManualEntry, replaceItems, upsertKnownProduct, type Entry } from '@/lib/db';
import { resolveBarcode, type ResolvedSource } from '@/lib/food-db';

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
      // Where this answer came from. Absent for manually-typed entries.
      // 'local'  — instant hit from our own cache or bundled seed catalogue
      // 'off'    — fresh Open Food Facts lookup, just cached for next time
      // 'ai'     — read off the label photo by Gemini, just cached
      source?: ResolvedSource | 'ai';
    }
  | { found: false };

/**
 * Look up a scanned barcode via the food-db cascade (local cache/seed
 * catalogue, then country-aware Open Food Facts). Network/parse failures
 * resolve to `{ found: false }` rather than throwing, so the screen can
 * always fall back to the AI label photo or manual entry.
 */
export async function lookupBarcode(code: string): Promise<ProductLookup> {
  try {
    const resolved = await resolveBarcode(code);
    if (!resolved) return { found: false };
    return {
      found: true,
      name: resolved.name,
      brand: resolved.brand,
      kcalPer100g: resolved.kcalPer100g,
      proteinPer100g: resolved.proteinPer100g,
      carbsPer100g: resolved.carbsPer100g,
      fatPer100g: resolved.fatPer100g,
      sugarPer100g: resolved.sugarPer100g,
      servingGrams: resolved.servingGrams,
      source: resolved.source,
    };
  } catch {
    // offline, timeout, bad JSON — treat exactly like "not found"
    return { found: false };
  }
}

/**
 * Log a scanned (or manually entered, or AI-label-read) product as a
 * photo-less entry, scaled from its per-100g values to the actual grams
 * eaten, and remember it in the known-products cache so next time an AI
 * photo scan sees this product it's recognized instantly.
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
