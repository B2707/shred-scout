/**
 * ProductGroup discriminated union — output of groupProducts().
 *
 * SearchView consumes ProductGroup[] to drive <Static items={groups}>.
 * 'single' groups → <ResultCard>; 'comparison' groups → <ComparisonGroup>.
 */
import type { NormalizedProduct } from '../data/normalizer.js';

/** A single-retailer product entry (no cross-retailer match found). */
export interface SingleGroup {
  type: 'single';
  product: NormalizedProduct;
}

/** Two or more retailers selling the same normalized-title product. */
export interface ComparisonGroupData {
  type: 'comparison';
  /** Normalized title used as group header (lowercase trimmed). */
  normalizedTitle: string;
  /** 2+ products sharing the same normalized title, unsorted. */
  products: NormalizedProduct[];
}

/** Discriminated union for Static iterator consumption in SearchView. */
export type ProductGroup = SingleGroup | ComparisonGroupData;

/**
 * Groups NormalizedProduct[] by exact normalized title (lowercase + trim).
 *
 * Pure function — no I/O, no side effects. Safe to call inside useMemo.
 * Products with the same normalized title from 2+ retailers become a 'comparison' group.
 * Products with a unique title (or 1 retailer) become 'single' entries.
 *
 * Preserves insertion order — products appear in the order they arrived from the agent.
 *
 * @param products - Raw product array from search state
 * @returns ProductGroup[] suitable for <Static items={groups}>
 */
export function groupProducts(products: NormalizedProduct[]): ProductGroup[] {
  const byTitle = new Map<string, NormalizedProduct[]>();
  for (const p of products) {
    const key = p.title.toLowerCase().trim();
    const existing = byTitle.get(key);
    if (existing) {
      existing.push(p);
    } else {
      byTitle.set(key, [p]);
    }
  }
  const groups: ProductGroup[] = [];
  for (const [normalizedTitle, items] of byTitle) {
    if (items.length >= 2) {
      groups.push({ type: 'comparison', normalizedTitle, products: items });
    } else {
      groups.push({ type: 'single', product: items[0] });
    }
  }
  return groups;
}
