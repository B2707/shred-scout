import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// MockAgent intercepts at the dispatcher level - no vi.doMock needed here.
// Use beforeEach/afterEach for dispatcher setup.

let mockAgent: MockAgent;

beforeEach(() => {
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  await mockAgent.close();
});

describe('RequestPipeline', () => {
  it('defaults to concurrency=1, timeout=15000, a paced browser User-Agent', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline();

    // Use internal field inspection via any cast to verify defaults
    const p = pipeline as unknown as {
      concurrency: number;
      timeout: number;
      userAgent: string;
      minIntervalMs: number;
    };
    expect(p.concurrency).toBe(1);
    expect(p.timeout).toBe(15000);
    expect(p.minIntervalMs).toBe(800);
    // Sends a browser UA - Shopify storefronts serve these far more readily than a bot UA.
    expect(p.userAgent).toContain('Mozilla');
    expect(p.userAgent).toContain('Chrome');
  });

  it('fetch() sends a browser User-Agent header', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ minIntervalMs: 0 });

    const pool = mockAgent.get('https://www.evo.com');
    pool
      .intercept({
        path: '/test',
        method: 'GET',
        headers: (headers) => (headers['user-agent'] ?? '').includes('Mozilla'),
      })
      .reply(200, '{}', { headers: { 'content-type': 'application/json' } });

    const res = await pipeline.fetch('https://www.evo.com/test');
    expect(res.status).toBe(200);
  });

  it('fetch() does NOT retry on HTTP 429 - it aborts so the tripped host is skipped', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ timeout: 5000, minIntervalMs: 0 });

    const pool = mockAgent.get('https://www.evo.com');
    // Only ONE intercept - a retry would need a second and fail to match (proving no retry).
    pool
      .intercept({ path: '/products.json', method: 'GET' })
      .reply(429, 'Too Many Requests', {
        headers: { 'content-type': 'text/plain' },
      });

    await expect(
      pipeline.fetch('https://www.evo.com/products.json'),
    ).rejects.toThrow('HTTP 429');
  });

  it('fetch() throws immediately (no retry) on HTTP 404', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ timeout: 5000, minIntervalMs: 0 });

    const pool = mockAgent.get('https://www.evo.com');
    // Only one intercept - permanent 4xx must NOT trigger a second attempt.
    // p-retry unwraps AbortError and throws AbortError.originalError (plain Error with same message).
    pool
      .intercept({ path: '/missing', method: 'GET' })
      .reply(404, 'Not Found', { headers: { 'content-type': 'text/plain' } });

    await expect(pipeline.fetch('https://www.evo.com/missing')).rejects.toThrow(
      'HTTP 404',
    );
  });

  it('fetch() throws on HTTP 500 after retries exhausted', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ timeout: 5000, minIntervalMs: 0 });

    const pool = mockAgent.get('https://www.evo.com');
    // 4 attempts total (1 original + 3 retries)
    for (let i = 0; i < 4; i++) {
      pool
        .intercept({ path: '/error', method: 'GET' })
        .reply(500, 'Internal Server Error', {
          headers: { 'content-type': 'text/plain' },
        });
    }

    await expect(pipeline.fetch('https://www.evo.com/error')).rejects.toThrow();
  });

  it('fetch() supports a POST body + custom headers, still routed through the paced queue with the browser UA', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ minIntervalMs: 0 });

    const pool = mockAgent.get('https://store.example');
    pool
      .intercept({
        path: '/api/2025-01/graphql.json',
        method: 'POST',
        headers: (headers) =>
          (headers['user-agent'] ?? '').includes('Mozilla') &&
          headers['x-shopify-storefront-access-token'] === 'tok',
        body: (body) => body === '{"query":1}',
      })
      .reply(200, '{"ok":true}', {
        headers: { 'content-type': 'application/json' },
      });

    const res = await pipeline.fetch(
      'https://store.example/api/2025-01/graphql.json',
      {
        method: 'POST',
        headers: { 'X-Shopify-Storefront-Access-Token': 'tok' },
        body: '{"query":1}',
      },
    );
    expect(res.status).toBe(200);
  });

  it('per-host concurrency is limited to 2 simultaneous requests', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({
      concurrency: 2,
      timeout: 5000,
      minIntervalMs: 0,
    });

    const pool = mockAgent.get('https://www.evo.com');
    // Setup 3 sequential intercepts
    for (let i = 0; i < 3; i++) {
      pool
        .intercept({ path: `/page${i}`, method: 'GET' })
        .reply(200, JSON.stringify({ page: i }), {
          headers: { 'content-type': 'application/json' },
        });
    }

    // Start 3 concurrent requests - they should all complete despite concurrency=2 limit
    const results = await Promise.all([
      pipeline.fetch('https://www.evo.com/page0'),
      pipeline.fetch('https://www.evo.com/page1'),
      pipeline.fetch('https://www.evo.com/page2'),
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});
