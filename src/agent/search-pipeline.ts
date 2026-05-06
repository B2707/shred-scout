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
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import type { RequestPipeline } from '../data/pipeline.js';
import { RETAILERS, fetchAllProducts, normalizeProduct, openDatabase, makeProductRepo } from '../data/index.js';

/**
 * Fetches and normalizes snowboard products from all configured retailers.
 *
 * @param query - Search query string. Reserved for future keyword filtering / logging.
 * @param rider - Rider profile. Reserved for future profile-based filtering.
 * @param pipeline - HTTP request pipeline for rate-limited concurrent requests.
 * @returns An object with all normalized products and any per-retailer error messages.
 */
export async function runSearch(
  query: string,
  rider: RiderProfile,
  pipeline: RequestPipeline,
): Promise<{ products: NormalizedProduct[]; errors: string[] }> {
  void query; // reserved for future keyword filtering / logging
  void rider; // reserved for future profile-based filtering

  const db = openDatabase();
  const productRepo = makeProductRepo(db);
  const all: NormalizedProduct[] = [];
  const errors: string[] = [];

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
}
