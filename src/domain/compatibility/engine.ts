/**
 * Compatibility engine entry point for Shred Scout.
 *
 * runRules() calls all three hard rule functions synchronously and returns their
 * combined results as a RuleResult[]. No I/O, no external state.
 * The async flexPairing advisory is NOT called here — it is a separate call.
 */
import { bootToBindingSize, bootToBoardWaist, discToMount } from './rules.js';
import type { GearSetup, RuleResult } from './types.js';
import type { RiderProfile } from '../../types/profile.js';

/**
 * Runs all three hard compatibility rules against a gear setup.
 * Returns exactly 3 RuleResults in order: boot-to-binding-size, boot-to-board-waist, binding-disc-to-mount.
 *
 * @param setup - The board+binding+boot combination to evaluate.
 * @param _rider - Rider profile (reserved for future rule extensions — not consumed by current rules).
 */
export function runRules(setup: GearSetup, _rider: RiderProfile): RuleResult[] {
  return [
    bootToBindingSize(setup),
    bootToBoardWaist(setup),
    discToMount(setup),
  ];
}
