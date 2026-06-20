/**
 * Deterministic flex advisory rule for the Shred Scout compatibility engine.
 *
 * A synchronous rule that maps rider.ridingStyle to an expected flex range and
 * compares against the board's flexRating field.
 *
 * Error contract: this function NEVER throws. Missing flexRating returns
 * { verdict: 'unknown', advisory: true }.
 */

import type { RiderProfile } from '../../types/profile.js';
import type { GearSetup, RuleResult } from './types.js';

// Recommended board flex (1 = soft … 10 = stiff) per riding style. Covers every
// canonical style the wizard/onboarding can produce - previously only
// beginner/all-mountain/freeride existed, so freestyle/park/powder/backcountry
// returned 'unknown'.
const FLEX_RANGES: Record<string, [number, number]> = {
  beginner: [1, 4],
  park: [2, 5],
  freestyle: [3, 6],
  'all-mountain': [4, 7],
  powder: [5, 8],
  backcountry: [6, 9],
  freeride: [7, 10],
};

/** Normalizes a free-text riding style: trims, lowercases, collapses spaces/underscores to hyphens. */
function normalizeStyle(style: string): string {
  return style
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

/**
 * Assesses board flex compatibility for the rider's riding style.
 *
 * @param setup - The gear setup being evaluated. Uses board.flexRating (optional).
 * @param rider - Rider profile. Uses ridingStyle for range lookup.
 * @returns A RuleResult with advisory:true. Verdict is 'pass', 'warn', or 'unknown'.
 */
export function flexAdvisory(
  setup: GearSetup,
  rider: RiderProfile,
): RuleResult {
  const flexRating = setup.board.flexRating;

  if (flexRating === undefined || flexRating === null) {
    return {
      ruleId: 'flex-pairing',
      verdict: 'unknown',
      reason: 'Flex rating not available for this product',
      advisory: true,
    };
  }

  const range = FLEX_RANGES[normalizeStyle(rider.ridingStyle)];
  if (!range) {
    return {
      ruleId: 'flex-pairing',
      verdict: 'unknown',
      reason: `No flex range defined for riding style '${rider.ridingStyle}'`,
      advisory: true,
    };
  }

  const [lo, hi] = range;
  const verdict = flexRating >= lo && flexRating <= hi ? 'pass' : 'warn';
  const reason =
    verdict === 'pass'
      ? `Flex ${flexRating}/10 suits ${rider.ridingStyle} riding style`
      : `Flex ${flexRating}/10 outside recommended range ${lo}-${hi} for ${rider.ridingStyle}`;

  return { ruleId: 'flex-pairing', verdict, reason, advisory: true };
}
