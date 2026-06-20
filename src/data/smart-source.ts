/**
 * SmartShopifySource - Shopify product source with automatic API selection.
 *
 * Implements ProductSource with a two-tier strategy:
 *   1. Shopify Storefront GraphQL API (official, typed, cursor-paginated)
 *      - used when a public Storefront Access Token is available.
 *   2. Shopify AJAX API (/products.json, public, no auth)
 *      - fallback for stores without an exposed Storefront token.
 *
 * On first fetch, if no token is configured, SmartShopifySource probes the
 * store's homepage HTML for an embedded public token (common in headless
 * Shopify / Hydrogen storefronts). If found, the GraphQL path is used.
 *
 * This means any Shopify store URL works - no manual configuration required.
 */

import type { NormalizedProduct, ShopifyProductInput } from './normalizer.js';
import { normalizeProduct } from './normalizer.js';
import type { RequestPipeline } from './pipeline.js';
import { fetchAllProducts } from './shopify.js';
import type { ProductSource } from './sources.js';
import {
  extractStorefrontToken,
  fetchAllProductsGraphQL,
} from './storefront-api.js';

/**
 * Normalizes a batch of raw listings, isolating per-item failures. A single malformed
 * product (one that makes normalizeProduct throw despite its defensive contract) is dropped
 * rather than aborting the whole store - losing one bad listing is always better than losing
 * every product from that retailer.
 */
function normalizeBatch(
  raws: ShopifyProductInput[],
  retailer: string,
): NormalizedProduct[] {
  const out: NormalizedProduct[] = [];
  for (const raw of raws) {
    try {
      out.push(normalizeProduct(raw, retailer));
    } catch {
      // Drop the single bad listing; keep the rest of the store's products.
    }
  }
  return out;
}

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
    /**
     * Whether to probe the store homepage for an embedded Storefront token when none is
     * configured. Off by default: the probe costs a paced request per store on every search yet
     * almost always returns null on the seeded stores, so the default path goes straight to
     * products.json. Pass true (or a configured token) to use the richer GraphQL path.
     */
    private readonly autoDetectToken: boolean = false,
  ) {}

  async fetchAll(pipeline: RequestPipeline): Promise<NormalizedProduct[]> {
    const token = await this.resolveToken(pipeline);

    if (token) {
      // Storefront GraphQL API - official, cursor-paginated, typed
      const raws = await fetchAllProductsGraphQL(
        this.storeUrl,
        token,
        pipeline,
      );
      return normalizeBatch(raws, this.name);
    }

    // Fallback: public /products.json REST endpoint
    const raws = await fetchAllProducts(this.storeUrl, pipeline);
    return normalizeBatch(raws, this.name);
  }

  /**
   * Resolves the Storefront Access Token via:
   *   1. Constructor-provided token (explicit config)
   *   2. Auto-extraction from store HTML (headless storefront detection)
   *   3. null → use /products.json fallback
   *
   * Result is cached after first call to avoid repeated HTTP requests.
   */
  private async resolveToken(
    pipeline: RequestPipeline,
  ): Promise<string | null> {
    // Already resolved in a prior call
    if (this.resolvedToken !== undefined) return this.resolvedToken;

    // Explicit config wins
    if (this.storefrontToken) {
      this.resolvedToken = this.storefrontToken;
      return this.resolvedToken;
    }

    // Skip the per-store homepage probe unless explicitly opted in - it serializes a paced
    // request per store on every search for a token that almost never exists on the seed set.
    if (!this.autoDetectToken) {
      this.resolvedToken = null;
      return null;
    }

    // Attempt to auto-extract from store HTML
    const detected = await extractStorefrontToken(this.storeUrl, pipeline);
    this.resolvedToken = detected;
    return this.resolvedToken;
  }
}
