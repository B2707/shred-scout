/**
 * SetupSummaryView — shown automatically when all three gear slots (board, binding, boot)
 * have been saved to the wishlist. Displays the saved products with compatibility verdict.
 *
 * Phase 9: final screen in the save flow. Triggered by handleSetupSaved in App.tsx
 * when setupRepo.findCompleteSetup() returns a non-null row.
 */
import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { SavedSetup } from '../data/repos/setupRepo.js';
import type { makeProductRepo } from '../data/repos/productRepo.js';
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import { evaluateCompatibility } from '../domain/compatibility/engine.js';
import type { Board, Binding, Boot } from '../domain/compatibility/types.js';

export interface SetupSummaryViewProps {
  /** The complete setup to display. boardId/bindingId/bootId are guaranteed non-null by caller. */
  setup: SavedSetup;
  /** Product repository for resolving integer PKs to NormalizedProduct records. */
  productRepo: ReturnType<typeof makeProductRepo>;
  /** Rider profile passed to runRules for compatibility evaluation. */
  rider: RiderProfile;
  /** Invoked when user presses 'q' — routes back to wishlist. */
  onWishlist: () => void;
  /** Invoked when user presses 'n' — routes to new search. */
  onNewSearch: () => void;
}

function formatPrice(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

/**
 * Maps a NormalizedProduct to the Board domain type for runRules.
 * Falls back to 0mm waist and '4x4' mount when data is absent.
 */
function toBoard(p: NormalizedProduct): Board {
  return {
    waistWidthMm: p.waist_width_mm ?? 0,
    mountingPattern: p.mount_pattern,
  };
}

/**
 * Maps a NormalizedProduct to the Binding domain type for runRules.
 * Attempts to parse sizeRange from variants_json option1; falls back to [0, 999].
 */
function toBinding(p: NormalizedProduct): Binding {
  let sizeRange: [number, number] = [0, 999];
  try {
    const variants = JSON.parse(p.variants_json) as Array<{ option1?: string }>;
    const sizes: number[] = [];
    for (const v of variants) {
      const n = parseFloat(v.option1 ?? '');
      if (Number.isFinite(n) && n > 0) sizes.push(n);
    }
    if (sizes.length >= 2) {
      sizeRange = [Math.min(...sizes), Math.max(...sizes)];
    } else if (sizes.length === 1) {
      sizeRange = [sizes[0]! - 1, sizes[0]! + 1];
    }
  } catch {
    // keep fallback
  }
  return {
    sizeRange,
    discPattern: p.mount_pattern,
  };
}

/**
 * Maps a NormalizedProduct to the Boot domain type for runRules.
 * Uses the rider's bootSize as the authoritative size value.
 */
function toBoot(riderBootSize: number): Boot {
  return { sizeUS: riderBootSize };
}

export function SetupSummaryView({
  setup,
  productRepo,
  rider,
  onWishlist,
  onNewSearch,
}: SetupSummaryViewProps): React.JSX.Element {
  const board = productRepo.findById(setup.boardId!);
  const binding = productRepo.findById(setup.bindingId!);
  const boot = productRepo.findById(setup.bootId!);

  const missing = !board || !binding || !boot;

  // Compute compatibility verdict when all products are available
  let verdictLabel = '';
  let verdictColor: 'green' | 'yellow' | 'red' = 'green';
  let reasons: string[] = [];

  if (!missing) {
    const results = evaluateCompatibility(
      {
        board: toBoard(board),
        binding: toBinding(binding),
        boot: toBoot(rider.bootSize),
      },
      rider
    );
    const hasFail = results.some(r => r.verdict === 'fail');
    const hasWarn = results.some(r => r.verdict === 'warn');
    if (hasFail) {
      verdictLabel = 'FAIL';
      verdictColor = 'red';
    } else if (hasWarn) {
      verdictLabel = 'WARN';
      verdictColor = 'yellow';
    } else {
      verdictLabel = 'PASS';
      verdictColor = 'green';
    }
    reasons = results.map(r => r.reason);
  }

  useInput((input) => {
    if (input === 'q') onWishlist();
    else if (input === 'n') onNewSearch();
  });

  function renderSlot(label: string, product: NormalizedProduct | null): React.JSX.Element {
    if (!product) {
      return (
        <Box key={label}>
          <Text dimColor>{label}: </Text>
          <Text color="red">Unknown product (deleted)</Text>
        </Box>
      );
    }
    return (
      <Box key={label}>
        <Text dimColor>{label}: </Text>
        <Text>{product.title}</Text>
        <Text>  </Text>
        <Text bold color="green">{formatPrice(product.price_cents)}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Setup Complete</Text>

      <Box marginTop={1} flexDirection="column">
        {renderSlot('board', board)}
        {renderSlot('binding', binding)}
        {renderSlot('boot', boot)}
      </Box>

      <Box marginTop={1}>
        {missing ? (
          <Text color="yellow">Cannot compute compatibility — missing product data</Text>
        ) : (
          <Text color={verdictColor} bold>
            {verdictLabel}: {reasons.join('; ')}
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[q] back to wishlist · [n] new search</Text>
      </Box>
    </Box>
  );
}
