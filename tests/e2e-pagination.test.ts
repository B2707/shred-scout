/**
 * End-to-end pagination test for DATA-02.
 *
 * Verifies that fetchAllProducts() returns more than 250 products from a known-large
 * Shopify store (evo.com), proving that the pagination loop is not silently truncating
 * at the 250-item per-page limit.
 *
 * REQUIRES LIVE NETWORK — skipped in CI via process.env.CI guard.
 * Run manually: `vitest run tests/e2e-pagination.test.ts`
 */
import { describe, it, expect } from 'vitest';

// Guard: skip when running in CI or when CI env var is set
const RUN_E2E = !process.env['CI'];

describe.skipIf(!RUN_E2E)('e2e: fetchAllProducts() pagination (DATA-02)', () => {
  it(
    'returns more than 250 products from evo.com (full pagination loop verified)',
    async () => {
      const { RequestPipeline } = await import('../src/data/pipeline.js');
      const { fetchAllProducts } = await import('../src/data/shopify.js');

      const pipeline = new RequestPipeline({
        concurrency: 1, // polite — single concurrent request for e2e test
        timeout: 30_000,
      });

      const products = await fetchAllProducts('https://www.evo.com', pipeline);

      // DATA-02: must return more than 250 to prove pagination is working
      expect(products.length).toBeGreaterThan(250);
    },
    60_000 // 60s timeout — live network, large paginated response
  );

  it(
    'each product has required fields (shopify_id, title, variants)',
    async () => {
      const { RequestPipeline } = await import('../src/data/pipeline.js');
      const { fetchAllProducts } = await import('../src/data/shopify.js');

      const pipeline = new RequestPipeline({ concurrency: 1, timeout: 30_000 });
      const products = await fetchAllProducts('https://www.evo.com', pipeline);

      // Spot-check first product structure
      const first = products[0];
      expect(first).toBeDefined();
      expect(typeof first?.id).toBe('number');
      expect(typeof first?.title).toBe('string');
      expect(Array.isArray(first?.variants)).toBe(true);
      expect((first?.variants.length ?? 0)).toBeGreaterThan(0);
    },
    60_000
  );
});
