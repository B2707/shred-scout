/**
 * Shopify retailer type definitions for Shred Scout.
 *
 * The hardcoded RETAILERS constant has been replaced by the retailer_configs
 * SQLite table managed by makeRetailerRepo(). Any Shopify store URL can be
 * added at runtime — no code changes required to support a new store.
 *
 * DEFAULT_RETAILERS is the seed set inserted on first run when the table is empty.
 * These are confirmed public Shopify stores with working /products.json endpoints.
 */
import type { RetailerConfigInput } from './repos/retailerRepo.js';

/** A single retailer source entry (matches retailer_configs table shape). */
export interface Retailer {
  /** Short identifier used as the `retailer` column value in SQLite. */
  name: string;
  /** Base URL without trailing slash — products.json or Storefront API endpoint is appended. */
  baseUrl: string;
  /**
   * Public Shopify Storefront Access Token.
   * When present, the GraphQL Storefront API is used instead of /products.json.
   * Null = store doesn't expose a public token; falls back to /products.json.
   */
  storefrontToken?: string | null;
}

/**
 * Default retailer seed set — inserted once on first run when retailer_configs is empty.
 * All entries use confirmed public Shopify /products.json endpoints (no token required).
 * Stores with headless Storefront APIs will have their token auto-detected at runtime.
 */
export const DEFAULT_RETAILERS: RetailerConfigInput[] = [
  { name: 'stoked', storeUrl: 'https://stokedboardshop.com', storefrontToken: null },
  { name: 'thirtytwo', storeUrl: 'https://www.thirtytwo.com', storefrontToken: null },
  { name: 'nidecker', storeUrl: 'https://www.nidecker.com', storefrontToken: null },
  { name: 'capita', storeUrl: 'https://www.capitasnowboarding.com', storefrontToken: null },
  { name: 'lib-tech', storeUrl: 'https://www.lib-tech.com', storefrontToken: null },
];
