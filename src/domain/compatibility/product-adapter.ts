/**
 * Adapters mapping a scraped NormalizedProduct to the compatibility-engine domain types.
 *
 * Shared by SetupSummaryView and the per-result-card compatibility annotation so the
 * mapping (flex string -> number, binding letter sizes -> US range) lives in one place.
 *
 * Two real bugs are fixed here:
 *   - Binding sizeRange used to parse "M"/"L" with parseFloat -> NaN -> [0,999], making the
 *     boot-to-binding rule a meaningless always-pass (B13). We now resolve a real US range
 *     from numeric variants, falling back to the per-brand BINDING_SIZE_RANGES span.
 *   - Board flexRating was never derived from the product, so the flex advisory was always
 *     'unknown'. We parse the flex_rating string ("6/10", "Medium-Stiff") into a 1–10 number.
 */
import type { NormalizedProduct } from '../../data/normalizer.js';
import type { Board, Binding, Boot } from './types.js';
import { BINDING_SIZE_RANGES } from './sizing-tables.js';

/**
 * Parses a free-text flex rating into a 1–10 number, or undefined when unknown.
 * Handles "6/10", "8/10 flex", and word forms ("Soft", "Medium-Stiff", "Stiff").
 */
export function parseFlexRating(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*\/\s*10/) ?? s.match(/\b(\d+(?:\.\d+)?)\b/);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
  }
  const soft = s.includes('soft');
  const medium = s.includes('medium') || s.includes('mid');
  const stiff = s.includes('stiff');
  if (soft && stiff) return 5;
  if (medium && stiff) return 6.5;
  if (soft && medium) return 4;
  if (soft) return 3;
  if (stiff) return 8;
  if (medium) return 5;
  return undefined;
}

/**
 * Resolves a binding's available US boot-size range.
 *
 * Prefers explicit numeric sizes from the variants; for letter sizes (S/M/L/XL) or no
 * variants, falls back to the vendor's overall span in BINDING_SIZE_RANGES (generic when
 * the brand is unknown). Never returns the meaningless [0,999] that made every fit "pass".
 */
export function resolveBindingSizeRange(vendor: string | null, variantsJson: string): [number, number] {
  try {
    const variants = JSON.parse(variantsJson) as Array<{ option1?: string }>;
    const sizes = variants
      .map(v => parseFloat(v.option1 ?? ''))
      .filter(n => Number.isFinite(n) && n > 0);
    if (sizes.length >= 2) return [Math.min(...sizes), Math.max(...sizes)];
    if (sizes.length === 1) return [sizes[0]! - 1, sizes[0]! + 1];
  } catch {
    // fall through to the per-brand span
  }
  const key = (vendor ?? '').toLowerCase().split(/\s+/)[0] ?? '';
  const ranges = BINDING_SIZE_RANGES[key] ?? BINDING_SIZE_RANGES['generic'] ?? [[5, 15]];
  return [Math.min(...ranges.map(r => r[0])), Math.max(...ranges.map(r => r[1]))];
}

/** Maps a board product to the Board domain type (waist, mount pattern, parsed flex). */
export function toBoard(p: NormalizedProduct): Board {
  return {
    waistWidthMm: p.waist_width_mm ?? 0,
    mountingPattern: p.mount_pattern,
    flexRating: parseFlexRating(p.flex_rating),
  };
}

/** Maps a binding product to the Binding domain type (resolved US range, disc pattern). */
export function toBinding(p: NormalizedProduct): Binding {
  return {
    sizeRange: resolveBindingSizeRange(p.vendor, p.variants_json),
    discPattern: p.mount_pattern,
  };
}

/** Builds the Boot domain type from the rider's authoritative US boot size. */
export function toBoot(bootSizeUS: number): Boot {
  return { sizeUS: bootSizeUS };
}
