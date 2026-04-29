/**
 * Shopify retailer configuration for Shred Scout.
 *
 * RETAILERS is the single source of truth for which Shopify stores are scraped.
 * No runtime I/O — static constant only.
 */

/** A single configured Shopify retailer. */
export interface Retailer {
  /** Short identifier used as the `retailer` column value in SQLite. */
  name: string;
  /** Base URL without trailing slash — products.json is appended by the scraper. */
  baseUrl: string;
}

/**
 * Hardcoded list of Shopify snowboard retailers with public products.json endpoints.
 * All three stores confirmed to expose unauthenticated products.json.
 */
export const RETAILERS: readonly Retailer[] = [
  { name: 'evo', baseUrl: 'https://www.evo.com' },
  { name: 'tactics', baseUrl: 'https://www.tactics.com' },
  { name: 'the-house', baseUrl: 'https://www.the-house.com' },
] as const;
