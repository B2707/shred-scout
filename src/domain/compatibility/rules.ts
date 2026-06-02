/**
 * Hard compatibility rule functions for the Shred Scout engine.
 *
 * All functions are pure — no I/O, no side effects, no throws.
 * Every code path returns a typed RuleResult. Called by runRules() in engine.ts.
 *
 * Rule thresholds (locked decisions from CONTEXT.md):
 *   boot-to-binding-size: warn within 0.25 US size of either edge (strict <, not <=)
 *   boot-to-board-waist:  overhang per side = (bootSole − waist)/2; pass ≤20mm, warn ≤35mm,
 *                         fail >35mm; missing waist → 'unknown' advisory (B17/B18)
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

  if (
    !Number.isFinite(sizeUS) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return {
      ruleId: 'boot-to-binding-size',
      verdict: 'fail',
      reason: `Invalid numeric input — sizeUS=${sizeUS}, range=[${min}–${max}]`,
    };
  }

  if (sizeUS <= 0) {
    return {
      ruleId: 'boot-to-binding-size',
      verdict: 'fail',
      reason: `Boot size must be a positive number — got ${sizeUS}`,
    };
  }

  if (min >= max) {
    return {
      ruleId: 'boot-to-binding-size',
      verdict: 'fail',
      reason: `Binding size range is invalid ([${min}–${max}] US) — min must be less than max`,
    };
  }

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
 * Models overhang per side, since some overhang is normal (and desirable for leverage),
 * and binding angles reduce real-world drag — the old "waist must be within 15–25mm of
 * boot length" thresholds false-failed standard 250–258mm boards for size-10 riders (B17).
 *
 *   bootSoleMm    = sizeUS × 8.1 + 209   (outer-sole length estimate)
 *   overhangPerSide = (bootSoleMm − waistWidthMm) / 2
 *   Pass:  overhangPerSide ≤ 20mm
 *   Warn:  20mm < overhangPerSide ≤ 35mm
 *   Fail:  overhangPerSide > 35mm
 *
 * Missing / non-positive waist width returns an 'unknown' ADVISORY rather than a hard
 * fail (B18) — most Shopify boards expose no waist spec, and "unknown" must not read as
 * "incompatible".
 */
export function bootToBoardWaist(setup: GearSetup): RuleResult {
  const { sizeUS } = setup.boot;
  const { waistWidthMm } = setup.board;

  if (!Number.isFinite(sizeUS) || sizeUS <= 0) {
    return {
      ruleId: 'boot-to-board-waist',
      verdict: 'fail',
      reason: `Invalid boot size — sizeUS=${sizeUS}`,
    };
  }

  if (!Number.isFinite(waistWidthMm) || waistWidthMm <= 0) {
    return {
      ruleId: 'boot-to-board-waist',
      verdict: 'unknown',
      reason: `Board waist width unavailable — can't verify toe/heel clearance for US ${sizeUS} boots`,
      advisory: true,
    };
  }

  const bootSoleMm = sizeUS * 8.1 + 209;
  const overhangPerSide = (bootSoleMm - waistWidthMm) / 2;
  const overhangLabel = Math.round(Math.max(0, overhangPerSide));

  if (overhangPerSide > 35) {
    return {
      ruleId: 'boot-to-board-waist',
      verdict: 'fail',
      reason: `Board waist ${waistWidthMm}mm is too narrow for US ${sizeUS} boots (~${Math.round(overhangPerSide)}mm overhang per side — significant toe/heel drag)`,
    };
  }
  if (overhangPerSide > 20) {
    return {
      ruleId: 'boot-to-board-waist',
      verdict: 'warn',
      reason: `Board waist ${waistWidthMm}mm gives ~${Math.round(overhangPerSide)}mm overhang per side with US ${sizeUS} boots — a slightly wider board would reduce drag risk`,
    };
  }
  return {
    ruleId: 'boot-to-board-waist',
    verdict: 'pass',
    reason: `Board waist ${waistWidthMm}mm provides adequate clearance for US ${sizeUS} boots (~${overhangLabel}mm overhang per side)`,
  };
}

/**
 * Checks whether the binding disc pattern is compatible with the board's mounting pattern.
 *
 * Fail: exactly one of board.mountingPattern or binding.discPattern is 'channel' (XOR).
 *       Channel boards require Burton EST/Re:Flex only; channel bindings have no screw disc.
 * Pass: both channel, or both non-channel (4x4+4x4, 4x4+2x4, 2x4+4x4, 2x4+2x4 all pass).
 * Note: no warn tier for disc mismatch — incompatibility is always a hard fail.
 *
 * IMPORTANT: 'channel' here means Burton Channel (EST/Re:Flex) ONLY.
 * Non-Burton channel systems (Nitro 3D, Sparks track) must be mapped to '4x4'
 * during product ingestion (Phase 3) to avoid false-pass verdicts here.
 */
export function discToMount(setup: GearSetup): RuleResult {
  const { mountingPattern } = setup.board;
  const { discPattern } = setup.binding;

  const VALID_PATTERNS = new Set<string>(['4x4', '2x4', 'channel']);
  if (
    !mountingPattern ||
    !discPattern ||
    !VALID_PATTERNS.has(mountingPattern) ||
    !VALID_PATTERNS.has(discPattern)
  ) {
    return {
      ruleId: 'binding-disc-to-mount',
      verdict: 'fail',
      reason: `Unrecognized mounting pattern — mountingPattern=${String(mountingPattern)}, discPattern=${String(discPattern)}`,
    };
  }

  const isChannelBoard = mountingPattern === 'channel';
  const isChannelBinding = discPattern === 'channel';

  if (isChannelBoard !== isChannelBinding) {
    const detail = isChannelBoard
      ? `Channel board requires Burton EST/Re:Flex bindings — got ${discPattern} disc`
      : `channel binding disc (Burton EST/Re:Flex) cannot mount on a ${mountingPattern} board`;
    return { ruleId: 'binding-disc-to-mount', verdict: 'fail', reason: detail };
  }

  return {
    ruleId: 'binding-disc-to-mount',
    verdict: 'pass',
    reason: `${discPattern} binding disc is compatible with ${mountingPattern} board`,
  };
}
