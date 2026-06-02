import { describe, expect, it } from 'vitest';
import type { NormalizedProduct } from '../src/data/normalizer.js';
import {
  bootFit,
  parseFlexRating,
  productFit,
  resolveBindingSizeRange,
  toBinding,
  toBoard,
} from '../src/domain/compatibility/product-adapter.js';
import type { RiderProfile } from '../src/types/profile.js';

const baseNP = (over: Partial<NormalizedProduct>): NormalizedProduct =>
  ({
    shopify_id: 'x',
    retailer: 'evo',
    title: 't',
    handle: 't',
    vendor: null,
    product_type: '',
    gear_category: 'board',
    flex_rating: null,
    waist_width_mm: null,
    mount_pattern: '4x4',
    mount_pattern_raw: '',
    image_url: null,
    price_cents: 0,
    variants_json: '[]',
    fetched_at: 0,
    ...over,
  }) as NormalizedProduct;

describe('parseFlexRating', () => {
  it('parses "6/10" -> 6', () => expect(parseFlexRating('6/10')).toBe(6));
  it('parses "8/10 flex" -> 8', () =>
    expect(parseFlexRating('8/10 flex')).toBe(8));
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

describe('resolveBindingSizeRange', () => {
  it('uses numeric US sizes from variants', () => {
    expect(
      resolveBindingSizeRange(
        'Union',
        JSON.stringify([
          { option1: '8' },
          { option1: '10' },
          { option1: '11' },
        ]),
      ),
    ).toEqual([8, 11]);
  });

  it('maps offered letter sizes to their standard US ranges, not the full vendor span', () => {
    // M = [7,10], L = [9,12] -> union [7,12]; NOT the old always-pass [5.5,15] span.
    expect(
      resolveBindingSizeRange(
        'Union',
        JSON.stringify([{ option1: 'M' }, { option1: 'L' }]),
      ),
    ).toEqual([7, 12]);
  });

  it('a single-letter (S-only) binding resolves to just the S range', () => {
    // The bug: an S-only binding used to report the full [5.5,15] span and "fit" any boot.
    expect(
      resolveBindingSizeRange('Union', JSON.stringify([{ option1: 'S' }])),
    ).toEqual([5, 8]);
  });

  it('maps word-form sizes (Small/Large) the same as letters', () => {
    expect(
      resolveBindingSizeRange(
        'Burton',
        JSON.stringify([{ option1: 'Small' }, { option1: 'Large' }]),
      ),
    ).toEqual([5, 12]);
  });

  it('letter mapping is brand-independent (unknown vendor, M -> [7,10])', () => {
    expect(
      resolveBindingSizeRange('Frobozz', JSON.stringify([{ option1: 'M' }])),
    ).toEqual([7, 10]);
  });

  it('falls back to the per-brand/generic span only when NO sizes are recognizable', () => {
    const r = resolveBindingSizeRange(null, '[]');
    expect(r[0]).toBeGreaterThan(0);
    expect(r[1]).toBeLessThan(999);
  });
});

describe('toBoard / toBinding', () => {
  it('toBoard parses the flex rating string into a number', () => {
    expect(toBoard(baseNP({ flex_rating: '7/10' })).flexRating).toBe(7);
  });

  it('toBinding resolves a real per-letter size range, not [0,999] or the full span', () => {
    const b = toBinding(
      baseNP({
        vendor: 'Union',
        variants_json: JSON.stringify([{ option1: 'M' }, { option1: 'L' }]),
      }),
    );
    expect(b.sizeRange).toEqual([7, 12]);
  });
});

describe('productFit — per-card compatibility for the rider', () => {
  const rider = (bootSize = 10): RiderProfile => ({
    bootSize,
    heightCm: 180,
    weightKg: 80,
    ridingStyle: 'all-mountain',
  });

  it('passes a board with adequate waist for the rider boots', () => {
    const r = productFit(
      baseNP({ gear_category: 'board', waist_width_mm: 255 }),
      rider(10),
    );
    expect(r?.ruleId).toBe('boot-to-board-waist');
    expect(r?.verdict).toBe('pass');
  });

  it('fails a board that is genuinely too narrow', () => {
    const r = productFit(
      baseNP({ gear_category: 'board', waist_width_mm: 200 }),
      rider(10),
    );
    expect(r?.verdict).toBe('fail');
  });

  it('marks a board with unknown waist as unknown (not fail)', () => {
    const r = productFit(
      baseNP({ gear_category: 'board', waist_width_mm: null }),
      rider(10),
    );
    expect(r?.verdict).toBe('unknown');
  });

  it('returns a size-fit verdict for a binding', () => {
    const r = productFit(
      baseNP({
        gear_category: 'binding',
        vendor: 'Union',
        variants_json: JSON.stringify([{ option1: 'M' }, { option1: 'L' }]),
      }),
      rider(10),
    );
    expect(r?.ruleId).toBe('boot-to-binding-size');
    expect(r?.verdict).toBe('pass');
  });

  it('FAILS an S-only binding for a large-boot rider (no more always-pass)', () => {
    const r = productFit(
      baseNP({
        gear_category: 'binding',
        vendor: 'Union',
        variants_json: JSON.stringify([{ option1: 'S' }]),
      }),
      rider(13),
    );
    expect(r?.ruleId).toBe('boot-to-binding-size');
    expect(r?.verdict).toBe('fail');
  });

  it('returns a boot-size-fit signal for a boot, not null', () => {
    const r = productFit(
      baseNP({
        gear_category: 'boot',
        variants_json: JSON.stringify([{ option1: '10' }]),
      }),
      rider(10),
    );
    expect(r?.ruleId).toBe('boot-size-fit');
    expect(r?.verdict).toBe('pass');
  });
});

describe('bootFit — boot cards show a size-availability signal', () => {
  const bootNP = (variants: Array<{ option1: string }>): NormalizedProduct =>
    baseNP({ gear_category: 'boot', variants_json: JSON.stringify(variants) });

  it('passes when the boot is offered in the rider US size', () => {
    const r = bootFit(
      bootNP([{ option1: '9' }, { option1: '10' }, { option1: '11' }]),
      10,
    );
    expect(r.ruleId).toBe('boot-size-fit');
    expect(r.verdict).toBe('pass');
  });

  it('warns when the boot is not offered in the rider size', () => {
    const r = bootFit(bootNP([{ option1: '7' }, { option1: '8' }]), 11);
    expect(r.verdict).toBe('warn');
    expect(r.reason).toMatch(/11/);
  });

  it('parses a size embedded in option text like "US 10.5"', () => {
    const r = bootFit(bootNP([{ option1: 'US 10.5' }]), 10.5);
    expect(r.verdict).toBe('pass');
  });

  it('gives an informational (unknown) advisory when no sizes are parseable', () => {
    const r = bootFit(
      baseNP({ gear_category: 'boot', variants_json: '[]' }),
      10,
    );
    expect(r.verdict).toBe('unknown');
    expect(r.advisory).toBe(true);
  });
});
