import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RiderProfile } from '../src/types/profile.js';
import type { RequestPipeline } from '../src/data/pipeline.js';

vi.mock('../src/data/shopify.js', () => ({
  fetchAllProducts: vi.fn().mockResolvedValue([
    {
      id: 1,
      title: 'Test Board',
      handle: 'test-board',
      product_type: 'Snowboard',
      vendor: 'Burton',
      tags: [],
      images: [],
      variants: [{ price: '499.00', compare_at_price: null, option1: 'L' }],
    },
  ]),
}));

vi.mock('../src/data/db.js', () => ({
  openDatabase: vi.fn().mockReturnValue({ close: vi.fn() }),
  defaultDatabasePath: vi.fn().mockReturnValue('/tmp/test.db'),
}));

vi.mock('../src/data/repos/productRepo.js', () => ({
  makeProductRepo: vi.fn().mockReturnValue({ upsert: vi.fn() }),
}));

vi.mock('../src/data/normalizer.js', () => ({
  normalizeProduct: vi.fn().mockImplementation((_raw: unknown, retailer: string) => ({
    id: 'test-board',
    title: 'Test Board',
    handle: 'test-board',
    retailer,
    priceCents: 49900,
    salePriceCents: null,
    gear_category: 'board',
    mount_pattern: '4x4',
    mount_pattern_raw: '4x4',
    vendor: 'Burton',
    flex_rating: null,
    waist_width_mm: null,
    image_url: null,
    product_url: 'https://example.com',
    tags: [],
    scraped_at: new Date().toISOString(),
  })),
}));

vi.mock('../src/data/retailers.js', () => ({
  RETAILERS: [
    { name: 'TestRetailer', baseUrl: 'https://test-retailer.com' },
  ],
}));

vi.mock('../src/data/pipeline.js', () => ({
  RequestPipeline: class MockRequestPipeline {},
}));

import { fetchAllProducts } from '../src/data/shopify.js';
import { runSearch } from '../src/agent/search-pipeline.js';

function makeProfile(): RiderProfile {
  return {
    bootSize: 10,
    heightCm: 175,
    weightKg: 75,
    ridingStyle: 'all-mountain',
  };
}

// Pipeline is passed through to fetchAllProducts which is mocked — a plain object suffices
const mockPipeline = {} as RequestPipeline;

const defaultProduct = {
  id: 1,
  title: 'Test Board',
  handle: 'test-board',
  product_type: 'Snowboard',
  vendor: 'Burton',
  tags: [],
  images: [],
  variants: [{ price: '499.00', compare_at_price: null, option1: 'L' }],
};

describe('runSearch', () => {
  beforeEach(() => {
    vi.mocked(fetchAllProducts).mockResolvedValue([defaultProduct]);
  });

  it('returns products array from mocked fetchAllProducts', async () => {
    const { products, errors } = await runSearch('board', makeProfile(), mockPipeline);
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it('returns { products, errors } shape', async () => {
    const result = await runSearch('board', makeProfile(), mockPipeline);
    expect(result).toHaveProperty('products');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.products)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('collects per-retailer errors without throwing', async () => {
    vi.mocked(fetchAllProducts).mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const { products, errors } = await runSearch('board', makeProfile(), mockPipeline);
    void products;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('connect ECONNREFUSED');
  });

  it('per-retailer error string contains the retailer name', async () => {
    vi.mocked(fetchAllProducts).mockRejectedValueOnce(new Error('timeout'));
    const { errors } = await runSearch('board', makeProfile(), mockPipeline);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('TestRetailer');
  });

  describe('demo mode', () => {
    it('returns fixture products without HTTP calls when demo=true', async () => {
      // The demo branch reads demo-products.json via readFileSync from __dirname at runtime.
      // In vitest, import.meta.url resolves to the source path (src/agent/), so we copy
      // the fixture file there before the test and remove it after.
      // This avoids ESM module spy limitations (Cannot redefine property in ESM namespace).
      const { copyFileSync, unlinkSync, existsSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname: getDirname, join: pathJoin } = await import('node:path');
      const { createRequire } = await import('node:module');

      // Resolve the fixture source path (committed fixture)
      const requireFn = createRequire(import.meta.url);
      const fixtureSourcePath = requireFn.resolve('../src/fixtures/demo-products.json');

      // Compute where search-pipeline.ts's __dirname will point during test execution
      const searchPipelineUrl = new URL('../src/agent/search-pipeline.ts', import.meta.url);
      const searchPipelineDir = getDirname(fileURLToPath(searchPipelineUrl));
      const tempFixturePath = pathJoin(searchPipelineDir, 'demo-products.json');

      const copied = !existsSync(tempFixturePath);
      if (copied) copyFileSync(fixtureSourcePath, tempFixturePath);

      try {
        vi.mocked(fetchAllProducts).mockClear();
        const result = await runSearch('boards', makeProfile(), mockPipeline, { demo: true });

        expect(Array.isArray(result.products)).toBe(true);
        expect(result.products.length).toBeGreaterThan(0);
        expect(result.errors).toEqual([]);
        expect(vi.mocked(fetchAllProducts)).not.toHaveBeenCalled();
      } finally {
        if (copied && existsSync(tempFixturePath)) unlinkSync(tempFixturePath);
      }
    });
  });
});
