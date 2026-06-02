/**
 * FilterSpec type and applyFilterSpec() pure filter function.
 *
 * FilterSpec is the structured shape returned from the refine_results tool.
 * Each field is independently optional; applyFilterSpec applies the AND of all
 * present fields.
 *
 * Limitation: NormalizedProduct has no flex column. flex filtering is
 * implemented as a best-effort case-insensitive title keyword match. PDP
 * scraping will add real flex data.
 */
import type { NormalizedProduct } from '../data/normalizer.js';

export interface FilterSpec {
  /** Maximum price in USD (e.g. 400 = $400.00). Excludes products where price_cents > priceMax * 100. */
  priceMax?: number;
  /** Best-effort title keyword match — real spec data to come from PDP scraping. */
  flex?: 'soft' | 'medium' | 'stiff';
  /** Case-insensitive substring match against product title. */
  color?: string;
  /** Exact match against NormalizedProduct.gear_category (excludes null category products). */
  gearType?: 'board' | 'binding' | 'boot';
  /** Exact match against NormalizedProduct.retailer (slug, e.g. 'evo'). */
  retailer?: string;
}

/**
 * Filters products by the given FilterSpec.
 * Empty spec returns all products. Multi-field spec combines with AND.
 * Pure function — does not mutate input.
 */
export function applyFilterSpec(
  products: NormalizedProduct[],
  spec: FilterSpec,
): NormalizedProduct[] {
  return products.filter((p) => {
    if (spec.priceMax !== undefined && p.price_cents > spec.priceMax * 100)
      return false;
    if (spec.gearType !== undefined && p.gear_category !== spec.gearType)
      return false;
    if (spec.retailer !== undefined && p.retailer !== spec.retailer)
      return false;
    if (spec.color !== undefined) {
      if (!p.title.toLowerCase().includes(spec.color.toLowerCase()))
        return false;
    }
    if (spec.flex !== undefined) {
      // Best-effort: title keyword match. PDP scraping will use real flex data.
      if (!p.title.toLowerCase().includes(spec.flex)) return false;
    }
    return true;
  });
}
