/**
 * Result ranking for Shred Scout.
 *
 * Turns the rider's wizard answers (weight/height/skill/style + boot size) into a per-product
 * appropriateness score and sorts results best-first - a SOFT ranking, never a filter, so nothing
 * the rider could buy is hidden. This is what makes the wizard's body-measurement questions
 * actually shape the results instead of being collected and ignored.
 *
 * Scoring by category:
 *   - board:   mostly board-length proximity to the rider's recommendation (the weight/height/
 *              skill/style signal), plus flex-for-style and boot-to-waist clearance.
 *   - boot:    whether it's offered in the rider's US size.
 *   - binding: whether the rider's boot fits its size range.
 * Missing data scores neutral (0.5) so unknowns never sink below clear mismatches.
 */

import type { NormalizedProduct } from '../data/normalizer.js';
import {
  parseBoardLengthsCm,
  recommendBoardLength,
} from '../domain/compatibility/board-sizing.js';
import { flexAdvisory } from '../domain/compatibility/flex-advisory.js';
import {
  productFit,
  toBoard,
  toBoot,
} from '../domain/compatibility/product-adapter.js';
import type { Verdict } from '../domain/compatibility/types.js';
import type { RiderProfile } from '../types/profile.js';

/** Maps a rule verdict to a 0-1 score. 'unknown' is neutral so missing data isn't punished. */
function verdictScore(verdict: Verdict): number {
  switch (verdict) {
    case 'pass':
      return 1;
    case 'unknown':
      return 0.5;
    case 'warn':
      return 0.4;
    default:
      return 0; // fail
  }
}

/** 0-1 closeness of a board's offered lengths to the rider's recommended length (0.5 if unknown). */
function lengthScore(product: NormalizedProduct, rider: RiderProfile): number {
  const lengths = parseBoardLengthsCm(product.variants_json);
  if (lengths.length === 0) return 0.5;
  const { ideal } = recommendBoardLength(rider);
  const minDist = Math.min(...lengths.map((l) => Math.abs(l - ideal)));
  // 0 cm off → 1.0; 12 cm or more off → 0.0.
  return Math.max(0, 1 - minDist / 12);
}

/**
 * A single 0-1 appropriateness score for a product relative to the rider. Higher is better.
 * Exposed for testing and reuse; rankProducts sorts by this.
 */
export function scoreProduct(
  product: NormalizedProduct,
  rider: RiderProfile,
): number {
  switch (product.gear_category) {
    case 'board': {
      const length = lengthScore(product, rider);
      const flex = verdictScore(
        flexAdvisory(
          {
            board: toBoard(product),
            binding: { sizeRange: [0, 99], discPattern: '4x4' },
            boot: toBoot(rider.bootSize),
          },
          rider,
        ).verdict,
      );
      const waist = verdictScore(
        productFit(product, rider)?.verdict ?? 'unknown',
      );
      // Length (weight/height-driven) dominates; flex-for-style and waist clearance refine it.
      return 0.6 * length + 0.2 * flex + 0.2 * waist;
    }
    case 'boot':
    case 'binding':
      return verdictScore(productFit(product, rider)?.verdict ?? 'unknown');
    default:
      return 0.5;
  }
}

/**
 * Returns a new array of the products sorted by appropriateness (best first). Stable: equal
 * scores keep their input order, and the set is never added to or dropped from.
 */
export function rankProducts(
  products: NormalizedProduct[],
  rider: RiderProfile,
): NormalizedProduct[] {
  return products
    .map((product, index) => ({
      product,
      index,
      score: scoreProduct(product, rider),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}
