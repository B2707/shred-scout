/**
 * Deterministic search pipeline for Shred Scout.
 *
 * runSearch() replaces AgentLoop.#dispatchSearchProducts — it iterates all
 * configured retailers, fetches and normalizes products, persists them to SQLite,
 * and collects per-retailer errors without aborting the overall search.
 *
 * No LLM involvement. No EventEmitter. No AbortController.
 * Returns all results once all retailers have been queried.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import type { RequestPipeline } from '../data/pipeline.js';
import { RETAILERS, openDatabase, makeProductRepo } from '../data/index.js';
import type { ProductSource } from '../data/sources.js';
import { ShopifySource } from '../data/sources.js';
import { EvoHtmlScrapeSource } from '../data/scrapers/evo.js';

/**
 * Options for controlling runSearch behavior.
 */
export interface RunSearchOptions {
  /** When true, skip all HTTP and return fixture products from demo-products.json */
  demo?: boolean;
  /** Database path — ':memory:' for demo mode. Defaults to platform data dir. */
  dbPath?: string;
}

/**
 * Fetches and normalizes snowboard products from all configured retailers.
 *
 * @param query - Search query string. Reserved for future keyword filtering / logging.
 * @param rider - Rider profile. Reserved for future profile-based filtering.
 * @param pipeline - HTTP request pipeline for rate-limited concurrent requests.
 * @param options - Optional behavior overrides (demo mode, custom db path).
 * @returns An object with all normalized products and any per-retailer error messages.
 */
export async function runSearch(
  query: string,
  rider: RiderProfile,
  pipeline: RequestPipeline,
  options: RunSearchOptions = {},
): Promise<{ products: NormalizedProduct[]; errors: string[] }> {
  void query; // reserved for future keyword filtering / logging
  void rider; // reserved for future profile-based filtering

  // Demo mode: return fixture products from bundled JSON without any HTTP calls
  if (options.demo) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Probe dist/ first (built bundle), fall back to src/fixtures/ (tsx dev mode).
    // In dev, import.meta.url resolves to src/agent/search-pipeline.ts so
    // __dirname is src/agent/ — not where demo-products.json lives.
    const candidates = [
      join(__dirname, 'demo-products.json'),
      resolve(__dirname, '../../src/fixtures/demo-products.json'),
      resolve(__dirname, '../fixtures/demo-products.json'),
    ];
    const fixturePath = candidates.find(p => {
      try { readFileSync(p); return true; } catch { return false; }
    }) ?? candidates[0]; // fall through to readFileSync error if none found
    const fixtureJson = readFileSync(fixturePath, 'utf-8');
    const products = JSON.parse(fixtureJson) as NormalizedProduct[];
    return { products, errors: [] };
  }

  const db = openDatabase(options.dbPath);
  const productRepo = makeProductRepo(db);
  const all: NormalizedProduct[] = [];
  const errors: string[] = [];

  const sources: ProductSource[] = [
    ...RETAILERS.map(r => new ShopifySource(r.name, r.baseUrl)),
    new EvoHtmlScrapeSource(),
  ];

  try {
    for (const source of sources) {
      try {
        const normalized = await source.fetchAll(pipeline);
        for (const product of normalized) {
          productRepo.upsert(product);
          all.push(product);
        }
      } catch (err) {
        errors.push(`${source.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { products: all, errors };
  } finally {
    db.close();
  }
}
