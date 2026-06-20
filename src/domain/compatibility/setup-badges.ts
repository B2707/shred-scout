/**
 * Pure, framework-free fit-badge logic for the setup builder.
 *
 * Extracted from the throwaway SetupBuilderPrototype so the per-candidate badge, the
 * compatible-first candidate sort, and the whole-setup tray verdict can be unit-tested
 * and reused without pulling in Ink/React. No I/O, no side effects.
 *
 * Severity (SEV) here is INTENTIONALLY inverted relative to rank.ts's verdictScore:
 *   - SEV (this module):       higher number = WORSE fit (fail is highest).
 *   - rank.ts verdictScore:    higher number = BETTER fit (pass is highest).
 * sortedCandidates uses both: rankProducts (quality, best-first) provides the base
 * order, then a STABLE re-sort by SEV pushes worse-fit candidates down so a great-fit
 * board is never buried beneath a high-quality-but-incompatible one.
 */
import { rankProducts } from '../../agent/rank.js';
import type { NormalizedProduct } from '../../data/normalizer.js';
import type { RiderProfile } from '../../types/profile.js';
import { parseBoardLengthsCm, recommendBoardLength } from './board-sizing.js';
import { evaluateCompatibility } from './engine.js';
import {
  bootFit,
  PLACEHOLDER_BINDING,
  PLACEHOLDER_BOARD,
  toBinding,
  toBoard,
  toBoot,
} from './product-adapter.js';
import { bootToBindingSize, bootToBoardWaist, discToMount } from './rules.js';
import type { RuleResult, Verdict } from './types.js';

export type Cat = 'board' | 'binding' | 'boot';

export const SEV: Record<Verdict, number> = {
  pass: 0,
  unknown: 1,
  warn: 2,
  fail: 3,
};
export const SYM: Record<Verdict, string> = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
  unknown: '·',
};
export const COLOR: Record<Verdict, string> = {
  pass: 'green',
  warn: 'yellow',
  fail: 'red',
  unknown: 'gray',
};
export const worst = (vs: Verdict[]): Verdict =>
  vs.reduce((a, b) => (SEV[b] > SEV[a] ? b : a), 'pass');

export interface Badge {
  verdict: Verdict;
  text: string;
}
export type Setup = Partial<Record<Cat, NormalizedProduct>>;

/**
 * Fallback board text when no length/waist detail accrued, chosen to match the
 * computed verdict so an 'unknown' fit never renders the reassuring "sized for you".
 */
function boardFallbackText(verdict: Verdict): string {
  if (verdict === 'unknown') return 'fit unverified - no size data';
  return 'sized for you';
}

/** The real, live per-candidate badge for the active category given what's already chosen. */
export function badgeFor(
  cat: Cat,
  c: NormalizedProduct,
  setup: Setup,
  rider: RiderProfile,
): Badge {
  const boot = toBoot(rider.bootSize);
  if (cat === 'board') {
    const waist = bootToBoardWaist({
      board: toBoard(c),
      binding: PLACEHOLDER_BINDING,
      boot,
    });
    const lens = parseBoardLengthsCm(c.variants_json);
    const rec = recommendBoardLength(rider);
    const parts: string[] = [];
    let lenV: Verdict = 'unknown';
    if (lens.length) {
      const closest = lens.reduce((a, b) =>
        Math.abs(b - rec.ideal) < Math.abs(a - rec.ideal) ? b : a,
      );
      const off = closest - rec.ideal;
      if (Math.abs(off) <= 3) {
        parts.push(`~your length ${closest}cm`);
        lenV = 'pass';
      } else {
        parts.push(`${closest}cm - a bit ${off < 0 ? 'short' : 'long'}`);
        lenV = 'warn';
      }
    }
    if (waist.verdict === 'warn' || waist.verdict === 'fail')
      parts.push(waist.reason);
    // Pass 'unknown' through (not coerced to 'pass') so a board with an
    // unverifiable waist reads as gray "unverified", never a false green.
    const waistV =
      waist.verdict === 'warn' ||
      waist.verdict === 'fail' ||
      waist.verdict === 'unknown'
        ? waist.verdict
        : 'pass';
    // Cross-check a pinned binding's disc/mount against this board so a
    // disc/mount mismatch surfaces regardless of selection order.
    const verdicts: Verdict[] = [lenV, waistV];
    if (setup.binding) {
      const mount = discToMount({
        board: toBoard(c),
        binding: toBinding(setup.binding),
        boot,
      });
      if (mount.verdict === 'warn' || mount.verdict === 'fail')
        parts.push(mount.reason);
      verdicts.push(mount.verdict);
    }
    const verdict = worst(verdicts);
    return {
      verdict,
      text: parts.join(' · ') || boardFallbackText(verdict),
    };
  }
  if (cat === 'binding') {
    const size = bootToBindingSize({
      board: PLACEHOLDER_BOARD,
      binding: toBinding(c),
      boot,
    });
    const parts: string[] = [
      size.verdict === 'pass' ? `holds your US ${rider.bootSize}` : size.reason,
    ];
    let v: Verdict = size.verdict;
    if (setup.board) {
      const mount = discToMount({
        board: toBoard(setup.board),
        binding: toBinding(c),
        boot,
      });
      parts.unshift(
        mount.verdict === 'pass' ? 'fits your board' : mount.reason,
      );
      v = worst([v, mount.verdict]);
    }
    return { verdict: v, text: parts.join(' · ') };
  }
  const fit = bootFit(c, rider.bootSize);
  return { verdict: fit.verdict, text: fit.reason };
}

/** Sort the active list compatible-first, keeping the rider-fit rank within each tier. */
export function sortedCandidates(
  cat: Cat,
  all: NormalizedProduct[],
  setup: Setup,
  rider: RiderProfile,
): NormalizedProduct[] {
  const ranked = rankProducts(all, rider);
  return ranked
    .map((p, i) => ({ p, i, sev: SEV[badgeFor(cat, p, setup, rider).verdict] }))
    .sort((a, b) => a.sev - b.sev || a.i - b.i)
    .map((e) => e.p);
}

/** A candidate paired with its computed fit badge. */
export interface AnnotatedCandidate {
  product: NormalizedProduct;
  badge: Badge;
}

/**
 * Additive helper: returns the compatible-first candidate list with each product's
 * badge computed in a SINGLE badgeFor pass, so a caller can derive both the sorted
 * list and the compatible-count without re-invoking badgeFor per candidate.
 * Mirrors sortedCandidates' ordering (rank quality, then stable severity re-sort).
 */
export function annotateCandidates(
  cat: Cat,
  all: NormalizedProduct[],
  setup: Setup,
  rider: RiderProfile,
): AnnotatedCandidate[] {
  const ranked = rankProducts(all, rider);
  return ranked
    .map((p, i) => {
      const badge = badgeFor(cat, p, setup, rider);
      return { product: p, badge, i, sev: SEV[badge.verdict] };
    })
    .sort((a, b) => a.sev - b.sev || a.i - b.i)
    .map(({ product, badge }) => ({ product, badge }));
}

export function trayVerdict(setup: Setup, rider: RiderProfile): Badge | null {
  if (!setup.board || !setup.binding || !setup.boot) return null;
  const results: RuleResult[] = evaluateCompatibility(
    {
      board: toBoard(setup.board),
      binding: toBinding(setup.binding),
      boot: toBoot(rider.bootSize),
    },
    rider,
  );
  const v = worst(results.map((r) => r.verdict));
  const firstIssue = results.find(
    (r) => r.verdict === 'warn' || r.verdict === 'fail',
  );
  return {
    verdict: v,
    text: firstIssue ? firstIssue.reason : 'everything fits - ready to ride',
  };
}
