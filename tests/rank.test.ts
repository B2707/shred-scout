import { describe, expect, it } from 'vitest';
import { rankProducts, scoreProduct } from '../src/agent/rank.js';
import type { NormalizedProduct } from '../src/data/normalizer.js';
import type { RiderProfile } from '../src/types/profile.js';

const rider: RiderProfile = {
  bootSize: 10,
  heightCm: 178,
  weightKg: 75, // ideal board length ≈ 157
  ridingStyle: 'all-mountain',
  skillLevel: 'intermediate',
};

let id = 0;
function product(
  partial: Partial<NormalizedProduct> & {
    gear_category: NormalizedProduct['gear_category'];
    sizes?: string[];
  },
): NormalizedProduct {
  id += 1;
  const { sizes, ...rest } = partial;
  return {
    shopify_id: String(id),
    retailer: 'evo',
    title: 'Test Product',
    handle: `p${id}`,
    vendor: 'Test',
    product_type: 'Snowboard',
    waist_width_mm: null,
    mount_pattern: '4x4',
    mount_pattern_raw: '4x4',
    image_url: null,
    flex_rating: null,
    price_cents: 50000,
    variants_json: JSON.stringify((sizes ?? []).map((o) => ({ option1: o }))),
    fetched_at: 0,
    ...rest,
  } as NormalizedProduct;
}

describe('rankProducts', () => {
  it('ranks a board near the recommended length above one far from it', () => {
    const near = product({
      gear_category: 'board',
      sizes: ['157'],
      title: 'Near',
    });
    const far = product({
      gear_category: 'board',
      sizes: ['143'],
      title: 'Far',
    });
    const ranked = rankProducts([far, near], rider);
    expect(ranked[0].title).toBe('Near');
    expect(ranked[1].title).toBe('Far');
  });

  it('ranks a boot offered in the rider’s size above one that is not', () => {
    const inSize = product({
      gear_category: 'boot',
      sizes: ['10', '11'],
      title: 'Fits',
    });
    const notInSize = product({
      gear_category: 'boot',
      sizes: ['7', '8'],
      title: 'TooSmall',
    });
    const ranked = rankProducts([notInSize, inSize], rider);
    expect(ranked[0].title).toBe('Fits');
  });

  it('is stable and lossless - equal-scoring products keep input order, none dropped', () => {
    const a = product({ gear_category: 'board', title: 'A' }); // no sizes → neutral
    const b = product({ gear_category: 'board', title: 'B' });
    const c = product({ gear_category: 'board', title: 'C' });
    const ranked = rankProducts([a, b, c], rider);
    expect(ranked.map((p) => p.title)).toEqual(['A', 'B', 'C']);
    expect(ranked).toHaveLength(3);
  });
});

describe('scoreProduct', () => {
  // The board score is 0.6*length + 0.2*flex + 0.2*waist. Each test below holds two of
  // those three contributions constant so the asserted difference is attributable to the
  // single factor under test.

  it('scores a flex-matching board above an otherwise identical flex-mismatching one', () => {
    // Same sizes (same length contribution) and same missing waist (same neutral waist
    // contribution); only the flex_rating vs riding style differs.
    const matches = product({
      gear_category: 'board',
      sizes: ['157'],
      flex_rating: '5/10', // inside all-mountain's recommended 4-7 -> flex advisory pass
      title: 'FlexMatch',
    });
    const mismatches = product({
      gear_category: 'board',
      sizes: ['157'],
      flex_rating: '10/10', // outside 4-7 -> flex advisory warn
      title: 'FlexMismatch',
    });
    expect(scoreProduct(matches, rider)).toBeGreaterThan(
      scoreProduct(mismatches, rider),
    );
  });

  it('gives a flex-matching board exactly 0.2 more than a flex-mismatching one (pass 1.0 vs warn 0.4)', () => {
    const matches = product({
      gear_category: 'board',
      sizes: ['157'],
      flex_rating: '5/10',
    });
    const mismatches = product({
      gear_category: 'board',
      sizes: ['157'],
      flex_rating: '10/10',
    });
    // flex contributes 0.2 of the score; pass=1.0, warn=0.4 -> delta = 0.2 * (1.0 - 0.4).
    expect(
      scoreProduct(matches, rider) - scoreProduct(mismatches, rider),
    ).toBeCloseTo(0.2 * (1 - 0.4), 5);
  });

  it('lets boot-to-waist clearance raise a board score: a wide board outranks a too-narrow one', () => {
    // Same sizes (same length contribution) and no flex_rating (same neutral flex
    // contribution); only the waist width differs, so productFit (boot-to-board-waist)
    // is the sole mover.
    const wide = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 300, // ample clearance for US 10 -> waist pass
      title: 'Wide',
    });
    const narrow = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 210, // far too narrow for US 10 -> waist fail
      title: 'Narrow',
    });
    expect(scoreProduct(wide, rider)).toBeGreaterThan(
      scoreProduct(narrow, rider),
    );
  });

  it('waist contributes exactly 0.2 (pass 1.0 vs fail 0.0) when length and flex are held constant', () => {
    const wide = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 300,
    });
    const narrow = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 210,
    });
    // waist contributes 0.2 of the score; pass=1.0, fail=0.0 -> delta = 0.2.
    expect(scoreProduct(wide, rider) - scoreProduct(narrow, rider)).toBeCloseTo(
      0.2,
      5,
    );
  });

  it('falls back to a neutral waist contribution when a board has no waist width', () => {
    // No waist_width_mm -> productFit (boot-to-board-waist) returns the unknown advisory,
    // which scores 0.5 (the ?? "unknown" fallback path). Compared with the same board given
    // a passing waist (1.0), the missing-waist board must score exactly 0.1 lower: the waist
    // term weighs 0.2, so 0.2*(1.0 - 0.5) = 0.1. Length and flex are identical, so they cancel.
    const missingWaist = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: null,
      flex_rating: null,
    });
    const passingWaist = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 300, // ample clearance for US 10 -> waist pass (1.0)
      flex_rating: null,
    });
    expect(
      scoreProduct(passingWaist, rider) - scoreProduct(missingWaist, rider),
    ).toBeCloseTo(0.2 * (1 - 0.5), 5);
  });

  it('uses the unknown-verdict fallback for a single boot product with no parseable sizes', () => {
    // bootFit returns an unknown advisory when there are no numeric sizes; scoreProduct's
    // verdictScore(... ?? "unknown") maps that to the neutral 0.5.
    const boot = product({
      gear_category: 'boot',
      sizes: [], // no numeric sizes -> bootFit verdict 'unknown'
    });
    expect(scoreProduct(boot, rider)).toBe(0.5);
  });

  it('scores a single boot offered in the rider size at 1.0 and one that is not at 0.4', () => {
    const fits = product({ gear_category: 'boot', sizes: ['10', '11'] });
    const tooSmall = product({ gear_category: 'boot', sizes: ['7', '8'] });
    expect(scoreProduct(fits, rider)).toBe(1); // bootFit pass
    expect(scoreProduct(tooSmall, rider)).toBe(0.4); // bootFit warn
  });
});
