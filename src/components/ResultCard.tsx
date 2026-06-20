/**
 * ResultCard - single-product card: title, price, compatibility badge, specs, and sale info.
 *
 * Text-only by design - no inline image. Piping an iTerm2/Kitty pixel-image escape through
 * Ink's re-rendering paged list corrupts it (the base64 leaks as text), so product photos
 * render only in the render-once <ProductDetail> view (open via the card's number key). This
 * keeps cards dense, scannable, and immune to the inline-image desync.
 */

import { Box, Text, useStdout } from 'ink';
import type React from 'react';
import type { NormalizedProduct } from '../data/normalizer.js';
import { productFit } from '../domain/compatibility/product-adapter.js';
import type { RuleResult } from '../domain/compatibility/types.js';
import type { RiderProfile } from '../types/profile.js';
import { SaleDisplay } from './SaleDisplay.js';

/** Per-category accent color for the metadata line. */
const CATEGORY_COLOR: Record<string, string> = {
  board: 'cyan',
  binding: 'magenta',
  boot: 'yellow',
};

/** Variant shape parsed from variants_json for sale detection. */
interface VariantForSale {
  price: string;
  compare_at_price: string | null;
}

/**
 * Detects whether the cheapest variant is on sale. Pure - no I/O.
 * Returns the resolved cents values for SaleDisplay (compareAtCents=0 when no sale).
 */
function detectSale(
  variantsJson: string,
  currentPriceCents: number,
): { isSale: boolean; compareAtCents: number } {
  let variants: VariantForSale[];
  try {
    variants = JSON.parse(variantsJson) as VariantForSale[];
  } catch {
    return { isSale: false, compareAtCents: 0 };
  }

  let compareAtCents = 0;
  for (const v of variants) {
    const vCents = Math.round(parseFloat(v.price) * 100);
    if (vCents === currentPriceCents && v.compare_at_price) {
      const cac = Math.round(parseFloat(v.compare_at_price) * 100);
      if (cac > currentPriceCents) {
        compareAtCents = cac;
        break;
      }
    }
  }

  return { isSale: compareAtCents > 0, compareAtCents };
}

export interface ResultCardProps {
  product: NormalizedProduct;
  supportsImages: boolean;
  /** 1-based display index for "[N]" save-item prefix. Omit to hide the prefix. */
  index?: number;
  /** Rider profile - when present, the card shows a per-product compatibility badge. */
  rider?: RiderProfile;
}

/** Maps a per-product fit verdict to a compact, colored card badge. */
function fitBadge(
  result: RuleResult,
  bootSize: number,
): { symbol: string; color: string; label: string; dim: boolean } {
  // Boot cards answer "is it made in my size?" rather than a cross-fit verdict;
  // the rule's own reason string already carries the size-specific wording.
  if (result.ruleId === 'boot-size-fit') {
    switch (result.verdict) {
      case 'pass':
        return {
          symbol: '✓',
          color: 'green',
          label: `Comes in your US ${bootSize}`,
          dim: false,
        };
      case 'warn':
        return {
          symbol: '⚠',
          color: 'yellow',
          label: result.reason,
          dim: false,
        };
      default:
        return {
          symbol: '·',
          color: 'cyan',
          label: `Your boot size: US ${bootSize}`,
          dim: true,
        };
    }
  }
  switch (result.verdict) {
    case 'pass':
      return {
        symbol: '✓',
        color: 'green',
        label: `Fits your US ${bootSize} boots`,
        dim: false,
      };
    case 'warn':
      return {
        symbol: '⚠',
        color: 'yellow',
        label: `Borderline fit for US ${bootSize}`,
        dim: false,
      };
    case 'fail':
      return {
        symbol: '✗',
        color: 'red',
        label: `Won't fit your US ${bootSize} boots`,
        dim: false,
      };
    default:
      return {
        symbol: '·',
        color: 'gray',
        label: 'Compatibility unverified',
        dim: true,
      };
  }
}

export function ResultCard({
  product,
  index,
  rider,
}: ResultCardProps): React.JSX.Element {
  const { stdout } = useStdout();
  const columns = stdout.columns ?? 80;

  // Title truncation - leave room for the [N] prefix and border.
  const indexPrefix = index !== undefined ? `[${index}] ` : '';
  const maxTitleWidth = Math.max(10, columns - 24 - indexPrefix.length);
  const displayTitle =
    product.title.length > maxTitleWidth
      ? `${product.title.slice(0, maxTitleWidth - 1)}…`
      : product.title;

  // Price - non-positive means "not scraped" (e.g. evo PDP); show "Price unavailable".
  const hasPrice = product.price_cents > 0;
  const priceLabel = hasPrice
    ? `$${(product.price_cents / 100).toFixed(2)}`
    : 'Price unavailable';

  const { isSale, compareAtCents } = detectSale(
    product.variants_json,
    product.price_cents,
  );
  const categoryLabel = product.gear_category ?? 'unknown';

  // Per-product compatibility badge relative to the rider.
  const fit = rider ? productFit(product, rider) : null;
  const fitView = fit && rider ? fitBadge(fit, rider.bootSize) : null;

  return (
    // Text-only card. Real product photos can't render inline here: piping the iTerm2/Kitty
    // pixel-image escape through Ink's re-rendering, paged card list corrupts it (base64 leaks
    // as text). Crisp photos belong in a dedicated, render-once product view; see task #2.
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginBottom={1}
    >
      <Box flexDirection="column" flexGrow={1}>
        {/* Title + price row - price right-aligned into a scannable column */}
        <Box justifyContent="space-between">
          <Box>
            {index !== undefined && <Text dimColor>[{index}] </Text>}
            <Text>{displayTitle}</Text>
          </Box>
          <Text bold color={hasPrice ? 'green' : 'gray'} dimColor={!hasPrice}>
            {priceLabel}
          </Text>
        </Box>

        {/* Metadata row - color-coded gear category · retailer */}
        <Text>
          <Text color={CATEGORY_COLOR[categoryLabel] ?? 'white'}>
            {categoryLabel}
          </Text>
          <Text dimColor> · {product.retailer}</Text>
        </Text>

        {/* Compatibility badge - whether this product fits the rider */}
        {fitView && (
          <Text
            color={fitView.color}
            bold={fit?.verdict === 'pass'}
            dimColor={fitView.dim}
          >
            {fitView.symbol} {fitView.label}
          </Text>
        )}

        {/* Spec line - only for products with scraped PDP data (evo.com). */}
        {(product.waist_width_mm !== null || product.flex_rating !== null) && (
          <Text color="gray">
            {[
              product.waist_width_mm !== null
                ? `⬙ ${product.waist_width_mm}mm`
                : null,
              product.flex_rating !== null
                ? `${product.flex_rating} flex`
                : null,
              product.mount_pattern || null,
            ]
              .filter(Boolean)
              .join('  •  ')}
          </Text>
        )}

        {/* Sale display - only when the cheapest variant is on sale */}
        {isSale && (
          <SaleDisplay
            priceCents={product.price_cents}
            compareAtCents={compareAtCents}
          />
        )}
      </Box>
    </Box>
  );
}
