/**
 * Domain types for the Shred Scout compatibility engine.
 *
 * GearSetup is the single input to all hard rules and the flexPairing advisory.
 * RuleResult is the single output type — used directly as badge data.
 * No runtime code lives here — types only.
 */

/**
 * Mounting pattern for boards and binding discs.
 *
 * IMPORTANT: 'channel' means Burton Channel (EST/Re:Flex) ONLY.
 * Non-Burton channel systems (Nitro 3D, Sparks track) are NOT cross-compatible
 * with Burton Channel boards/bindings and MUST be mapped to '4x4' or '2x4'
 * during product ingestion to prevent false-pass verdicts in discToMount().
 */
export type MountPattern = '4x4' | '2x4' | 'channel';

/** Compatibility verdict severity — 'unknown' is reserved for advisory-only results. */
export type Verdict = 'pass' | 'warn' | 'fail' | 'unknown';

/** Snowboard physical properties required by the compatibility rules. */
export interface Board {
  /** Waist width in millimeters — industry standard measurement location (narrowest point). */
  waistWidthMm: number;
  /** Board mounting pattern — determines which binding discs are compatible. */
  mountingPattern: MountPattern;
  /** Optional flex rating on a 1-10 scale. Used by flexPairing advisory only. */
  flexRating?: number;
}

/** Snowboard binding physical properties required by the compatibility rules. */
export interface Binding {
  /** Resolved boot size range this binding fits: [minUS, maxUS]. Already-resolved for the specific size variant. */
  sizeRange: [number, number];
  /** Binding disc mounting pattern — must be compatible with board.mountingPattern. */
  discPattern: MountPattern;
}

/** Snowboard boot physical properties required by the compatibility rules. */
export interface Boot {
  /** US boot size (e.g. 10.5). Source of truth for all size-based rules. */
  sizeUS: number;
}

/**
 * Complete gear setup — the single input object for all compatibility rules.
 * All three hard rules consume only the fields defined here.
 */
export interface GearSetup {
  board: Board;
  binding: Binding;
  boot: Boot;
}

/**
 * Result of a single compatibility rule evaluation.
 * ruleId is stable and human-readable — used as badge key.
 *
 * Hard vs advisory contract:
 *   - bootToBindingSize and discToMount return pass/warn/fail only (advisory absent).
 *   - bootToBoardWaist returns pass/warn/fail, plus an 'unknown' ADVISORY when the board's
 *     waist width is unavailable (most Shopify boards) — missing data must not read as fail.
 *   - flexPairing/flexAdvisory always sets advisory:true and may return pass/warn/unknown.
 *   - Badge rendering should check `result.advisory === true` to identify advisory results.
 *     Checking `!result.advisory` treats both explicit false AND undefined as "hard rule" — which
 *     is correct given the contract above, but relying on it implicitly is fragile.
 */
export interface RuleResult {
  /** Stable kebab-case rule identifier: 'boot-to-binding-size' | 'boot-to-board-waist' | 'binding-disc-to-mount' | 'flex-pairing' */
  ruleId: string;
  /** Verdict severity. Hard rules return pass/warn/fail only. flexPairing returns pass or unknown. */
  verdict: Verdict;
  /** Human-readable reason string — rendered directly as badge tooltip/label. */
  reason: string;
  /**
   * True only for flexPairing advisory — distinguishes soft recommendations from hard rules.
   * Absent (undefined) on all hard-rule results. Use `advisory === true` for strict checks.
   */
  advisory?: boolean;
}
