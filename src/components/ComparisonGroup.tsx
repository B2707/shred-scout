/**
 * ComparisonGroup — renders a grouped multi-retailer price comparison.
 *
 * Triggered when groupProducts() finds 2+ NormalizedProduct entries sharing
 * the same normalized title (lowercase + trim). Renders:
 *   {normalizedTitle}              ← bold group header
 *       {retailer}  ${price}  [Best Price]  ← cheapest row (green+bold)
 *       {retailer}  ${price}               ← other rows
 *
 * CompatBadges are NOT shown in comparison rows — comparison is price-only.
 * No image rendering in comparison rows — price comparison is the focus.
 *
 * Per UI-SPEC.md: sub-rows indented paddingLeft={4}. Cheapest retailer identified
 * by minimum price_cents; [Best Price] label rendered inline on that row.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { NormalizedProduct } from '../data/normalizer.js';

export interface ComparisonGroupProps {
  /** Normalized (lowercase trimmed) title used as the group header. */
  normalizedTitle: string;
  /** 2+ products sharing the same normalized title, from different retailers. */
  products: NormalizedProduct[];
}

export function ComparisonGroup({ normalizedTitle, products }: ComparisonGroupProps): React.JSX.Element {
  // Find the minimum price_cents to identify the cheapest retailer row.
  const minPrice = Math.min(...products.map((p) => p.price_cents));

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      {/* Group header — bold normalized title */}
      <Text bold>{normalizedTitle}</Text>

      {/* Sub-rows — each retailer's price, indented, cheapest highlighted */}
      {products.map((p) => {
        const isCheapest = p.price_cents === minPrice;
        const priceDollars = (p.price_cents / 100).toFixed(2);
        return (
          <Box key={p.shopify_id} paddingLeft={4}>
            <Text bold={isCheapest} color={isCheapest ? 'green' : undefined}>
              {p.retailer}{'  '}${priceDollars}
              {isCheapest ? '  [Best Price]' : ''}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
