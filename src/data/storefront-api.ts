/**
 * Shopify Storefront GraphQL API client for Shred Scout.
 *
 * Uses the official Shopify Storefront API (2025-01) with cursor-based pagination.
 * Requires a public Storefront Access Token per store - stores generate these via
 * Shopify Admin → Sales Channels → Storefront API.
 *
 * Endpoint: POST {storeUrl}/api/2025-01/graphql.json
 * Header:   X-Shopify-Storefront-Access-Token: {token}
 */

import type { ShopifyProductInput } from './normalizer.js';
import type { RequestPipeline } from './pipeline.js';

const STOREFRONT_API_VERSION = '2025-01';
const PAGE_SIZE = 250;
/**
 * Hard page cap, mirroring the REST path's MAX_PAGES (shopify.ts). 2 pages × 250 = up to 500
 * products - plenty for a deal search, and few enough that paced requests stay under the per-IP
 * rate limit. Without this, the cursor loop crawls every page and re-creates the 429 burst the
 * throttle exists to prevent.
 */
const MAX_GRAPHQL_PAGES = 2;

// ---------------------------------------------------------------------------
// GraphQL response types
// ---------------------------------------------------------------------------

interface StorefrontMoney {
  amount: string;
  currencyCode: string;
}

interface StorefrontVariantNode {
  id: string;
  title: string;
  price: StorefrontMoney;
  compareAtPrice: StorefrontMoney | null;
  availableForSale: boolean;
  sku: string;
  selectedOptions: Array<{ name: string; value: string }>;
}

interface StorefrontProductNode {
  id: string;
  title: string;
  handle: string;
  productType: string;
  vendor: string;
  tags: string[];
  description: string;
  featuredImage: { url: string } | null;
  variants: { edges: Array<{ node: StorefrontVariantNode }> };
}

interface StorefrontProductsResponse {
  data: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{ node: StorefrontProductNode }>;
    };
  };
  errors?: Array<{ message: string }>;
}

// ---------------------------------------------------------------------------
// GraphQL query - cursor-based pagination (production Shopify pattern)
// ---------------------------------------------------------------------------

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          productType
          vendor
          tags
          description
          featuredImage {
            url
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                availableForSale
                sku
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Adapter: StorefrontProductNode → ShopifyProductInput
// ---------------------------------------------------------------------------

export function adaptStorefrontProduct(
  node: StorefrontProductNode,
): ShopifyProductInput {
  // GID format: "gid://shopify/Product/12345678" → numeric ID. Guard against a missing /
  // unexpected id shape: parseInt of an empty/garbage tail yields NaN, so coalesce to 0.
  const idTail = typeof node.id === 'string' ? node.id.split('/').pop() : null;
  const parsedId = parseInt(idTail ?? '0', 10);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;

  // Defensive: a malformed node (missing variants/tags edges) must not throw - coalesce the
  // nested arrays so a single bad listing degrades to safe/empty fields, not a store-wide abort.
  const variantEdges = node.variants?.edges ?? [];

  return {
    id: numericId,
    title: node.title ?? '',
    handle: node.handle ?? '',
    product_type: node.productType ?? '',
    vendor: node.vendor ?? '',
    tags: Array.isArray(node.tags) ? node.tags : [],
    images: node.featuredImage?.url
      ? [{ src: node.featuredImage.url, position: 1 }]
      : [],
    variants: variantEdges.map((e) => ({
      price: e.node.price?.amount ?? '',
      compare_at_price: e.node.compareAtPrice?.amount ?? null,
      option1: e.node.selectedOptions?.[0]?.value ?? null,
      // Carry availability through so the in-stock price filter also works on the
      // preferred GraphQL path - not just /products.json.
      available: e.node.availableForSale,
    })),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches all products from a Shopify store via the Storefront GraphQL API.
 *
 * Uses cursor-based pagination (pageInfo.hasNextPage + endCursor) - the
 * production Shopify pattern, more robust than page-number approaches.
 *
 * @param storeUrl  - Base store URL without trailing slash (e.g. 'https://stokedboardshop.com')
 * @param token     - Public Storefront Access Token from the store's Shopify Admin
 * @param pipeline  - RequestPipeline - the POST is routed through pipeline.fetch() so it inherits
 *                    the global pacing + per-host queue (and 429-abort) just like the REST path
 * @param maxPages  - Cursor-page cap (default MAX_GRAPHQL_PAGES), mirroring the REST page cap
 * @returns Normalized ShopifyProductInput[] ready for normalizeProduct()
 */
export async function fetchAllProductsGraphQL(
  storeUrl: string,
  token: string,
  pipeline: RequestPipeline,
  maxPages: number = MAX_GRAPHQL_PAGES,
): Promise<ShopifyProductInput[]> {
  const endpoint = `${storeUrl}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  const all: ShopifyProductInput[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const variables: Record<string, unknown> = { first: PAGE_SIZE };
    if (cursor) variables.after = cursor;

    let res: Awaited<ReturnType<RequestPipeline['fetch']>>;
    try {
      // Route through the pipeline so the POST is paced/queued and 4xx (incl. 429) abort -
      // pipeline.fetch resolves only on a 2xx/3xx response, so no manual res.ok check is needed.
      res = await pipeline.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': token,
        },
        body: JSON.stringify({ query: PRODUCTS_QUERY, variables }),
      });
    } catch (err) {
      // Partial-result parity with the REST path (shopify.ts): once at least one page has
      // succeeded, a later-page block (429/5xx/timeout) returns what we already have rather
      // than discarding it. Only a FIRST-page failure surfaces as a store error.
      if (all.length > 0) break;
      // The pipeline aborts 4xx as a thrown error; surface the descriptive auth message the
      // caller relies on for 401/403, and rethrow everything else (429/5xx/timeout) unchanged.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('403')) {
        throw new Error(
          `Storefront API auth failed - token invalid or API disabled for ${storeUrl} (${msg})`,
        );
      }
      throw err;
    }

    // Parsing / GraphQL errors get the same partial-result treatment: keep earlier pages
    // when we already have some, only surface a first-page failure.
    let response: StorefrontProductsResponse;
    try {
      response = (await res.json()) as StorefrontProductsResponse;
      if (response.errors?.length) {
        throw new Error(
          `Storefront API errors: ${response.errors.map((e) => e.message).join('; ')}`,
        );
      }
    } catch (err) {
      if (all.length > 0) break;
      throw err;
    }

    const pageData = response.data?.products;
    if (!pageData) break;
    for (const edge of pageData.edges ?? []) {
      all.push(adaptStorefrontProduct(edge.node));
    }

    if (!pageData.pageInfo?.hasNextPage || !pageData.pageInfo?.endCursor) break;
    cursor = pageData.pageInfo.endCursor;
  }

  return all;
}

/**
 * Attempts to extract a public Storefront Access Token from a Shopify store's HTML.
 *
 * Many headless Shopify stores (Hydrogen, custom storefronts) embed their public
 * token in the page HTML or JavaScript bundles. Returns null if not found - the
 * caller should fall back to the /products.json REST endpoint.
 *
 * Token format: 32 hex characters (e.g. "a1b2c3d4e5f6...").
 */
export async function extractStorefrontToken(
  storeUrl: string,
  pipeline: RequestPipeline,
): Promise<string | null> {
  try {
    const res = await pipeline.fetch(storeUrl);
    const html = await res.text();

    const patterns = [
      /storefrontAccessToken['":\s]+['"]([a-f0-9]{32})['"]/i,
      /storefront_access_token['":\s]+['"]([a-f0-9]{32})['"]/i,
      /X-Shopify-Storefront-Access-Token['":\s]+['"]([a-f0-9]{32})['"]/i,
      /"storefrontToken":\s*"([a-f0-9]{32})"/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}
