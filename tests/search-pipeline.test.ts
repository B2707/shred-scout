import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedProduct } from '../src/data/normalizer.js';
import type { RequestPipeline } from '../src/data/pipeline.js';
import type { RiderProfile } from '../src/types/profile.js';

// Shared mock for SmartShopifySource.fetchAll — reassigned per-test as needed
const mockShopifyFetchAll = vi.fn();

// Mock SmartShopifySource to avoid network calls
vi.mock('../src/data/smart-source.js', () => {
  return {
    SmartShopifySource: class MockSmartShopifySource {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      fetchAll() {
        return mockShopifyFetchAll();
      }
    },
  };
});

// Mock EvoHtmlScrapeSource to avoid network during non-evo tests
const mockEvoFetchAll = vi.fn().mockResolvedValue([]);
vi.mock('../src/data/scrapers/evo.js', () => {
  return {
    EvoHtmlScrapeSource: class MockEvoScrapeSource {
      name = 'evo';
      fetchAll() {
        return mockEvoFetchAll();
      }
    },
  };
});

vi.mock('../src/data/db.js', () => ({
  openDatabase: vi.fn().mockReturnValue({ close: vi.fn() }),
  defaultDatabasePath: vi.fn().mockReturnValue('/tmp/test.db'),
}));

vi.mock('../src/data/repos/productRepo.js', () => ({
  makeProductRepo: vi.fn().mockReturnValue({ upsert: vi.fn() }),
}));

// makeRetailerRepo returns a seed-aware repo backed by one test retailer
vi.mock('../src/data/repos/retailerRepo.js', () => ({
  makeRetailerRepo: vi.fn().mockReturnValue({
    all: vi.fn().mockReturnValue([
      {
        id: 1,
        name: 'TestRetailer',
        storeUrl: 'https://test-retailer.com',
        storefrontToken: null,
        addedAt: 0,
      },
    ]),
    seedIfEmpty: vi.fn(),
  }),
}));

vi.mock('../src/data/stores.js', () => ({
  loadStores: vi.fn().mockReturnValue([
    {
      name: 'TestRetailer',
      storeUrl: 'https://test-retailer.com',
      storefrontToken: null,
    },
  ]),
}));

vi.mock('../src/data/pipeline.js', () => ({
  RequestPipeline: class MockRequestPipeline {},
}));

import { filterByQuery, runSearch } from '../src/agent/search-pipeline.js';

function makeProfile(): RiderProfile {
  return {
    bootSize: 10,
    heightCm: 175,
    weightKg: 75,
    ridingStyle: 'all-mountain',
  };
}

const mockPipeline = {} as RequestPipeline;

const defaultProduct: NormalizedProduct = {
  shopify_id: '1',
  title: 'Test Board',
  handle: 'test-board',
  retailer: 'TestRetailer',
  price_cents: 49900,
  gear_category: 'board',
  mount_pattern: '4x4',
  mount_pattern_raw: '4x4',
  vendor: 'Burton',
  flex_rating: null,
  waist_width_mm: null,
  image_url: null,
  product_type: 'Snowboard',
  variants_json: '[]',
  fetched_at: Date.now(),
};

describe('runSearch', () => {
  beforeEach(() => {
    mockShopifyFetchAll.mockReset();
    mockShopifyFetchAll.mockResolvedValue([defaultProduct]);
    mockEvoFetchAll.mockReset();
    mockEvoFetchAll.mockResolvedValue([]);
  });

  it('returns products array from mocked fetchAll', async () => {
    const { products, errors } = await runSearch(
      'board',
      makeProfile(),
      mockPipeline,
    );
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
    mockShopifyFetchAll.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED'),
    );
    const { products, errors } = await runSearch(
      'board',
      makeProfile(),
      mockPipeline,
    );
    void products;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('connect ECONNREFUSED');
  });

  it('per-retailer error string contains the retailer name', async () => {
    mockShopifyFetchAll.mockRejectedValueOnce(new Error('timeout'));
    const { errors } = await runSearch('board', makeProfile(), mockPipeline);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('TestRetailer');
  });

  describe('demo mode', () => {
    it('returns fixture products without HTTP calls when demo=true', async () => {
      const { copyFileSync, unlinkSync, existsSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname: getDirname, join: pathJoin } = await import('node:path');
      const { createRequire } = await import('node:module');

      const requireFn = createRequire(import.meta.url);
      const fixtureSourcePath = requireFn.resolve(
        '../src/fixtures/demo-products.json',
      );

      const searchPipelineUrl = new URL(
        '../src/agent/search-pipeline.ts',
        import.meta.url,
      );
      const searchPipelineDir = getDirname(fileURLToPath(searchPipelineUrl));
      const tempFixturePath = pathJoin(searchPipelineDir, 'demo-products.json');

      const copied = !existsSync(tempFixturePath);
      if (copied) copyFileSync(fixtureSourcePath, tempFixturePath);

      try {
        const result = await runSearch('boards', makeProfile(), mockPipeline, {
          demo: true,
        });

        expect(Array.isArray(result.products)).toBe(true);
        expect(result.products.length).toBeGreaterThan(0);
        expect(result.errors).toEqual([]);
        expect(mockShopifyFetchAll).not.toHaveBeenCalled();
      } finally {
        if (copied && existsSync(tempFixturePath)) unlinkSync(tempFixturePath);
      }
    });

    it('gives every demo product a resolvable offline image so cards are never empty (SC-03)', async () => {
      const { copyFileSync, unlinkSync, existsSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname: getDirname, join: pathJoin } = await import('node:path');
      const { createRequire } = await import('node:module');

      const requireFn = createRequire(import.meta.url);
      const fixtureSourcePath = requireFn.resolve(
        '../src/fixtures/demo-products.json',
      );
      const searchPipelineUrl = new URL(
        '../src/agent/search-pipeline.ts',
        import.meta.url,
      );
      const searchPipelineDir = getDirname(fileURLToPath(searchPipelineUrl));
      const tempFixturePath = pathJoin(searchPipelineDir, 'demo-products.json');

      const copied = !existsSync(tempFixturePath);
      if (copied) copyFileSync(fixtureSourcePath, tempFixturePath);

      try {
        // No query → all fixtures, including the ones that had null/404 image URLs.
        const result = await runSearch('', makeProfile(), mockPipeline, {
          demo: true,
        });

        expect(result.products.length).toBeGreaterThan(0);
        for (const p of result.products) {
          expect(
            p.image_url,
            `${p.shopify_id} should carry an image`,
          ).toBeTruthy();
          // Offline demo: images must be local files, not network URLs that can 404.
          expect(/^https?:/i.test(p.image_url ?? '')).toBe(false);
          expect(
            existsSync(p.image_url ?? ''),
            `${p.image_url} should exist on disk`,
          ).toBe(true);
        }
      } finally {
        if (copied && existsSync(tempFixturePath)) unlinkSync(tempFixturePath);
      }
    });
  });

  it('filters live results by the typed query keyword (B2)', async () => {
    mockShopifyFetchAll.mockResolvedValue([
      {
        title: 'Union Force Bindings 2026',
        vendor: 'Union',
        product_type: 'Snowboard Binding',
        gear_category: 'binding',
      },
      {
        title: 'Burton Custom Snowboard 2026',
        vendor: 'Burton',
        product_type: 'Snowboard',
        gear_category: 'board',
      },
    ]);
    const { products } = await runSearch('union', makeProfile(), mockPipeline);
    expect(products).toHaveLength(1);
    expect(products[0].vendor).toBe('Union');
  });

  it('queries evo only once (HTML scraper) and skips its errors silently (B21)', async () => {
    const { makeRetailerRepo } = await import(
      '../src/data/repos/retailerRepo.js'
    );
    (makeRetailerRepo as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      all: () => [
        {
          id: 1,
          name: 'evo',
          storeUrl: 'https://www.evo.com',
          storefrontToken: null,
          addedAt: 0,
        },
      ],
      seedIfEmpty: vi.fn(),
    });
    mockShopifyFetchAll.mockReset();
    mockEvoFetchAll.mockReset();
    mockEvoFetchAll.mockRejectedValue(
      new Error(
        'evo.com listing returned no products — possible Cloudflare block',
      ),
    );

    const { errors } = await runSearch('boards', makeProfile(), mockPipeline);

    expect(mockEvoFetchAll).toHaveBeenCalledTimes(1); // not double-queried
    expect(mockShopifyFetchAll).not.toHaveBeenCalled(); // evo not also hit as Shopify
    expect(errors).toEqual([]); // failure is silent, no banner
  });
});

// ---------------------------------------------------------------------------
// filterByQuery — keyword/category filtering (B2)
// ---------------------------------------------------------------------------

describe('filterByQuery (B2)', () => {
  const P = (over: Partial<NormalizedProduct>): NormalizedProduct =>
    ({
      title: '',
      vendor: '',
      product_type: '',
      gear_category: 'board',
      ...over,
    }) as NormalizedProduct;
  const sample = [
    P({
      title: 'Union Force Bindings 2026',
      vendor: 'Union',
      gear_category: 'binding',
    }),
    P({
      title: 'YES Greats Snowboard 2026',
      vendor: 'YES',
      gear_category: 'board',
    }),
    P({
      title: 'Burton Photon Snowboard Boots 2026',
      vendor: 'Burton',
      gear_category: 'boot',
    }),
  ];

  it('returns all products for an empty/whitespace query', () => {
    expect(filterByQuery(sample, '')).toHaveLength(3);
    expect(filterByQuery(sample, '   ')).toHaveLength(3);
  });

  it('maps a category synonym to the gear_category (boards -> board)', () => {
    const r = filterByQuery(sample, 'boards');
    expect(r).toHaveLength(1);
    expect(r[0].gear_category).toBe('board');
  });

  it('maps "boots" to the boot category', () => {
    const r = filterByQuery(sample, 'boots');
    expect(r).toHaveLength(1);
    expect(r[0].gear_category).toBe('boot');
  });

  it('filters by brand keyword', () => {
    const r = filterByQuery(sample, 'union');
    expect(r).toHaveLength(1);
    expect(r[0].vendor).toBe('Union');
  });

  it('combines category + keyword (burton boots)', () => {
    const r = filterByQuery(sample, 'burton boots');
    expect(r).toHaveLength(1);
    expect(r[0].gear_category).toBe('boot');
  });

  it('returns empty for a no-match query (proves the query is honored)', () => {
    expect(filterByQuery(sample, 'xyzzy')).toHaveLength(0);
  });
});
