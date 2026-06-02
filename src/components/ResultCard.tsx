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
import { execa } from 'execa';
import type { NormalizedProduct } from '../data/normalizer.js';
import type { RiderProfile } from '../types/profile.js';
import type { RuleResult } from '../domain/compatibility/types.js';
import { productFit } from '../domain/compatibility/product-adapter.js';
import { SaleDisplay } from './SaleDisplay.js';

/** Max rows reserved for inline terminal image — matches terminal-image height option. */
const IMAGE_HEIGHT_ROWS = 20;

/**
 * True only for a successful response that actually carries image bytes. Guards both
 * image paths against piping a 404 HTML error page into terminal-image/chafa, which
 * would emit a corrupt escape sequence (base64 of "404: Page not found") — B11/B12.
 */
function isImageResponse(res: { ok?: boolean; headers?: { get(name: string): string | null } }): boolean {
  if (res.ok === false) return false;
  const contentType = res.headers?.get?.('content-type') ?? '';
  return contentType.startsWith('image/');
}

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
  /** 1-based display index for "[N]" save-item prefix. Omit to hide the prefix. */
  index?: number;
  /** Rider profile — when present, the card shows a per-product compatibility badge (A2/A3). */
  rider?: RiderProfile;
}

/** Maps a per-product fit verdict to a compact, colored card badge (A2/A3). */
function fitBadge(result: RuleResult, bootSize: number): { symbol: string; color: string; label: string; dim: boolean } {
  switch (result.verdict) {
    case 'pass': return { symbol: '✓', color: 'green', label: `Fits your US ${bootSize} boots`, dim: false };
    case 'warn': return { symbol: '⚠', color: 'yellow', label: `Borderline fit for US ${bootSize}`, dim: false };
    case 'fail': return { symbol: '✗', color: 'red', label: `Won't fit your US ${bootSize} boots`, dim: false };
    default: return { symbol: '·', color: 'gray', label: 'Compatibility unverified', dim: true };
  }
}

export function ResultCard({ product, supportsImages, index, rider }: ResultCardProps): React.JSX.Element {
  const [imageAnsi, setImageAnsi] = useState<string | null>(null);
  const [chafaAvailable, setChafaAvailable] = useState(false);
  const [chafaAnsi, setChafaAnsi] = useState<string | null>(null);
  const { stdout } = useStdout();
  const columns = stdout.columns ?? 80;

  // Detect chafa availability once on mount (only when terminal-image is not available)
  useEffect(() => {
    if (supportsImages) return; // terminal-image already handles images; skip chafa check
    void (async () => {
      try {
        await execa('which', ['chafa']);
        setChafaAvailable(true);
      } catch {
        // chafa not installed — silently fall back to text-only card
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chafa image rendering — runs when chafa is available and terminal-image is not in use
  useEffect(() => {
    if (supportsImages || !product.image_url || !chafaAvailable) return;

    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(product.image_url!, { signal: ctrl.signal });
        if (!isImageResponse(res)) return;
        const buf = Buffer.from(await res.arrayBuffer());
        const result = await execa(
          'chafa',
          [
            '--size', `${Math.min(columns - 4, 40)}x20`,
            '--format', 'symbols',
            '--symbols', 'block+border',
            '-',
          ],
          { input: buf, timeout: 5000, cancelSignal: ctrl.signal },
        );
        if (!ctrl.signal.aborted) setChafaAnsi(result.stdout);
      } catch (err) {
        // Swallow AbortError and chafa errors — text card is first-class
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [product.image_url, chafaAvailable, supportsImages, columns]);

  // Async image fetch + terminal-image resolution
  // AbortController wired to cancel in-flight fetch when component unmounts (IN-02 fix)
  useEffect(() => {
    if (!supportsImages || !product.image_url) return;

    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(product.image_url!, { signal: ctrl.signal });
        if (!isImageResponse(res)) return;
        const buf = Buffer.from(await res.arrayBuffer());
        const ansi = await terminalImage.buffer(buf, {
          width: 80,
          height: IMAGE_HEIGHT_ROWS,
          preserveAspectRatio: true,
        });
        if (!ctrl.signal.aborted) setImageAnsi(ansi);
      } catch (err) {
        // Swallow AbortError; surface nothing for other errors (text card is first-class)
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [product.image_url, supportsImages]);

  // Title truncation — account for [N] prefix width when index is provided
  // Subtract 2 extra columns for the round border (1 per side) per Pitfall 2
  const indexPrefix = index !== undefined ? `[${index}] ` : '';
  const maxTitleWidth = Math.max(10, columns - 22 - indexPrefix.length - 2);
  const displayTitle =
    product.title.length > maxTitleWidth
      ? product.title.slice(0, maxTitleWidth - 1) + '…'
      : product.title;

  // Price formatting — a non-positive price means "not scraped" (e.g. evo PDP); show
  // "Price unavailable" rather than a misleading $0.00 (B9).
  const hasPrice = product.price_cents > 0;
  const priceLabel = hasPrice ? `$${(product.price_cents / 100).toFixed(2)}` : 'Price unavailable';

  // Sale detection — pure, no I/O
  const { isSale, compareAtCents } = detectSale(product.variants_json, product.price_cents);

  // Metadata line construction
  const categoryLabel = product.gear_category ?? 'unknown';

  // Per-product compatibility badge relative to the rider (A2/A3).
  const fit = rider ? productFit(product, rider) : null;
  const fitView = fit ? fitBadge(fit, rider!.bootSize) : null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      {/* terminal-image path — iTerm2/Kitty inline protocol */}
      {supportsImages && imageAnsi && (
        <>
          {/* Box height reserves Yoga layout space for OSC escape sequences (Pitfall 3) */}
          <Box height={IMAGE_HEIGHT_ROWS} />
          <Text>{imageAnsi}</Text>
        </>
      )}
      {/* chafa fallback path — colored ASCII for terminals without inline image support */}
      {!supportsImages && chafaAnsi && (
        <>
          <Box height={IMAGE_HEIGHT_ROWS} />
          <Text>{chafaAnsi}</Text>
        </>
      )}

      {/* Title + price row — [N] index prefix when provided */}
      <Box>
        {index !== undefined && <Text dimColor>[{index}] </Text>}
        <Text>{displayTitle}</Text>
        <Text>{'  '}</Text>
        <Text bold color={hasPrice ? 'green' : 'gray'} dimColor={!hasPrice}>{priceLabel}</Text>
      </Box>

      {/* Metadata row — gear_category · retailer in dimColor */}
      <Text dimColor>{categoryLabel} · {product.retailer}</Text>

      {/* Compatibility badge — shows whether this product fits the rider (A2/A3) */}
      {fitView && (
        <Text color={fitView.color} bold={fit?.verdict === 'pass'} dimColor={fitView.dim}>
          {fitView.symbol} {fitView.label}
        </Text>
      )}

      {/* Spec line — only for products with scraped PDP data (evo.com). Omit for Shopify products. */}
      {(product.waist_width_mm !== null || product.flex_rating !== null) && (
        <Text color="gray">
          {[
            product.waist_width_mm !== null ? `⬙ ${product.waist_width_mm}mm` : null,
            product.flex_rating !== null ? `${product.flex_rating} flex` : null,
            product.mount_pattern || null,
          ]
            .filter(Boolean)
            .join('  •  ')}
        </Text>
      )}

      {/* Sale display — only when cheapest variant is on sale */}
      {isSale && (
        <SaleDisplay priceCents={product.price_cents} compareAtCents={compareAtCents} />
      )}

    </Box>
  );
}
