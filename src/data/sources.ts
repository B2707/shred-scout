/**
 * ProductSource abstraction for Shred Scout.
 *
 * ProductSource is the common interface over Shopify and HTML scrapers.
 * runSearch() iterates an array of ProductSource instances - each source
 * is responsible for fetching and normalizing its own products.
 *
 * ShopifySource wraps the existing fetchAllProducts() + normalizeProduct()
 * pipeline from shopify.ts.
 */

import type { NormalizedProduct } from './normalizer.js';
import type { RequestPipeline } from './pipeline.js';

/** Common interface implemented by all product sources (Shopify, HTML scrapers). */
export interface ProductSource {
  /** Short identifier used as the `retailer` column value in SQLite. */
  readonly name: string;
  /** Fetch and normalize all products from this source. */
  fetchAll(pipeline: RequestPipeline): Promise<NormalizedProduct[]>;
}

/** Wraps existing fetchAllProducts + normalizeProduct for Shopify retailers. */
export class ShopifySource implements ProductSource {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
  ) {}

  async fetchAll(pipeline: RequestPipeline): Promise<NormalizedProduct[]> {
    const { fetchAllProducts } = await import('./shopify.js');
    const { normalizeProduct } = await import('./normalizer.js');
    const raws = await fetchAllProducts(this.baseUrl, pipeline);
    return raws.map((raw) => normalizeProduct(raw, this.name));
  }
}
