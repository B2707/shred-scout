import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedProduct } from '../src/data/normalizer.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function fixture(): NormalizedProduct[] {
  return [
    {
      shopify_id: '1',
      retailer: 'evo',
      title: 'Stiff Black Freeride Board',
      handle: 'b1',
      vendor: 'Burton',
      product_type: 'Snowboards',
      gear_category: 'board',
      waist_width_mm: null,
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      image_url: null,
      price_cents: 30000,
      variants_json: '[]',
      fetched_at: 0,
    },
    {
      shopify_id: '2',
      retailer: 'tactics',
      title: 'Soft Park Board',
      handle: 'b2',
      vendor: 'Capita',
      product_type: 'Snowboards',
      gear_category: 'board',
      waist_width_mm: null,
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      image_url: null,
      price_cents: 25000,
      variants_json: '[]',
      fetched_at: 0,
    },
    {
      shopify_id: '3',
      retailer: 'evo',
      title: 'Medium Binding Black',
      handle: 'b3',
      vendor: 'Union',
      product_type: 'Bindings',
      gear_category: 'binding',
      waist_width_mm: null,
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      image_url: null,
      price_cents: 50000,
      variants_json: '[]',
      fetched_at: 0,
    },
    {
      shopify_id: '4',
      retailer: 'tactics',
      title: 'Snowboard Boots',
      handle: 'b4',
      vendor: 'Salomon',
      product_type: 'Boots',
      gear_category: 'boot',
      waist_width_mm: null,
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      image_url: null,
      price_cents: 20000,
      variants_json: '[]',
      fetched_at: 0,
    },
    {
      shopify_id: '5',
      retailer: 'backcountry',
      title: 'Accessory Wax',
      handle: 'b5',
      vendor: 'Demon',
      product_type: 'Accessories',
      gear_category: null,
      waist_width_mm: null,
      mount_pattern: '4x4',
      mount_pattern_raw: '',
      image_url: null,
      price_cents: 1500,
      variants_json: '[]',
      fetched_at: 0,
    },
  ];
}

describe('applyFilterSpec()', () => {
  it('returns all products for empty spec', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const products = fixture();
    expect(applyFilterSpec(products, {})).toHaveLength(5);
  });

  it('does not mutate input array', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const products = fixture();
    const before = products.length;
    applyFilterSpec(products, { priceMax: 250 });
    expect(products.length).toBe(before);
  });

  it('filters by priceMax (USD → cents conversion)', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { priceMax: 250 });
    expect(result.map((p) => p.shopify_id).sort()).toEqual(['2', '4', '5']);
  });

  it('priceMax accepts decimal USD', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    // priceMax 200.00 should include the $200 boot (price_cents 20000)
    const result = applyFilterSpec(fixture(), { priceMax: 200.0 });
    expect(result.some((p) => p.shopify_id === '4')).toBe(true);
  });

  it('filters by gearType board (excludes null category)', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { gearType: 'board' });
    expect(result.map((p) => p.shopify_id).sort()).toEqual(['1', '2']);
  });

  it('filters by gearType binding', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { gearType: 'binding' });
    expect(result.map((p) => p.shopify_id)).toEqual(['3']);
  });

  it('filters by gearType boot', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { gearType: 'boot' });
    expect(result.map((p) => p.shopify_id)).toEqual(['4']);
  });

  it('filters by retailer (exact slug match)', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { retailer: 'evo' });
    expect(result.map((p) => p.shopify_id).sort()).toEqual(['1', '3']);
  });

  it('filters by color (case-insensitive title substring)', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { color: 'Black' });
    expect(result.map((p) => p.shopify_id).sort()).toEqual(['1', '3']);
  });

  it('filters by flex stiff (title keyword)', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { flex: 'stiff' });
    expect(result.map((p) => p.shopify_id)).toEqual(['1']);
  });

  it('filters by flex soft (title keyword)', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), { flex: 'soft' });
    expect(result.map((p) => p.shopify_id)).toEqual(['2']);
  });

  it('combines fields with AND (priceMax + gearType)', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), {
      priceMax: 280,
      gearType: 'board',
    });
    expect(result.map((p) => p.shopify_id)).toEqual(['2']);
  });

  it('returns empty array when no products match', async () => {
    const { applyFilterSpec } = await import('../src/agent/filter-spec.js');
    const result = applyFilterSpec(fixture(), {
      gearType: 'board',
      color: 'pink',
    });
    expect(result).toEqual([]);
  });
});
