/**
 * Shopify storefront scraper for Shred Scout.
 *
 * fetchAllProducts() hits the public /products.json endpoint with pagination
 * (page=N loop until empty array) and returns all ShopifyProduct records.
 * No API key required - public Shopify storefront endpoint only.
 *
 * Rate limiting and retry are handled by RequestPipeline - do not add
 * any retry logic here.
 */
import type { RequestPipeline } from './pipeline.js';

/** A single variant from the Shopify products.json response. */
export interface ShopifyVariant {
  id: number;
  title: string;
  /** Price as a decimal string, e.g. "449.95". Always parseFloat() before use. */
  price: string;
  /** Compare-at price as a decimal string, or null if not on sale. */
  compare_at_price: string | null;
  option1: string | null;
  option2: string | null;
  sku: string;
  available: boolean;
}

/**
 * A single product from the Shopify products.json response.
 *
 * NOTE: `tags` may be a comma-separated string OR a string array depending on
 * the Shopify store version. Normalize with normalizeTags() before use.
 */
export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  vendor: string;
  /** May be a comma-separated string or an array - always normalize before use. */
  tags: string | string[];
  body_html: string;
  images: Array<{ src: string; position: number }>;
  variants: ShopifyVariant[];
}

/**
 * Normalizes Shopify's inconsistent tags field to a string array.
 * Tags may arrive as a comma-separated string or already as an array.
 */
export function normalizeTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * The hard page cap per store. Each page is up to 250 products, so 2 pages = up to 500 -
 * plenty for a deal search, and crucially few enough that gentle paced requests stay under the
 * per-IP rate limit. Paginating "until empty" (some stores have thousands of products) is what
 * tripped the limit and 429'd the whole search.
 */
const MAX_PAGES = 2;

/**
 * Fetches products from a Shopify store via the public products.json endpoint.
 *
 * Paginates with `?limit=250&page=N` up to MAX_PAGES (or until a short/empty page). All HTTP is
 * delegated to the RequestPipeline (global pacing + retry handled there). If a later page is
 * blocked (e.g. a 429), the products already collected are returned rather than discarded; only
 * a first-page failure surfaces as a store error.
 *
 * @param storeUrl - Base store URL without trailing slash, e.g. 'https://www.evo.com'
 * @param pipeline - RequestPipeline instance handling concurrency and retry
 * @param maxPages  - Page cap (default MAX_PAGES)
 * @returns ShopifyProduct records from the store (possibly partial)
 * @throws Error if the FIRST page request fails after retries
 */
export async function fetchAllProducts(
  storeUrl: string,
  pipeline: RequestPipeline,
  maxPages: number = MAX_PAGES,
): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${storeUrl}/products.json?limit=250&page=${page}`;
    let data: { products: ShopifyProduct[] };
    try {
      const res = await pipeline.fetch(url);
      data = (await res.json()) as { products: ShopifyProduct[] };
    } catch (err) {
      if (all.length > 0) break; // keep earlier pages; stop on a mid-pagination block
      throw err; // first page failed - surface the store error
    }
    if (!data.products || data.products.length === 0) break;
    all.push(...data.products);
    if (data.products.length < 250) break; // short page = last page
  }

  return all;
}
