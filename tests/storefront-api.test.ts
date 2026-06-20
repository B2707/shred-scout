import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeProduct } from '../src/data/normalizer.js';
import type { RequestPipeline } from '../src/data/pipeline.js';
import {
  adaptStorefrontProduct,
  fetchAllProductsGraphQL,
} from '../src/data/storefront-api.js';

// Block all real network so any code path that bypasses the injected pipeline (and reaches
// for undici directly) fails fast instead of hanging - that bypass is exactly the bug.
let mockAgent: MockAgent;
beforeEach(() => {
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});
afterEach(async () => {
  await mockAgent.close();
  vi.clearAllMocks();
});

/** A fake pipeline whose `fetch` is the single seam every HTTP call must go through. */
function fakePipeline(
  impl: (url: string, init?: unknown) => Promise<Response>,
): RequestPipeline {
  return {
    timeout: 5000,
    userAgent: 'Mozilla/5.0 TestUA',
    fetch: vi.fn(impl),
  } as unknown as RequestPipeline;
}

function productNode(id: number) {
  return {
    id: `gid://shopify/Product/${id}`,
    title: `Board ${id}`,
    handle: `board-${id}`,
    productType: 'Snowboards',
    vendor: 'Demo',
    tags: [],
    description: '',
    featuredImage: null,
    variants: { edges: [variant('499.00', true, '157')] },
  };
}

function graphqlPage(
  ids: number[],
  hasNextPage: boolean,
  endCursor: string | null,
) {
  return {
    data: {
      products: {
        pageInfo: { hasNextPage, endCursor },
        edges: ids.map((id) => ({ node: productNode(id) })),
      },
    },
  };
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });

function variant(amount: string, available: boolean, size: string) {
  return {
    node: {
      id: `gid://shopify/ProductVariant/${size}`,
      title: size,
      price: { amount, currencyCode: 'USD' },
      compareAtPrice: null,
      availableForSale: available,
      sku: `sku-${size}`,
      selectedOptions: [{ name: 'Size', value: size }],
    },
  };
}

const soldOutCheapestNode = {
  id: 'gid://shopify/Product/1',
  title: 'Demo Boots',
  handle: 'demo-boots',
  productType: 'Snowboard Boots',
  vendor: 'Demo',
  tags: ['boots'],
  description: '',
  featuredImage: null,
  variants: {
    edges: [variant('199.00', false, '8'), variant('499.00', true, '10')],
  },
};

describe('adaptStorefrontProduct', () => {
  it('carries variant availability through so the in-stock price wins after normalization', () => {
    const input = adaptStorefrontProduct(soldOutCheapestNode);
    expect(input.variants.map((v) => v.available)).toEqual([false, true]);

    const normalized = normalizeProduct(input, 'storefront-store');
    // The $199 variant is sold out - the $499 in-stock variant must be the displayed price.
    expect(normalized.price_cents).toBe(49900);
  });
});

describe('fetchAllProductsGraphQL (throttle + page cap)', () => {
  it('routes the GraphQL POST through the pipeline (so it inherits pacing + the per-host queue)', async () => {
    const pipeline = fakePipeline(async () =>
      jsonResponse(graphqlPage([1], false, null)),
    );
    const products = await fetchAllProductsGraphQL(
      'https://store.example',
      'tok',
      pipeline,
    );
    const fetchMock = pipeline.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method?: string; headers?: Record<string, string> },
    ];
    expect(url).toContain('/api/2025-01/graphql.json');
    expect(init.method).toBe('POST');
    expect(init.headers?.['X-Shopify-Storefront-Access-Token']).toBe('tok');
    expect(products).toHaveLength(1);
  });

  it('caps pagination at maxPages instead of crawling every cursor page until empty', async () => {
    // Every page claims another page exists; only the cap can stop the loop.
    const pipeline = fakePipeline(async () =>
      jsonResponse(graphqlPage([1], true, 'CURSOR')),
    );
    const products = await fetchAllProductsGraphQL(
      'https://store.example',
      'tok',
      pipeline,
      2,
    );
    const fetchMock = pipeline.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(products).toHaveLength(2);
  });

  it('preserves the descriptive auth error when the pipeline aborts on a 401/403', async () => {
    const pipeline = fakePipeline(async () => {
      throw new Error('HTTP 401 from https://store.example');
    });
    await expect(
      fetchAllProductsGraphQL('https://store.example', 'bad-token', pipeline),
    ).rejects.toThrow(/auth/i);
  });

  it('returns the partial result when a LATER page fails (REST-path parity)', async () => {
    // Page 1 succeeds (and claims another page exists); page 2 is blocked (e.g. a 429).
    // The collected first-page products must be returned, not discarded.
    let call = 0;
    const pipeline = fakePipeline(async () => {
      call++;
      if (call === 1) return jsonResponse(graphqlPage([1], true, 'CURSOR'));
      throw new Error('HTTP 429 Too Many Requests');
    });
    const products = await fetchAllProductsGraphQL(
      'https://store.example',
      'tok',
      pipeline,
      3,
    );
    expect(products).toHaveLength(1);
  });

  it('still throws when the FIRST page fails (no partial result to keep)', async () => {
    const pipeline = fakePipeline(async () => {
      throw new Error('HTTP 429 Too Many Requests');
    });
    await expect(
      fetchAllProductsGraphQL('https://store.example', 'tok', pipeline, 3),
    ).rejects.toThrow(/429/);
  });

  it('does not throw when a node is missing its variants edges (defensive adapter)', () => {
    const malformed = {
      id: 'gid://shopify/Product/77',
      title: 'Broken',
      handle: 'broken',
      productType: 'Snowboards',
      vendor: 'Demo',
      tags: [],
      description: '',
      featuredImage: null,
      // variants entirely absent
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed node
    } as any;
    expect(() => adaptStorefrontProduct(malformed)).not.toThrow();
    const input = adaptStorefrontProduct(malformed);
    expect(input.variants).toEqual([]);
    expect(input.id).toBe(77);
  });
});
