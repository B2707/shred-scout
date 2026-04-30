/**
 * SaleDisplay — renders sale pricing in yellow: "(was $X.XX)  $Y.YY  (N% OFF)"
 *
 * Does NOT perform variants_json parsing — caller is responsible for computing
 * priceCents and compareAtCents before passing to this component.
 *
 * Design: Ink does not support text strikethrough universally (ANSI SGR 9 is
 * absent on macOS Terminal.app). The approved format is a parenthetical
 * "(was $X.XX)" in dimColor — see UI-SPEC.md sale display contract.
 *
 * Phase 5: Rendered by ResultCard when detectSale() returns isSale=true.
 */
import React from 'react';
import { Text } from 'ink';

export interface SaleDisplayProps {
  /** Current (sale) price in integer cents. */
  priceCents: number;
  /** Original (higher) price in integer cents. */
  compareAtCents: number;
}

/**
 * Renders the sale pricing line.
 * Format: (was $X.XX)  $Y.YY  (N% OFF) — entire line in yellow.
 */
export function SaleDisplay({ priceCents, compareAtCents }: SaleDisplayProps): React.JSX.Element {
  const pctOff = Math.round((1 - priceCents / compareAtCents) * 100);
  const originalDollars = (compareAtCents / 100).toFixed(2);
  const currentDollars = (priceCents / 100).toFixed(2);

  return (
    <Text color="yellow">
      <Text dimColor>(was ${originalDollars})  </Text>
      ${currentDollars}  ({pctOff}% OFF)
    </Text>
  );
}
