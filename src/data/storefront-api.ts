/**
 * Shopify Storefront GraphQL API client for Shred Scout.
 *
 * Uses the official Shopify Storefront API (2025-01) with cursor-based pagination.
 * Requires a public Storefront Access Token per store — stores generate these via
 * Shopify Admin → Sales Channels → Storefront API.
 *
 * Endpoint: POST {storeUrl}/api/2025-01/graphql.json
 * Header:   X-Shopify-Storefront-Access-Token: {token}
 */
import type { RequestPipeline } from './pipeline.js';
import type { ShopifyProductInput } from './normalizer.js';
import { fetch } from 'undici';

const STOREFRONT_API_VERSION = '2025-01';
const PAGE_SIZE = 250;

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
// GraphQL query — cursor-based pagination (production Shopify pattern)
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

function adaptStorefrontProduct(node: StorefrontProductNode): ShopifyProductInput {
  // GID format: "gid://shopify/Product/12345678" → numeric ID
  const numericId = parseInt(node.id.split('/').pop() ?? '0', 10);

  return {
    id: numericId,
    title: node.title,
    handle: node.handle,
    product_type: node.productType,
    vendor: node.vendor,
    tags: node.tags,
    images: node.featuredImage ? [{ src: node.featuredImage.url, position: 1 }] : [],
    variants: node.variants.edges.map(e => ({
      price: e.node.price.amount,
      compare_at_price: e.node.compareAtPrice?.amount ?? null,
      option1: e.node.selectedOptions[0]?.value ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches all products from a Shopify store via the Storefront GraphQL API.
 *
 * Uses cursor-based pagination (pageInfo.hasNextPage + endCursor) — the
 * production Shopify pattern, more robust than page-number approaches.
 *
 * @param storeUrl  - Base store URL without trailing slash (e.g. 'https://stokedboardshop.com')
 * @param token     - Public Storefront Access Token from the store's Shopify Admin
 * @param pipeline  - RequestPipeline for per-host rate limiting (timeout only — POST bodies
 *                    bypass the queue to avoid deadlock; concurrency is handled by the caller)
 * @returns Normalized ShopifyProductInput[] ready for normalizeProduct()
 */
export async function fetchAllProductsGraphQL(
  storeUrl: string,
  token: string,
  pipeline: RequestPipeline,
): Promise<ShopifyProductInput[]> {
  const endpoint = `${storeUrl}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  const all: ShopifyProductInput[] = [];
  let cursor: string | null = null;

  while (true) {
    const variables: Record<string, unknown> = { first: PAGE_SIZE };
    if (cursor) variables['after'] = cursor;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), pipeline.timeout);

    let response: StorefrontProductsResponse;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': token,
          'User-Agent': pipeline.userAgent,
        },
        body: JSON.stringify({ query: PRODUCTS_QUERY, variables }),
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(`Storefront API auth failed (HTTP ${res.status}) — token invalid or API disabled for ${storeUrl}`);
      }
      if (!res.ok) {
        throw new Error(`Storefront API HTTP ${res.status} from ${storeUrl}`);
      }

      response = (await res.json()) as StorefrontProductsResponse;
    } finally {
      clearTimeout(timer);
    }

    if (response.errors?.length) {
      throw new Error(`Storefront API errors: ${response.errors.map(e => e.message).join('; ')}`);
    }

    const page = response.data.products;
    for (const edge of page.edges) {
      all.push(adaptStorefrontProduct(edge.node));
    }

    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) break;
    cursor = page.pageInfo.endCursor;
  }

  return all;
}

/**
 * Attempts to extract a public Storefront Access Token from a Shopify store's HTML.
 *
 * Many headless Shopify stores (Hydrogen, custom storefronts) embed their public
 * token in the page HTML or JavaScript bundles. Returns null if not found — the
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
