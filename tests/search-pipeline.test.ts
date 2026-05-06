import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RiderProfile } from '../src/types/profile.js';

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
  openDatabase: vi.fn().mockReturnValue({}),
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
  RequestPipeline: vi.fn().mockImplementation(() => ({})),
}));

function makeProfile(): RiderProfile {
  return {
    bootSize: 10,
    heightCm: 175,
    weightKg: 75,
    ridingStyle: 'all-mountain',
  };
}

describe('runSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns products array from mocked fetchAllProducts', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new (RequestPipeline as new () => object)() as object;
    const { products, errors } = await runSearch('board', makeProfile(), pipeline as import('../src/data/pipeline.js').RequestPipeline);
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it('returns { products, errors } shape', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new (RequestPipeline as new () => object)() as object;
    const result = await runSearch('board', makeProfile(), pipeline as import('../src/data/pipeline.js').RequestPipeline);
    expect(result).toHaveProperty('products');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.products)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('collects per-retailer errors without throwing', async () => {
    const { fetchAllProducts } = await import('../src/data/shopify.js');
    (fetchAllProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new (RequestPipeline as new () => object)() as object;
    const { products, errors } = await runSearch('board', makeProfile(), pipeline as import('../src/data/pipeline.js').RequestPipeline);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('connect ECONNREFUSED');
  });

  it('per-retailer error string contains the retailer name', async () => {
    const { fetchAllProducts } = await import('../src/data/shopify.js');
    (fetchAllProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new (RequestPipeline as new () => object)() as object;
    const { errors } = await runSearch('board', makeProfile(), pipeline as import('../src/data/pipeline.js').RequestPipeline);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('TestRetailer');
  });
});
