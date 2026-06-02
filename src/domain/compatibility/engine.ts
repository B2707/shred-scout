/**
 * Compatibility engine entry point for Shred Scout.
 *
 * runRules() calls all three hard rule functions synchronously and returns their
 * combined results as a RuleResult[]. No I/O, no external state.
 * The async flexPairing advisory is NOT called here — it is a separate call.
 */

import type { RiderProfile } from '../../types/profile.js';
import { flexAdvisory } from './flex-advisory.js';
import { bootToBindingSize, bootToBoardWaist, discToMount } from './rules.js';
import type { GearSetup, RuleResult } from './types.js';

/**
 * Runs all three hard compatibility rules against a gear setup.
 * Returns exactly 3 RuleResults in order: boot-to-binding-size, boot-to-board-waist, binding-disc-to-mount.
 *
 * @param setup - The board+binding+boot combination to evaluate.
 * @param _rider - Rider profile (the hard rules read boot size from setup.boot, not rider directly).
 */
export function runRules(setup: GearSetup, _rider: RiderProfile): RuleResult[] {
  return [
    bootToBindingSize(setup),
    bootToBoardWaist(setup),
    discToMount(setup),
  ];
}

/**
 * Full compatibility evaluation for a complete setup: the 3 hard rules PLUS the
 * riding-style-aware flex advisory. This is the rider-consuming entry point the UI
 * should use — the flex advisory is the rule that actually reads rider.ridingStyle,
 * so it was previously dead (flexAdvisory was never called anywhere — A6/B23).
 *
 * @returns 4 RuleResults: the 3 hard verdicts followed by the flex advisory (advisory:true).
 */
export function evaluateCompatibility(
  setup: GearSetup,
  rider: RiderProfile,
): RuleResult[] {
  return [...runRules(setup, rider), flexAdvisory(setup, rider)];
}
