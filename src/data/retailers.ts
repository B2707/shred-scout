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
 * Shopify snowboard retailers with confirmed public products.json endpoints.
 * Verified 2026-04-30: evo/tactics/the-house are dead (403/redirect/404).
 */
export const RETAILERS: readonly Retailer[] = [
  { name: 'stoked', baseUrl: 'https://stokedboardshop.com' },
  { name: 'thirtytwo', baseUrl: 'https://www.thirtytwo.com' },
  { name: 'nidecker', baseUrl: 'https://www.nidecker.com' },
] as const;
