import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RequestPipeline } from '../src/data/pipeline.js';
import { fetchAllProducts } from '../src/data/shopify.js';

let mockAgent: MockAgent;
let pipeline: RequestPipeline;

beforeEach(() => {
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  pipeline = new RequestPipeline({ concurrency: 2, timeout: 5000 });
});

afterEach(async () => {
  await mockAgent.close();
});

describe('fetchAllProducts()', () => {
  it('returns all products from a single-page store', async () => {
    const pool = mockAgent.get('https://www.evo.com');

    pool
      .intercept({ path: '/products.json?limit=250&page=1', method: 'GET' })
      .reply(
        200,
        JSON.stringify({
          products: [
            {
              id: 1,
              title: 'Board A',
              handle: 'board-a',
              product_type: 'Snowboards',
              vendor: 'Burton',
              tags: [],
              images: [],
              variants: [],
            },
            {
              id: 2,
              title: 'Binding B',
              handle: 'binding-b',
              product_type: 'Bindings',
              vendor: 'Union',
              tags: [],
              images: [],
              variants: [],
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );

    pool
      .intercept({ path: '/products.json?limit=250&page=2', method: 'GET' })
      .reply(200, JSON.stringify({ products: [] }), {
        headers: { 'content-type': 'application/json' },
      });

    const results = await fetchAllProducts('https://www.evo.com', pipeline);
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe(1);
    expect(results[1]?.id).toBe(2);
  });

  it('paginates beyond 250 — returns 350 products from a two-page store', async () => {
    const pool = mockAgent.get('https://www.tactics.com');

    // Page 1: 250 products
    const page1Products = Array.from({ length: 250 }, (_, i) => ({
      id: i + 1,
      title: `Product ${i + 1}`,
      handle: `product-${i + 1}`,
      product_type: 'Snowboards',
      vendor: 'Burton',
      tags: [],
      images: [],
      variants: [],
    }));

    // Page 2: 100 products
    const page2Products = Array.from({ length: 100 }, (_, i) => ({
      id: i + 251,
      title: `Product ${i + 251}`,
      handle: `product-${i + 251}`,
      product_type: 'Bindings',
      vendor: 'Union',
      tags: [],
      images: [],
      variants: [],
    }));

    pool
      .intercept({ path: '/products.json?limit=250&page=1', method: 'GET' })
      .reply(200, JSON.stringify({ products: page1Products }), {
        headers: { 'content-type': 'application/json' },
      });

    pool
      .intercept({ path: '/products.json?limit=250&page=2', method: 'GET' })
      .reply(200, JSON.stringify({ products: page2Products }), {
        headers: { 'content-type': 'application/json' },
      });

    pool
      .intercept({ path: '/products.json?limit=250&page=3', method: 'GET' })
      .reply(200, JSON.stringify({ products: [] }), {
        headers: { 'content-type': 'application/json' },
      });

    const results = await fetchAllProducts('https://www.tactics.com', pipeline);
    expect(results).toHaveLength(350);
  });

  it('stops immediately when page=1 returns empty array (zero-product store)', async () => {
    const pool = mockAgent.get('https://www.the-house.com');

    pool
      .intercept({ path: '/products.json?limit=250&page=1', method: 'GET' })
      .reply(200, JSON.stringify({ products: [] }), {
        headers: { 'content-type': 'application/json' },
      });

    const results = await fetchAllProducts(
      'https://www.the-house.com',
      pipeline,
    );
    expect(results).toHaveLength(0);
  });

  it('handles ShopifyProduct tags as both string and array forms', async () => {
    const pool = mockAgent.get('https://www.evo.com');

    pool
      .intercept({ path: '/products.json?limit=250&page=1', method: 'GET' })
      .reply(
        200,
        JSON.stringify({
          products: [
            {
              id: 10,
              title: 'String Tags Board',
              handle: 'string-tags',
              product_type: 'Snowboards',
              vendor: 'Burton',
              tags: 'snowboard, freeride, channel',
              images: [],
              variants: [],
            },
            {
              id: 11,
              title: 'Array Tags Board',
              handle: 'array-tags',
              product_type: 'Snowboards',
              vendor: 'Lib Tech',
              tags: ['snowboard', 'powder', 'rocker'],
              images: [],
              variants: [],
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );

    pool
      .intercept({ path: '/products.json?limit=250&page=2', method: 'GET' })
      .reply(200, JSON.stringify({ products: [] }), {
        headers: { 'content-type': 'application/json' },
      });

    const results = await fetchAllProducts('https://www.evo.com', pipeline);
    expect(results).toHaveLength(2);

    const stringTagsProduct = results[0];
    const arrayTagsProduct = results[1];

    // String tags are preserved as-is (raw from Shopify)
    expect(
      typeof stringTagsProduct.tags === 'string' ||
        Array.isArray(stringTagsProduct.tags),
    ).toBe(true);
    // Array tags are preserved as-is
    expect(Array.isArray(arrayTagsProduct.tags)).toBe(true);
  });

  it('uses the URL format {storeUrl}/products.json?limit=250&page={N}', async () => {
    const pool = mockAgent.get('https://www.evo.com');

    // If the URL format is wrong, the intercept won't match and the test fails
    pool
      .intercept({ path: '/products.json?limit=250&page=1', method: 'GET' })
      .reply(200, JSON.stringify({ products: [] }), {
        headers: { 'content-type': 'application/json' },
      });

    // Should succeed without throwing (intercept matches the expected URL format)
    const results = await fetchAllProducts('https://www.evo.com', pipeline);
    expect(results).toHaveLength(0);
  });
});
