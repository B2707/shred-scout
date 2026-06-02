/**
 * Adapters mapping a scraped NormalizedProduct to the compatibility-engine domain types.
 *
 * Shared by SetupSummaryView and the per-result-card compatibility annotation so the
 * mapping (flex string -> number, binding letter sizes -> US range) lives in one place.
 *
 * Two real bugs are fixed here:
 *   - Binding sizeRange used to parse "M"/"L" with parseFloat -> NaN -> [0,999], making the
 *     boot-to-binding rule a meaningless always-pass. We now resolve a real US range
 *     from numeric variants, falling back to the per-brand BINDING_SIZE_RANGES span.
 *   - Board flexRating was never derived from the product, so the flex advisory was always
 *     'unknown'. We parse the flex_rating string ("6/10", "Medium-Stiff") into a 1–10 number.
 */
import type { NormalizedProduct } from '../../data/normalizer.js';
import type { RiderProfile } from '../../types/profile.js';
import { bootToBindingSize, bootToBoardWaist } from './rules.js';
import { BINDING_SIZE_RANGES } from './sizing-tables.js';
import type { Binding, Board, Boot, RuleResult } from './types.js';

/**
 * Parses a free-text flex rating into a 1–10 number, or undefined when unknown.
 * Handles "6/10", "8/10 flex", and word forms ("Soft", "Medium-Stiff", "Stiff").
 */
export function parseFlexRating(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  const m =
    s.match(/(\d+(?:\.\d+)?)\s*\/\s*10/) ?? s.match(/\b(\d+(?:\.\d+)?)\b/);
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
 * Standard US boot-size range covered by each binding letter size (PROJECT.md sizing chart:
 * S 5–8, M 7–10, L 9–12, XL 11+). Brand-independent — the industry letter→US mapping is
 * consistent enough for a per-card fit signal, and far more honest than the full vendor span.
 */
const LETTER_SIZE_RANGES: Record<string, [number, number]> = {
  xs: [4, 6],
  s: [5, 8],
  m: [7, 10],
  l: [9, 12],
  xl: [11, 15],
};

/**
 * Maps a single binding letter-size variant ("M", "Large", "X-Large", "M (8-10)") to its
 * standard US range, or null when the option isn't a recognizable letter size.
 * Order matters: XL/XS are checked before L/M/S so "x-large" doesn't match "large" first.
 */
export function letterToRange(
  option: string | null | undefined,
): [number, number] | null {
  const s = (option ?? '').toLowerCase().trim();
  if (!s) return null;
  if (s === 'xl' || /x-?\s*l/.test(s) || /extra[\s-]*large/.test(s))
    return LETTER_SIZE_RANGES.xl;
  if (s === 'xs' || /x-?\s*s/.test(s) || /extra[\s-]*small/.test(s))
    return LETTER_SIZE_RANGES.xs;
  if (s === 'l' || /\blarge\b|^l\b/.test(s)) return LETTER_SIZE_RANGES.l;
  if (s === 'm' || /\bmedium\b|\bmed\b|^m\b/.test(s))
    return LETTER_SIZE_RANGES.m;
  if (s === 's' || /\bsmall\b|^s\b/.test(s)) return LETTER_SIZE_RANGES.s;
  return null;
}

/**
 * Resolves a binding's available US boot-size range.
 *
 * Resolution order:
 *   1. Explicit numeric sizes from the variants → exact [min, max].
 *   2. Letter sizes (S/M/L/XL) → the UNION of only the standard US ranges for the letters
 *      actually offered. Collapsing letter bindings to the full vendor span made an
 *      S-only binding "fit" a size-13 boot — a meaningless always-pass.
 *   3. No recognizable sizes at all → the per-brand (or generic) overall span.
 *
 * Never returns the meaningless [0,999] that made every fit "pass".
 */
export function resolveBindingSizeRange(
  vendor: string | null,
  variantsJson: string,
): [number, number] {
  try {
    const variants = JSON.parse(variantsJson) as Array<{ option1?: string }>;
    const sizes = variants
      .map((v) => parseFloat(v.option1 ?? ''))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (sizes.length >= 2) return [Math.min(...sizes), Math.max(...sizes)];
    if (sizes.length === 1) return [sizes[0] - 1, sizes[0] + 1];

    // No numeric sizes — try mapping the offered letter sizes to their standard US ranges.
    const letterRanges = variants
      .map((v) => letterToRange(v.option1))
      .filter((r): r is [number, number] => r !== null);
    if (letterRanges.length > 0) {
      return [
        Math.min(...letterRanges.map((r) => r[0])),
        Math.max(...letterRanges.map((r) => r[1])),
      ];
    }
  } catch {
    // fall through to the per-brand span
  }
  const key = (vendor ?? '').toLowerCase().split(/\s+/)[0] ?? '';
  const ranges = BINDING_SIZE_RANGES[key] ??
    BINDING_SIZE_RANGES.generic ?? [[5, 15]];
  return [
    Math.min(...ranges.map((r) => r[0])),
    Math.max(...ranges.map((r) => r[1])),
  ];
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

// Permissive placeholders so a single-product card can be checked against the rider
// without a full setup. Each rule reads only the piece relevant to that gear type.
const PLACEHOLDER_BINDING: Binding = { sizeRange: [0, 99], discPattern: '4x4' };
const PLACEHOLDER_BOARD: Board = { waistWidthMm: 300, mountingPattern: '4x4' };

/** Extracts the numeric US sizes from a product's variant options ("10", "10.5", "US 10.5"). */
function parseVariantSizes(variantsJson: string): number[] {
  try {
    const variants = JSON.parse(variantsJson) as Array<{ option1?: string }>;
    return variants
      .map((v) => {
        const m = (v.option1 ?? '').match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : Number.NaN;
      })
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

/**
 * Whether a boot product is offered in the rider's US size — the per-card signal that was
 * missing on boot cards. A boot has nothing to cross-check against a board/binding,
 * but "do they make it in my size?" is the relevant fit question, so we answer that:
 *
 *  - pass:    the rider's exact US size is among the offered variants
 *  - warn:    the boot lists sizes, but not the rider's
 *  - unknown: no parseable sizes (advisory reference only — never reads as incompatible)
 */
export function bootFit(
  product: NormalizedProduct,
  bootSizeUS: number,
): RuleResult {
  const sizes = parseVariantSizes(product.variants_json);
  if (sizes.length === 0) {
    return {
      ruleId: 'boot-size-fit',
      verdict: 'unknown',
      reason: `Boot — confirm US ${bootSizeUS} is offered before buying`,
      advisory: true,
    };
  }
  if (sizes.some((s) => Math.abs(s - bootSizeUS) < 0.01)) {
    return {
      ruleId: 'boot-size-fit',
      verdict: 'pass',
      reason: `Comes in your US ${bootSizeUS}`,
    };
  }
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const range = min === max ? `US ${min}` : `US ${min}–${max}`;
  return {
    ruleId: 'boot-size-fit',
    verdict: 'warn',
    reason: `Offered in ${range} — not your US ${bootSizeUS}`,
  };
}

/**
 * The single most relevant compatibility verdict for one product, relative to the rider —
 * the per-card "compatibility-verified" signal that was missing during shopping.
 *
 *  - board:   boot-to-board waist clearance for the rider's boot size
 *  - binding: whether the rider's boot fits the binding's size range
 *  - boot:    whether the boot is offered in the rider's US size
 */
export function productFit(
  product: NormalizedProduct,
  rider: RiderProfile,
): RuleResult | null {
  const boot = toBoot(rider.bootSize);
  switch (product.gear_category) {
    case 'board':
      return bootToBoardWaist({
        board: toBoard(product),
        binding: PLACEHOLDER_BINDING,
        boot,
      });
    case 'binding':
      return bootToBindingSize({
        board: PLACEHOLDER_BOARD,
        binding: toBinding(product),
        boot,
      });
    case 'boot':
      return bootFit(product, rider.bootSize);
    default:
      return null;
  }
}
