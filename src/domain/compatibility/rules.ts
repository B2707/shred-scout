/**
 * Hard compatibility rule functions for the Shred Scout engine.
 *
 * All functions are pure — no I/O, no side effects, no throws.
 * Every code path returns a typed RuleResult. Called by runRules() in engine.ts.
 *
 * Rule thresholds (locked decisions from CONTEXT.md):
 *   boot-to-binding-size: warn within 0.25 US size of either edge (strict <, not <=)
 *   boot-to-board-waist:  warn if waistWidthMm < bootLengthMm - 15; fail if < bootLengthMm - 25
 *   binding-disc-to-mount: fail when exactly one side is 'channel' (XOR)
 */
import type { GearSetup, RuleResult } from './types.js';

/**
 * Checks whether the rider's boot size fits within the resolved binding size range.
 *
 * Pass:  bootSize is >= (min + 0.25) AND <= (max - 0.25)  [fully within, not near edge]
 * Warn:  bootSize is within range but within 0.25 US size of either edge
 * Fail:  bootSize is outside [min, max] entirely
 *
 * Boundary at exactly 0.25 from edge = PASS (strict <, not <=).
 */
export function bootToBindingSize(setup: GearSetup): RuleResult {
  const { sizeUS } = setup.boot;
  const [min, max] = setup.binding.sizeRange;

  if (sizeUS < min || sizeUS > max) {
    return {
      ruleId: 'boot-to-binding-size',
      verdict: 'fail',
      reason: `Boot size US ${sizeUS} is outside binding range [${min}–${max} US]`,
    };
  }
  if (sizeUS - min < 0.25 || max - sizeUS < 0.25) {
    return {
      ruleId: 'boot-to-binding-size',
      verdict: 'warn',
      reason: `Boot size US ${sizeUS} is near the edge of binding range [${min}–${max} US] — borderline fit`,
    };
  }
  return {
    ruleId: 'boot-to-binding-size',
    verdict: 'pass',
    reason: `Boot size US ${sizeUS} fits comfortably within binding range [${min}–${max} US]`,
  };
}

/**
 * Checks whether the board's waist width provides adequate toe/heel clearance.
 *
 * Formula: bootLengthMm = sizeUS × 8.1 + 209  (conservative outer shell estimate)
 * Pass:  waistWidthMm >= bootLengthMm - 15
 * Warn:  waistWidthMm >= bootLengthMm - 25 AND < bootLengthMm - 15
 * Fail:  waistWidthMm < bootLengthMm - 25
 *
 * Boundary at exactly (bootLengthMm - 15) = PASS; at exactly (bootLengthMm - 25) = WARN.
 */
export function bootToBoardWaist(setup: GearSetup): RuleResult {
  const { sizeUS } = setup.boot;
  const { waistWidthMm } = setup.board;
  const bootLengthMm = sizeUS * 8.1 + 209;

  if (waistWidthMm < bootLengthMm - 25) {
    return {
      ruleId: 'boot-to-board-waist',
      verdict: 'fail',
      reason: `Board waist ${waistWidthMm}mm is too narrow for US ${sizeUS} boots (minimum ${Math.round(bootLengthMm - 25)}mm to avoid toe/heel drag)`,
    };
  }
  if (waistWidthMm < bootLengthMm - 15) {
    return {
      ruleId: 'boot-to-board-waist',
      verdict: 'warn',
      reason: `Board waist ${waistWidthMm}mm may cause heel/toe drag with US ${sizeUS} boots — consider a wider board`,
    };
  }
  return {
    ruleId: 'boot-to-board-waist',
    verdict: 'pass',
    reason: `Board waist ${waistWidthMm}mm provides adequate clearance for US ${sizeUS} boots`,
  };
}

/**
 * Checks whether the binding disc pattern is compatible with the board's mounting pattern.
 *
 * Fail: exactly one of board.mountingPattern or binding.discPattern is 'channel' (XOR).
 *       Channel boards require Burton EST/Re:Flex only; channel bindings have no screw disc.
 * Pass: both channel, or both non-channel (4x4+4x4, 4x4+2x4, 2x4+4x4, 2x4+2x4 all pass).
 * Note: no warn tier for disc mismatch — incompatibility is always a hard fail.
 */
export function discToMount(setup: GearSetup): RuleResult {
  const { mountingPattern } = setup.board;
  const { discPattern } = setup.binding;

  const isChannelBoard = mountingPattern === 'channel';
  const isChannelBinding = discPattern === 'channel';

  if (isChannelBoard !== isChannelBinding) {
    const detail = isChannelBoard
      ? `Channel board requires Burton EST/Re:Flex bindings — got ${discPattern} disc`
      : `${discPattern} binding disc cannot mount on a Channel board`;
    return { ruleId: 'binding-disc-to-mount', verdict: 'fail', reason: detail };
  }

  return {
    ruleId: 'binding-disc-to-mount',
    verdict: 'pass',
    reason: `${discPattern} binding disc is compatible with ${mountingPattern} board`,
  };
}
