/**
 * Deterministic flex advisory rule for the Shred Scout compatibility engine.
 *
 * Replaces the LLM-based flexPairing() advisory with a synchronous rule that
 * maps rider.ridingStyle to an expected flex range and compares against the
 * board's flexRating field.
 *
 * Error contract: this function NEVER throws. Missing flexRating returns
 * { verdict: 'unknown', advisory: true } — same shape as the old LLM result.
 */
import type { GearSetup, RuleResult } from './types.js';
import type { RiderProfile } from '../../types/profile.js';

const FLEX_RANGES: Record<string, [number, number]> = {
  beginner: [1, 4],
  'all-mountain': [4, 7],
  freeride: [7, 10],
};

/**
 * Assesses board flex compatibility for the rider's riding style.
 *
 * @param setup - The gear setup being evaluated. Uses board.flexRating (optional).
 * @param rider - Rider profile. Uses ridingStyle for range lookup.
 * @returns A RuleResult with advisory:true. Verdict is 'pass', 'warn', or 'unknown'.
 */
export function flexAdvisory(setup: GearSetup, rider: RiderProfile): RuleResult {
  const flexRating = setup.board.flexRating;

  if (flexRating === undefined || flexRating === null) {
    return {
      ruleId: 'flex-pairing',
      verdict: 'unknown',
      reason: 'Flex rating not available for this product',
      advisory: true,
    };
  }

  const range = FLEX_RANGES[rider.ridingStyle];
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
      : `Flex ${flexRating}/10 outside recommended range ${lo}–${hi} for ${rider.ridingStyle}`;

  return { ruleId: 'flex-pairing', verdict, reason, advisory: true };
}
