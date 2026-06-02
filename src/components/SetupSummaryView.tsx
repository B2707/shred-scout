/**
 * SetupSummaryView — shown automatically when all three gear slots (board, binding, boot)
 * have been saved to the wishlist. Displays the saved products with compatibility verdict.
 *
 * Final screen in the save flow. Triggered by handleSetupSaved in App.tsx
 * when setupRepo.findCompleteSetup() returns a non-null row.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import type { NormalizedProduct } from '../data/normalizer.js';
import type { makeProductRepo } from '../data/repos/productRepo.js';
import type { SavedSetup } from '../data/repos/setupRepo.js';
import { evaluateCompatibility } from '../domain/compatibility/engine.js';
import {
  toBinding,
  toBoard,
  toBoot,
} from '../domain/compatibility/product-adapter.js';
import type { RiderProfile } from '../types/profile.js';

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
  /**
   * Toggles the price alert for this setup. Surfaced here because the completing (3rd) save
   * unmounts SearchView before its alert opt-in modal can show — so the opt-in would otherwise
   * be silently skipped on the very setup that just completed.
   */
  onToggleAlert?: (id: number, enabled: boolean) => void;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function SetupSummaryView({
  setup,
  productRepo,
  rider,
  onWishlist,
  onNewSearch,
  onToggleAlert,
}: SetupSummaryViewProps): React.JSX.Element {
  const [alertEnabled, setAlertEnabled] = useState(setup.alertEnabled);
  const board =
    setup.boardId != null ? productRepo.findById(setup.boardId) : null;
  const binding =
    setup.bindingId != null ? productRepo.findById(setup.bindingId) : null;
  const boot = setup.bootId != null ? productRepo.findById(setup.bootId) : null;

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
      rider,
    );
    const hasFail = results.some((r) => r.verdict === 'fail');
    const hasWarn = results.some((r) => r.verdict === 'warn');
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
    reasons = results.map((r) => r.reason);
  }

  useInput((input) => {
    if (input === 'q') onWishlist();
    else if (input === 'n') onNewSearch();
    else if (input === 'a') {
      const next = !alertEnabled;
      setAlertEnabled(next);
      onToggleAlert?.(setup.id, next);
    }
  });

  function renderSlot(
    label: string,
    product: NormalizedProduct | null,
  ): React.JSX.Element {
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
        <Text> </Text>
        <Text bold color="green">
          {formatPrice(product.price_cents)}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Setup Complete
      </Text>

      <Box marginTop={1} flexDirection="column">
        {renderSlot('board', board)}
        {renderSlot('binding', binding)}
        {renderSlot('boot', boot)}
      </Box>

      <Box marginTop={1}>
        {missing ? (
          <Text color="yellow">
            Cannot compute compatibility — missing product data
          </Text>
        ) : (
          <Text color={verdictColor} bold>
            {verdictLabel}: {reasons.join('; ')}
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        {alertEnabled ? (
          <Text color="green">
            🔔 Price alert on — watching this setup for price drops
          </Text>
        ) : (
          <Text dimColor>
            Price alert off — press [a] to watch this setup for price drops
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          [a] {alertEnabled ? 'disable' : 'enable'} price alert · [q] back to
          wishlist · [n] new search
        </Text>
      </Box>
    </Box>
  );
}
