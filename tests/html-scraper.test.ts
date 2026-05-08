/**
 * html-scraper.test.ts — Unit tests for EvoHtmlScrapeSource (DATA-03, DATA-04).
 * Uses undici MockAgent to intercept HTTP — no real network required.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { RequestPipeline } from '../src/data/pipeline.js';

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

describe('EvoHtmlScrapeSource', () => {
  it('fetches evo.com listing HTML and returns NormalizedProduct[]', async () => {
    const { EvoHtmlScrapeSource } = await import('../src/data/scrapers/evo.js');
    const pool = mockAgent.get('https://www.evo.com');
    pool.intercept({ path: '/snowboards', method: 'GET' })
      .reply(200,
        `<html><body>
          <div class="product-thumb-details">
            <a href="/snowboards/yes-greats-2026">Yes Greats 2026</a>
          </div>
        </body></html>`,
        { headers: { 'content-type': 'text/html' } });
    // Mock PDP
    pool.intercept({ path: '/snowboards/yes-greats-2026', method: 'GET' })
      .reply(200,
        `<html><body><h1>YES Greats Snowboard 2026</h1>
          <span class="pdp-spec-list-title"><strong>Waist Width</strong></span>
          <span class="pdp-spec-list-description">254mm</span>
        </body></html>`,
        { headers: { 'content-type': 'text/html' } });
    const scraper = new EvoHtmlScrapeSource();
    const products = await scraper.fetchAll(pipeline);
    expect(products.length).toBe(1);
    expect(products[0]?.retailer).toBe('evo');
    expect(products[0]?.waist_width_mm).toBe(254);
  });

  it('throws when listing returns a Cloudflare challenge page', async () => {
    const { EvoHtmlScrapeSource } = await import('../src/data/scrapers/evo.js');
    const pool = mockAgent.get('https://www.evo.com');
    pool.intercept({ path: '/snowboards', method: 'GET' })
      .reply(403,
        '<html><body><h1>Attention Required | Cloudflare</h1></body></html>',
        { headers: { 'content-type': 'text/html' } });
    // ALT URL also fails
    pool.intercept({ path: '/shop/snowboard/snowboards', method: 'GET' })
      .reply(200,
        '<html><body>Cloudflare ray id: abc</body></html>',
        { headers: { 'content-type': 'text/html' } });
    const scraper = new EvoHtmlScrapeSource();
    await expect(scraper.fetchAll(pipeline)).rejects.toThrow(/Cloudflare/);
  });

  it('extractSpecs: extracts waist_width_mm from spec HTML (mm format)', async () => {
    const { extractSpecs } = await import('../src/data/scrapers/evo.js');
    const html = `<html><body>
      <span class="pdp-spec-list-title"><strong>Waist Width</strong></span>
      <span class="pdp-spec-list-description">254mm</span>
    </body></html>`;
    const specs = extractSpecs(html);
    expect(specs.waist_width_mm).toBe(254);
  });

  it('extractSpecs: extracts flex_rating from pdp-feature block', async () => {
    const { extractSpecs } = await import('../src/data/scrapers/evo.js');
    const html = `<html><body>
      <div class="pdp-feature">
        <h5>Flex</h5>
        <div class="pdp-feature-description">Medium-Stiff (6/10)</div>
      </div>
    </body></html>`;
    const specs = extractSpecs(html);
    expect(specs.flex_rating).toBe('Medium-Stiff (6/10)');
  });

  it('skips individual PDP failures without aborting the whole fetch', async () => {
    const { EvoHtmlScrapeSource } = await import('../src/data/scrapers/evo.js');
    const pool = mockAgent.get('https://www.evo.com');
    pool.intercept({ path: '/snowboards', method: 'GET' })
      .reply(200,
        `<html><body>
          <div class="product-thumb-details"><a href="/snowboards/good-board">Good Board</a></div>
          <div class="product-thumb-details"><a href="/snowboards/bad-board">Bad Board</a></div>
        </body></html>`,
        { headers: { 'content-type': 'text/html' } });
    pool.intercept({ path: '/snowboards/good-board', method: 'GET' })
      .reply(200, '<html><body><h1>Good Board 2026</h1></body></html>',
        { headers: { 'content-type': 'text/html' } });
    pool.intercept({ path: '/snowboards/bad-board', method: 'GET' })
      .reply(500, 'Internal Server Error',
        { headers: { 'content-type': 'text/plain' } });
    const scraper = new EvoHtmlScrapeSource();
    const products = await scraper.fetchAll(pipeline);
    // Only 1 product (bad-board PDP fails → null → filtered out)
    expect(products.length).toBe(1);
    expect(products[0]?.handle).toBe('good-board');
  });
});
