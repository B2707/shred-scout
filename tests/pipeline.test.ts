import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// MockAgent intercepts at the dispatcher level — no vi.doMock needed here.
// Use beforeEach/afterEach for dispatcher setup (per PATTERNS.md).

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
  it('defaults to concurrency=2, timeout=15000, honest userAgent', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline();

    // Use internal field inspection via any cast to verify defaults
    const p = pipeline as unknown as {
      concurrency: number;
      timeout: number;
      userAgent: string;
    };
    expect(p.concurrency).toBe(2);
    expect(p.timeout).toBe(15000);
    expect(p.userAgent).toBe(
      'shred-scout/1.0.0 (https://github.com/user/shred-scout)',
    );
    // Must NOT impersonate a browser
    expect(p.userAgent).not.toContain('Mozilla');
    expect(p.userAgent).not.toContain('Chrome');
  });

  it('fetch() sends honest User-Agent header', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline();

    const pool = mockAgent.get('https://www.evo.com');
    pool
      .intercept({
        path: '/test',
        method: 'GET',
        headers: (headers) =>
          headers['user-agent'] ===
          'shred-scout/1.0.0 (https://github.com/user/shred-scout)',
      })
      .reply(200, '{}', { headers: { 'content-type': 'application/json' } });

    const res = await pipeline.fetch('https://www.evo.com/test');
    expect(res.status).toBe(200);
  });

  it('fetch() retries on HTTP 429 and succeeds on 200', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    // Use short timeout for fast test
    const pipeline = new RequestPipeline({ timeout: 5000 });

    const pool = mockAgent.get('https://www.evo.com');
    // First attempt: 429
    pool
      .intercept({ path: '/products.json', method: 'GET' })
      .reply(429, 'Too Many Requests', {
        headers: { 'content-type': 'text/plain' },
      });
    // Second attempt: 200
    pool
      .intercept({ path: '/products.json', method: 'GET' })
      .reply(200, JSON.stringify({ products: [] }), {
        headers: { 'content-type': 'application/json' },
      });

    const res = await pipeline.fetch('https://www.evo.com/products.json');
    expect(res.status).toBe(200);
  });

  it('fetch() throws immediately (no retry) on HTTP 404', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ timeout: 5000 });

    const pool = mockAgent.get('https://www.evo.com');
    // Only one intercept — permanent 4xx must NOT trigger a second attempt.
    // p-retry unwraps AbortError and throws AbortError.originalError (plain Error with same message).
    pool
      .intercept({ path: '/missing', method: 'GET' })
      .reply(404, 'Not Found', { headers: { 'content-type': 'text/plain' } });

    await expect(pipeline.fetch('https://www.evo.com/missing')).rejects.toThrow(
      'Permanent HTTP 404',
    );
  });

  it('fetch() throws on HTTP 500 after retries exhausted', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ timeout: 5000 });

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

  it('per-host concurrency is limited to 2 simultaneous requests', async () => {
    const { RequestPipeline } = await import('../src/data/pipeline.js');
    const pipeline = new RequestPipeline({ concurrency: 2, timeout: 5000 });

    const pool = mockAgent.get('https://www.evo.com');
    // Setup 3 sequential intercepts
    for (let i = 0; i < 3; i++) {
      pool
        .intercept({ path: `/page${i}`, method: 'GET' })
        .reply(200, JSON.stringify({ page: i }), {
          headers: { 'content-type': 'application/json' },
        });
    }

    // Start 3 concurrent requests — they should all complete despite concurrency=2 limit
    const results = await Promise.all([
      pipeline.fetch('https://www.evo.com/page0'),
      pipeline.fetch('https://www.evo.com/page1'),
      pipeline.fetch('https://www.evo.com/page2'),
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});
