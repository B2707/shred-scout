/**
 * SmartShopifySource — Shopify product source with automatic API selection.
 *
 * Implements ProductSource with a two-tier strategy:
 *   1. Shopify Storefront GraphQL API (official, typed, cursor-paginated)
 *      — used when a public Storefront Access Token is available.
 *   2. Shopify AJAX API (/products.json, public, no auth)
 *      — fallback for stores without an exposed Storefront token.
 *
 * On first fetch, if no token is configured, SmartShopifySource probes the
 * store's homepage HTML for an embedded public token (common in headless
 * Shopify / Hydrogen storefronts). If found, the GraphQL path is used.
 *
 * This means any Shopify store URL works — no manual configuration required.
 */
import type { RequestPipeline } from './pipeline.js';
import type { NormalizedProduct } from './normalizer.js';
import type { ProductSource } from './sources.js';
import { fetchAllProductsGraphQL, extractStorefrontToken } from './storefront-api.js';
import { fetchAllProducts } from './shopify.js';
import { normalizeProduct } from './normalizer.js';

export class SmartShopifySource implements ProductSource {
  private resolvedToken: string | null | undefined = undefined; // undefined = not yet resolved

  /**
   * @param name           - Short retailer identifier (stored in products.retailer column)
   * @param storeUrl       - Base store URL without trailing slash
   * @param storefrontToken - Known public Storefront Access Token, or null to auto-detect
   */
  constructor(
    readonly name: string,
    private readonly storeUrl: string,
    private readonly storefrontToken: string | null = null,
  ) {}

  async fetchAll(pipeline: RequestPipeline): Promise<NormalizedProduct[]> {
    const token = await this.resolveToken(pipeline);

    if (token) {
      // Storefront GraphQL API — official, cursor-paginated, typed
      const raws = await fetchAllProductsGraphQL(this.storeUrl, token, pipeline);
      return raws.map(raw => normalizeProduct(raw, this.name));
    }

    // Fallback: public /products.json REST endpoint
    const raws = await fetchAllProducts(this.storeUrl, pipeline);
    return raws.map(raw => normalizeProduct(raw, this.name));
  }

  /**
   * Resolves the Storefront Access Token via:
   *   1. Constructor-provided token (explicit config)
   *   2. Auto-extraction from store HTML (headless storefront detection)
   *   3. null → use /products.json fallback
   *
   * Result is cached after first call to avoid repeated HTTP requests.
   */
  private async resolveToken(pipeline: RequestPipeline): Promise<string | null> {
    // Already resolved in a prior call
    if (this.resolvedToken !== undefined) return this.resolvedToken;

    // Explicit config wins
    if (this.storefrontToken) {
      this.resolvedToken = this.storefrontToken;
      return this.resolvedToken;
    }

    // Attempt to auto-extract from store HTML
    const detected = await extractStorefrontToken(this.storeUrl, pipeline);
    this.resolvedToken = detected;
    return this.resolvedToken;
  }
}
