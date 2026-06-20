import { describe, expect, it, vi } from 'vitest';

// Stub the two fetch paths so we can observe which one SmartShopifySource takes - and whether
// it performs the (expensive) homepage token probe.
vi.mock('../src/data/shopify.js', () => ({
  fetchAllProducts: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/data/storefront-api.js', () => ({
  extractStorefrontToken: vi.fn().mockResolvedValue(null),
  fetchAllProductsGraphQL: vi.fn().mockResolvedValue([]),
}));
// normalizeProduct is mocked per-test so we can simulate a single malformed listing
// throwing without taking down the whole store's batch.
vi.mock('../src/data/normalizer.js', () => ({
  normalizeProduct: vi.fn(),
}));

import { normalizeProduct } from '../src/data/normalizer.js';
import { fetchAllProducts } from '../src/data/shopify.js';
import { SmartShopifySource } from '../src/data/smart-source.js';
import {
  extractStorefrontToken,
  fetchAllProductsGraphQL,
} from '../src/data/storefront-api.js';

const normalizeMock = normalizeProduct as ReturnType<typeof vi.fn>;

// resolveToken/fetchAll only need pipeline.fetch when probing; the default path never touches it.
const pipeline = {} as never;

describe('SmartShopifySource token resolution', () => {
  it('does not probe the store homepage by default - goes straight to products.json', async () => {
    vi.clearAllMocks();
    const source = new SmartShopifySource('demo', 'https://store.example');
    await source.fetchAll(pipeline);
    expect(extractStorefrontToken).not.toHaveBeenCalled();
    expect(fetchAllProductsGraphQL).not.toHaveBeenCalled();
    expect(fetchAllProducts).toHaveBeenCalledTimes(1);
  });

  it('probes for a token (and uses GraphQL when found) only when auto-detect is enabled', async () => {
    vi.clearAllMocks();
    (extractStorefrontToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'a'.repeat(32),
    );
    const source = new SmartShopifySource(
      'demo',
      'https://store.example',
      null,
      true,
    );
    await source.fetchAll(pipeline);
    expect(extractStorefrontToken).toHaveBeenCalledTimes(1);
    expect(fetchAllProductsGraphQL).toHaveBeenCalledTimes(1);
    expect(fetchAllProducts).not.toHaveBeenCalled();
  });
});

describe('SmartShopifySource per-item normalization resilience', () => {
  it('drops a single malformed listing instead of aborting the whole store (REST path)', async () => {
    vi.clearAllMocks();
    // Three raw listings; the middle one is "malformed" and makes normalizeProduct throw.
    (fetchAllProducts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    normalizeMock.mockImplementation((raw: { id: number }) => {
      if (raw.id === 2) throw new Error('boom: malformed product');
      return { shopify_id: String(raw.id) };
    });

    const source = new SmartShopifySource('demo', 'https://store.example');
    const result = await source.fetchAll(pipeline);

    // The bad listing (id 2) is dropped; the other two survive.
    expect(result.map((p) => p.shopify_id)).toEqual(['1', '3']);
  });

  it('drops a single malformed listing instead of aborting the whole store (GraphQL path)', async () => {
    vi.clearAllMocks();
    (extractStorefrontToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'a'.repeat(32),
    );
    (fetchAllProductsGraphQL as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      [{ id: 10 }, { id: 20 }, { id: 30 }],
    );
    normalizeMock.mockImplementation((raw: { id: number }) => {
      if (raw.id === 20) throw new Error('boom: malformed product');
      return { shopify_id: String(raw.id) };
    });

    const source = new SmartShopifySource(
      'demo',
      'https://store.example',
      null,
      true,
    );
    const result = await source.fetchAll(pipeline);

    expect(result.map((p) => p.shopify_id)).toEqual(['10', '30']);
  });
});
