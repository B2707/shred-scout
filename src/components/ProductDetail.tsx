/**
 * ProductDetail - a full-screen, render-once view of a single product with its REAL photo.
 *
 * This is the one place a crisp pixel photo (iTerm2/Kitty graphics) renders. Inline photos on
 * the paged, re-rendering results list corrupt through Ink's redraw loop; here the screen is
 * static (no spinner, no paging) and the image is the LAST element with nothing positioned
 * after it, so the terminal's image cursor can't desync anything below it. Press any key
 * (handled by SearchView) to return to the results list.
 */

import { Box, Text, useStdout } from 'ink';
import type React from 'react';
import type { NormalizedProduct } from '../data/normalizer.js';
import { TerminalImage } from './TerminalImage.js';

export interface ProductDetailProps {
  product: NormalizedProduct;
  supportsImages: boolean;
}

export function ProductDetail({
  product,
  supportsImages,
}: ProductDetailProps): React.JSX.Element {
  const { stdout } = useStdout();
  const cols = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  const hasPrice = product.price_cents > 0;
  const priceLabel = hasPrice
    ? `$${(product.price_cents / 100).toFixed(2)}`
    : 'Price unavailable';

  // Size the photo to the terminal. Cells are ~2:1 (tall), so width ~ 2xheight renders a
  // square-ish source close to its real aspect. Leave headroom for the info lines above.
  const imgH = Math.max(6, Math.min(rows - 10, 20));
  const imgW = Math.max(12, Math.min(cols - 4, imgH * 2));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        {product.title}
      </Text>
      <Box>
        <Text bold color={hasPrice ? 'green' : 'gray'} dimColor={!hasPrice}>
          {priceLabel}
        </Text>
        <Text
          dimColor
        >{`   ${product.gear_category} · ${product.retailer}`}</Text>
      </Box>

      {(product.waist_width_mm !== null || product.flex_rating !== null) && (
        <Text color="gray">
          {[
            product.waist_width_mm !== null
              ? `⬙ ${product.waist_width_mm}mm`
              : null,
            product.flex_rating !== null ? `${product.flex_rating} flex` : null,
            product.mount_pattern || null,
          ]
            .filter(Boolean)
            .join('  •  ')}
        </Text>
      )}

      <Text dimColor>press any key to go back</Text>
      <Box height={1} />

      {/* Image is the LAST element - nothing rendered after it. */}
      {supportsImages && product.image_url ? (
        <TerminalImage
          source={product.image_url}
          supportsImages={supportsImages}
          width={imgW}
          height={imgH}
          // Render-once detail context: requests a high-res source (up to ~1024 px) and a much
          // larger inline-byte budget than the paged card list, so this wide box renders a crisp
          // photo instead of an upscaled <=128 px thumbnail. Safe because the screen is static and
          // the image is the last element with nothing positioned after it.
          kind="photo-detail"
        />
      ) : (
        <Text dimColor>(no photo available)</Text>
      )}
    </Box>
  );
}
