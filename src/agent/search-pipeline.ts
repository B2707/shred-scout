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
import { dirname, join } from 'node:path';
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import type { RequestPipeline } from '../data/pipeline.js';
import { RETAILERS, fetchAllProducts, normalizeProduct, openDatabase, makeProductRepo } from '../data/index.js';

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
    const fixtureJson = readFileSync(join(__dirname, 'demo-products.json'), 'utf-8');
    const products = JSON.parse(fixtureJson) as NormalizedProduct[];
    return { products, errors: [] };
  }

  const db = openDatabase(options.dbPath);
  const productRepo = makeProductRepo(db);
  const all: NormalizedProduct[] = [];
  const errors: string[] = [];

  try {
    for (const retailer of RETAILERS) {
      try {
        const raws = await fetchAllProducts(retailer.baseUrl, pipeline);
        for (const raw of raws) {
          const normalized = normalizeProduct(raw, retailer.name);
          productRepo.upsert(normalized);
          all.push(normalized);
        }
      } catch (err) {
        errors.push(`${retailer.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { products: all, errors };
  } finally {
    db.close();
  }
}
