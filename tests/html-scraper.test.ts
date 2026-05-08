/**
 * html-scraper.test.ts — Unit tests for EvoHtmlScrapeSource (DATA-03, DATA-04).
 * Uses undici MockAgent to intercept HTTP — no real network required.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { RequestPipeline } from '../src/data/pipeline.js';

// EvoHtmlScrapeSource is imported dynamically inside each test to allow the
// module to be added in Plan 03 without breaking the test file's existence now.

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
  it.todo('fetches evo.com listing HTML and returns NormalizedProduct[]');
  it.todo('surfaces Cloudflare block as error without throwing — returns empty products[]');
  it.todo('extracts waist_width_mm from spec HTML (mm format: "254mm")');
  it.todo('extracts flex_rating from feature HTML (e.g. "6/10")');
  it.todo('skips individual PDP failures without aborting the whole fetch');
});
