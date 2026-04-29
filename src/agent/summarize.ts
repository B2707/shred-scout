/**
 * summarize.ts — NormalizedProduct → ProductSummary transform.
 *
 * Pure function. Used by AgentLoop's tool result construction to keep tool result
 * content compact (Claude never sees raw 5KB product JSON — only the summary shape).
 */
import type { NormalizedProduct } from '../data/normalizer.js';

export interface ProductSummary {
  /** Stable Shopify product id — used as React key and for follow-up tool calls. */
  id: string;
  /** Product title verbatim — Claude renders this to the user. */
  title: string;
  /** Human-readable price formatted as USD with 2 decimals (e.g. "$449.95"). */
  price: string;
  /** Pipe-joined non-null categorical fields: gear_category | mount_pattern | retailer | vendor. */
  summary: string;
}

/**
 * Summarizes a NormalizedProduct to the compact ProductSummary shape.
 * Filters out null/empty parts before joining with ' | '.
 */
export function summarizeProduct(p: NormalizedProduct): ProductSummary {
  return {
    id: p.shopify_id,
    title: p.title,
    price: `$${(p.price_cents / 100).toFixed(2)}`,
    summary: [p.gear_category, p.mount_pattern, p.retailer, p.vendor]
      .filter((part): part is string => Boolean(part))
      .join(' | '),
  };
}
