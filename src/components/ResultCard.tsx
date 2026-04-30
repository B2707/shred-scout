/**
 * ResultCard — single-product card with async image rendering and sale detection.
 *
 * Layout (top → bottom):
 *   [image — 80col × 20row, only when supportsImages=true AND image_url≠null AND imageAnsi resolved]
 *   {title truncated}   ${price}
 *   {gear_category} · {retailer}  (dimColor)
 *   [SaleDisplay — only when compare_at_price > price in cheapest variant]
 *
 * CompatBadge row is intentionally OMITTED in Phase 5: runRules() requires a
 * complete GearSetup (board + binding + boot). Individual cards have one gear
 * type only. CompatBadge will be wired in Phase 6. See RESEARCH.md Pitfall 6.
 *
 * Image protocol:
 *   - Static import of terminal-image (never dynamic import inside useEffect — Pitfall 4)
 *   - useEffect + useState for async resolution (never call buffer() during render — RESEARCH Pattern 1)
 *   - <Box height={IMAGE_HEIGHT_ROWS} /> before <Text>{imageAnsi}</Text> to reserve layout height
 *     for OSC escape sequences that Ink's Yoga engine measures as zero-height (Pitfall 3)
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import terminalImage from 'terminal-image';
import type { NormalizedProduct } from '../data/normalizer.js';
import { SaleDisplay } from './SaleDisplay.js';

/** Max rows reserved for inline terminal image — matches terminal-image height option. */
const IMAGE_HEIGHT_ROWS = 20;

/** Variant shape parsed from variants_json for sale detection. */
interface VariantForSale {
  price: string;
  compare_at_price: string | null;
}

/**
 * Detects whether the cheapest variant is on sale.
 * Pure function — no I/O. Returns the resolved cents values for SaleDisplay.
 *
 * @param variantsJson - NormalizedProduct.variants_json (JSON-stringified variant array)
 * @param currentPriceCents - NormalizedProduct.price_cents (already-computed cheapest price)
 * @returns { isSale, compareAtCents } — compareAtCents=0 when no sale
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

  // Find the variant whose price matches currentPriceCents (the cheapest)
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
  /** Optional pre-computed compat results — omitted in Phase 5, wired in Phase 6. */
  compatResults?: import('../domain/compatibility/types.js').RuleResult[];
}

export function ResultCard({ product, supportsImages }: ResultCardProps): React.JSX.Element {
  const [imageAnsi, setImageAnsi] = useState<string | null>(null);
  const { stdout } = useStdout();
  const columns = stdout.columns ?? 80;

  // Async image fetch + terminal-image resolution
  useEffect(() => {
    if (!supportsImages || !product.image_url) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(product.image_url!);
        const buf = Buffer.from(await res.arrayBuffer());
        const ansi = await terminalImage.buffer(buf, {
          width: 80,
          height: IMAGE_HEIGHT_ROWS,
          preserveAspectRatio: true,
        });
        if (!cancelled) setImageAnsi(ansi);
      } catch {
        // Image fetch or render failure → silent fallback to text-only card
        // No error surfaced — text card is first-class, not degraded (UI-SPEC)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product.image_url, supportsImages]);

  // Title truncation — safe max width per UI-SPEC.md
  const maxTitleWidth = Math.max(10, columns - 22);
  const displayTitle =
    product.title.length > maxTitleWidth
      ? product.title.slice(0, maxTitleWidth - 1) + '…'
      : product.title;

  // Price formatting
  const priceDollars = (product.price_cents / 100).toFixed(2);

  // Sale detection — pure, no I/O
  const { isSale, compareAtCents } = detectSale(product.variants_json, product.price_cents);

  // Metadata line construction
  const categoryLabel = product.gear_category ?? 'unknown';

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      {/* Image section — only when supportsImages=true AND image resolved */}
      {supportsImages && imageAnsi && (
        <>
          {/* Box height reserves Yoga layout space for OSC escape sequences (Pitfall 3) */}
          <Box height={IMAGE_HEIGHT_ROWS} />
          <Text>{imageAnsi}</Text>
        </>
      )}

      {/* Title + price row */}
      <Box>
        <Text>{displayTitle}</Text>
        <Text>{'  '}</Text>
        <Text bold={!isSale}>${priceDollars}</Text>
      </Box>

      {/* Metadata row — gear_category · retailer in dimColor */}
      <Text dimColor>{categoryLabel} · {product.retailer}</Text>

      {/* Sale display — only when cheapest variant is on sale */}
      {isSale && (
        <SaleDisplay priceCents={product.price_cents} compareAtCents={compareAtCents} />
      )}

      {/* CompatBadge row intentionally omitted — Phase 6 wires this */}
    </Box>
  );
}
