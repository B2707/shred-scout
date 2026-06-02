import { describe, it, expect } from 'vitest';
import {
  parseFlexRating,
  resolveBindingSizeRange,
  toBoard,
  toBinding,
} from '../src/domain/compatibility/product-adapter.js';
import type { NormalizedProduct } from '../src/data/normalizer.js';

const baseNP = (over: Partial<NormalizedProduct>): NormalizedProduct =>
  ({
    shopify_id: 'x', retailer: 'evo', title: 't', handle: 't', vendor: null,
    product_type: '', gear_category: 'board', flex_rating: null, waist_width_mm: null,
    mount_pattern: '4x4', mount_pattern_raw: '', image_url: null, price_cents: 0,
    variants_json: '[]', fetched_at: 0, ...over,
  }) as NormalizedProduct;

describe('parseFlexRating (B13)', () => {
  it('parses "6/10" -> 6', () => expect(parseFlexRating('6/10')).toBe(6));
  it('parses "8/10 flex" -> 8', () => expect(parseFlexRating('8/10 flex')).toBe(8));
  it('maps "Medium-Stiff" to a mid-stiff number', () => {
    const v = parseFlexRating('Medium-Stiff');
    expect(v).toBeGreaterThan(5);
    expect(v).toBeLessThan(8);
  });
  it('maps "Soft" -> 3 and "Stiff" -> 8', () => {
    expect(parseFlexRating('Soft')).toBe(3);
    expect(parseFlexRating('Stiff')).toBe(8);
  });
  it('returns undefined for null or unparseable text', () => {
    expect(parseFlexRating(null)).toBeUndefined();
    expect(parseFlexRating('n/a')).toBeUndefined();
  });
});

describe('resolveBindingSizeRange (B13)', () => {
  it('uses numeric US sizes from variants', () => {
    expect(
      resolveBindingSizeRange('Union', JSON.stringify([{ option1: '8' }, { option1: '10' }, { option1: '11' }])),
    ).toEqual([8, 11]);
  });

  it('falls back to the per-brand span for letter sizes (Union -> [5.5,15])', () => {
    expect(
      resolveBindingSizeRange('Union', JSON.stringify([{ option1: 'M' }, { option1: 'L' }])),
    ).toEqual([5.5, 15]);
  });

  it('uses the generic span for an unknown vendor with letter sizes', () => {
    expect(resolveBindingSizeRange('Frobozz', JSON.stringify([{ option1: 'M' }]))).toEqual([5, 15]);
  });

  it('NEVER returns the meaningless [0,999] always-pass range', () => {
    const r = resolveBindingSizeRange(null, '[]');
    expect(r[0]).toBeGreaterThan(0);
    expect(r[1]).toBeLessThan(999);
  });
});

describe('toBoard / toBinding (B13)', () => {
  it('toBoard parses the flex rating string into a number', () => {
    expect(toBoard(baseNP({ flex_rating: '7/10' })).flexRating).toBe(7);
  });

  it('toBinding resolves a real size range, not [0,999]', () => {
    const b = toBinding(baseNP({ vendor: 'Union', variants_json: JSON.stringify([{ option1: 'M' }, { option1: 'L' }]) }));
    expect(b.sizeRange).toEqual([5.5, 15]);
  });
});
