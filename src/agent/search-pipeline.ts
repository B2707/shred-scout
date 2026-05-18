/**
 * Deterministic search pipeline for Shred Scout.
 *
 * runSearch() iterates all configured retailer sources, fetches and normalizes
 * products, persists them to SQLite, and collects per-retailer errors without
 * aborting the overall search.
 *
 * Retailer sources are loaded dynamically from the retailer_configs SQLite table
 * (managed by makeRetailerRepo). No stores are hardcoded — any Shopify URL works.
 *
 * Each source uses SmartShopifySource which prefers the official Shopify Storefront
 * GraphQL API when a public token is available, and falls back to /products.json
 * for stores without one. Token auto-detection runs on first fetch.
 *
 * No LLM involvement. No EventEmitter. No AbortController.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import type { RequestPipeline } from '../data/pipeline.js';
import { openDatabase, makeProductRepo } from '../data/index.js';
import { makeRetailerRepo } from '../data/repos/retailerRepo.js';
import { loadStores } from '../data/stores.js';
import { SmartShopifySource } from '../data/smart-source.js';
import { EvoHtmlScrapeSource } from '../data/scrapers/evo.js';
import type { ProductSource } from '../data/sources.js';

/** Options for controlling runSearch behavior. */
export interface RunSearchOptions {
  /** When true, skip all HTTP and return fixture products from demo-products.json */
  demo?: boolean;
  /** Database path — ':memory:' for demo mode. Defaults to platform data dir. */
  dbPath?: string;
}

/**
 * Fetches and normalizes snowboard products from all configured retailers.
 *
 * On first run the retailer_configs table is empty; loadStores() seeds it
 * automatically from stores.json (or embedded defaults if the file is absent).
 * Subsequent runs load whatever the user has configured — including
 * any stores added via `shred-scout add-store`.
 *
 * @param query    - Search query string. Reserved for future keyword filtering.
 * @param rider    - Rider profile. Reserved for future profile-based filtering.
 * @param pipeline - HTTP request pipeline for rate-limited concurrent requests.
 * @param options  - Optional behavior overrides (demo mode, custom db path).
 */
export async function runSearch(
  query: string,
  rider: RiderProfile,
  pipeline: RequestPipeline,
  options: RunSearchOptions = {},
): Promise<{ products: NormalizedProduct[]; errors: string[] }> {
  void query;
  void rider;

  // Demo mode: return fixture products from bundled JSON without any HTTP calls
  if (options.demo) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(__dirname, 'demo-products.json'),
      resolve(__dirname, '../../src/fixtures/demo-products.json'),
      resolve(__dirname, '../fixtures/demo-products.json'),
    ];
    const fixturePath = candidates.find(p => {
      try { readFileSync(p); return true; } catch { return false; }
    }) ?? candidates[0];
    const fixtureJson = readFileSync(fixturePath, 'utf-8');
    const products = JSON.parse(fixtureJson) as NormalizedProduct[];
    return { products, errors: [] };
  }

  const db = openDatabase(options.dbPath);
  const productRepo = makeProductRepo(db);
  const retailerRepo = makeRetailerRepo(db);

  // Seed default retailers on first run (when table is empty)
  retailerRepo.seedIfEmpty(loadStores());

  const configs = retailerRepo.all();

  const sources: ProductSource[] = [
    // Dynamic Shopify sources — GraphQL Storefront API preferred, /products.json fallback
    ...configs.map(c => new SmartShopifySource(c.name, c.storeUrl, c.storefrontToken)),
    // Non-Shopify HTML scraper (evo.com — Phase 7)
    new EvoHtmlScrapeSource(),
  ];

  const all: NormalizedProduct[] = [];
  const errors: string[] = [];

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
