import { describe, expect, it } from 'vitest';
import { rankProducts } from '../src/agent/rank.js';
import type { NormalizedProduct } from '../src/data/normalizer.js';
import { evaluateCompatibility } from '../src/domain/compatibility/engine.js';
import {
  productFit,
  toBinding,
  toBoard,
  toBoot,
} from '../src/domain/compatibility/product-adapter.js';
import {
  annotateCandidates,
  badgeFor,
  SEV,
  type Setup,
  sortedCandidates,
  trayVerdict,
  worst,
} from '../src/domain/compatibility/setup-badges.js';
import type { Verdict } from '../src/domain/compatibility/types.js';
import type { RiderProfile } from '../src/types/profile.js';

const rider: RiderProfile = {
  bootSize: 10,
  heightCm: 178,
  weightKg: 75, // ideal board length ~157
  ridingStyle: 'all-mountain',
  skillLevel: 'intermediate',
};

let id = 0;
function product(
  partial: Partial<NormalizedProduct> & {
    gear_category: NormalizedProduct['gear_category'];
    sizes?: string[];
  },
): NormalizedProduct {
  id += 1;
  const { sizes, ...rest } = partial;
  return {
    shopify_id: String(id),
    retailer: 'evo',
    title: 'Test Product',
    handle: `p${id}`,
    vendor: 'Test',
    product_type: 'Snowboard',
    waist_width_mm: null,
    mount_pattern: '4x4',
    mount_pattern_raw: '4x4',
    image_url: null,
    flex_rating: null,
    price_cents: 50000,
    variants_json: JSON.stringify((sizes ?? []).map((o) => ({ option1: o }))),
    fetched_at: 0,
    ...rest,
  } as NormalizedProduct;
}

describe('badgeFor', () => {
  it('returns the expected verdict shape for board, binding, and boot', () => {
    const board = product({
      gear_category: 'board',
      sizes: ['157'], // ~ideal length for this rider
      waist_width_mm: 255,
      title: 'Board',
    });
    const binding = product({
      gear_category: 'binding',
      sizes: ['8', '12'], // comfortably holds US 10
      title: 'Binding',
    });
    const boot = product({
      gear_category: 'boot',
      sizes: ['10', '11'],
      title: 'Boot',
    });

    for (const [cat, p] of [
      ['board', board],
      ['binding', binding],
      ['boot', boot],
    ] as const) {
      const badge = badgeFor(cat, p, {}, rider);
      expect(typeof badge.text).toBe('string');
      expect(['pass', 'warn', 'fail', 'unknown']).toContain(badge.verdict);
    }

    expect(badgeFor('board', board, {}, rider).verdict).toBe('pass');
    expect(badgeFor('binding', binding, {}, rider).verdict).toBe('pass');
    expect(badgeFor('boot', boot, {}, rider).verdict).toBe('pass');
  });

  it('USES discToMount: a channel board + 4x4 binding in setup yields fail, which single-product productFit would miss', () => {
    // Channel board (Burton EST/Re:Flex). The binding is a plain 4x4 disc that
    // comfortably holds the rider's boot, so the ONLY incompatibility is the
    // channel-XOR mount mismatch surfaced by discToMount against the chosen board.
    const channelBoard = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 255,
      mount_pattern: 'channel',
      mount_pattern_raw: 'channel',
      title: 'Channel Board',
    });
    const fourByFourBinding = product({
      gear_category: 'binding',
      sizes: ['8', '12'], // holds US 10 comfortably -> size verdict passes
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      title: '4x4 Binding',
    });

    const setup: Setup = { board: channelBoard };
    const badge = badgeFor('binding', fourByFourBinding, setup, rider);

    // discToMount folds in -> the binding is NOT a clean pass.
    expect(['fail', 'warn']).toContain(badge.verdict);
    expect(badge.verdict).toBe('fail');

    // Sanity: single-product productFit (PLACEHOLDER_BOARD = 4x4) cannot see the
    // mismatch, so it would surface this binding as a clean pass.
    const single = productFit(fourByFourBinding, rider);
    expect(single?.verdict).toBe('pass');
  });

  it('waist-missing board reads as neutral unknown, not warn', () => {
    // No waist width and no parseable board lengths: the waist rule returns an
    // 'unknown' advisory and the length signal is unknown -> neutral overall.
    const board = product({
      gear_category: 'board',
      sizes: [], // no lengths -> lenV stays unknown
      waist_width_mm: null, // no waist -> bootToBoardWaist returns 'unknown'
      title: 'No Specs Board',
    });
    const badge = badgeFor('board', board, {}, rider);
    expect(badge.verdict).toBe('unknown');
    expect(badge.verdict).not.toBe('warn');
    // 'unknown' is strictly less severe than 'warn'.
    expect(SEV.unknown).toBeLessThan(SEV.warn);
  });

  it('a parseable length (pass) with no waist data stays unknown, not silently passed', () => {
    // Length is a clean pass (157 ~ ideal), but waist is null -> bootToBoardWaist
    // returns 'unknown'. The board branch must surface that 'unknown' (not coerce
    // it to 'pass'), so the overall verdict is the more-severe 'unknown', never a
    // false green that hides an unverified waist.
    const board = product({
      gear_category: 'board',
      sizes: ['157'], // pass-length
      waist_width_mm: null, // no waist -> waist verdict 'unknown'
      title: 'Length-Pass Waist-Unknown',
    });
    const badge = badgeFor('board', board, {}, rider);
    expect(badge.verdict).toBe('unknown');
    expect(badge.verdict).not.toBe('pass');
  });

  it('order-independent: a 4x4 binding pinned + a channel BOARD candidate surfaces the mount mismatch', () => {
    // Mirror of the binding-branch cross-check, but with the binding pinned in the
    // setup while browsing BOARDS. A channel board against a pinned 4x4 binding must
    // surface the disc/mount mismatch regardless of selection order.
    const fourByFourBinding = product({
      gear_category: 'binding',
      sizes: ['8', '12'], // holds US 10 comfortably
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      title: '4x4 Binding',
    });
    const channelBoard = product({
      gear_category: 'board',
      sizes: ['157'], // pass-length
      waist_width_mm: 255, // adequate waist -> not the source of the issue
      mount_pattern: 'channel',
      mount_pattern_raw: 'channel',
      title: 'Channel Board',
    });

    const setup: Setup = { binding: fourByFourBinding };
    const badge = badgeFor('board', channelBoard, setup, rider);
    expect(['fail', 'warn']).toContain(badge.verdict);
    expect(badge.verdict).toBe('fail');

    // Without the pinned binding the same board reads clean -> proves the cross-check
    // is what surfaces the mismatch.
    expect(badgeFor('board', channelBoard, {}, rider).verdict).toBe('pass');
  });

  it('board-length warn branch: a length >3cm off ideal reads warn with a "bit short"/"bit long" hint', () => {
    // Rider ideal ~157. A 148cm board is >3cm shorter -> warn + "a bit short".
    const shortBoard = product({
      gear_category: 'board',
      sizes: ['148'],
      waist_width_mm: 255, // adequate -> length drives the verdict
      title: 'Too-Short Board',
    });
    const shortBadge = badgeFor('board', shortBoard, {}, rider);
    expect(shortBadge.verdict).toBe('warn');
    expect(shortBadge.text).toContain('a bit short');

    // A 168cm board is >3cm longer -> warn + "a bit long".
    const longBoard = product({
      gear_category: 'board',
      sizes: ['168'],
      waist_width_mm: 255,
      title: 'Too-Long Board',
    });
    const longBadge = badgeFor('board', longBoard, {}, rider);
    expect(longBadge.verdict).toBe('warn');
    expect(longBadge.text).toContain('a bit long');
  });

  it('a 4x4 board in setup + a 4x4 binding candidate is a clean pass with "fits your board"', () => {
    const fourByFourBoard = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 255,
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      title: '4x4 Board',
    });
    const fourByFourBinding = product({
      gear_category: 'binding',
      sizes: ['8', '12'], // holds US 10 comfortably
      mount_pattern: '4x4',
      mount_pattern_raw: '4x4',
      title: '4x4 Binding',
    });

    const setup: Setup = { board: fourByFourBoard };
    const badge = badgeFor('binding', fourByFourBinding, setup, rider);
    expect(badge.verdict).toBe('pass');
    expect(badge.text).toContain('fits your board');
  });

  it('an unknown-verdict board does NOT render the reassuring "sized for you" fallback', () => {
    const board = product({
      gear_category: 'board',
      sizes: [], // no lengths
      waist_width_mm: null, // no waist -> overall verdict 'unknown'
      title: 'No Specs Board',
    });
    const badge = badgeFor('board', board, {}, rider);
    expect(badge.verdict).toBe('unknown');
    expect(badge.text).not.toBe('sized for you');
    expect(badge.text).not.toContain('sized for you');
  });
});

describe('annotateCandidates', () => {
  it('returns each candidate with its badge in one pass, matching sortedCandidates order', () => {
    const incompatible = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 200, // narrow -> waist fail
      title: 'Narrow-Incompatible',
    });
    const compatible = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 260,
      title: 'Clean-Fit',
    });

    const annotated = annotateCandidates(
      'board',
      [incompatible, compatible],
      {},
      rider,
    );
    // Same compatible-first ordering as sortedCandidates.
    expect(annotated.map((a) => a.product.title)).toEqual(
      sortedCandidates('board', [incompatible, compatible], {}, rider).map(
        (p) => p.title,
      ),
    );
    // Badges are computed and match a direct badgeFor call.
    for (const { product: p, badge } of annotated) {
      expect(badge.verdict).toBe(badgeFor('board', p, {}, rider).verdict);
    }
    // Compatible-count derivable from the same pass (no re-invocation needed).
    const compatCount = annotated.filter(
      (a) => a.badge.verdict !== 'fail',
    ).length;
    expect(compatCount).toBe(1);
  });
});

describe('trayVerdict', () => {
  it('returns null until board, binding, and boot are all chosen (partial setup)', () => {
    expect(trayVerdict({}, rider)).toBeNull();
    const board = product({ gear_category: 'board', sizes: ['157'] });
    expect(trayVerdict({ board }, rider)).toBeNull();
    const binding = product({ gear_category: 'binding', sizes: ['8', '12'] });
    expect(trayVerdict({ board, binding }, rider)).toBeNull();
  });

  it('folds the flex advisory into worst() for a complete setup (4 rule results incl. flex)', () => {
    const board = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 255,
      flex_rating: '2/10', // soft flex -> outside all-mountain range -> flex warn
      title: 'Soft Board',
    });
    const binding = product({
      gear_category: 'binding',
      sizes: ['8', '12'],
      title: 'Binding',
    });
    const boot = product({ gear_category: 'boot', sizes: ['10'] });
    const setup: Setup = { board, binding, boot };

    // evaluateCompatibility returns the 3 hard rules + the flex advisory = 4 results.
    const results = evaluateCompatibility(
      {
        board: toBoard(board),
        binding: toBinding(binding),
        boot: toBoot(rider.bootSize),
      },
      rider,
    );
    expect(results).toHaveLength(4);
    expect(results[3].ruleId).toBe('flex-pairing');
    expect(results[3].advisory).toBe(true);
    expect(results[3].verdict).toBe('warn'); // soft flex is wrong for all-mountain

    const tray = trayVerdict(setup, rider);
    expect(tray).not.toBeNull();
    // The flex advisory's warn drives the folded worst() verdict.
    expect(tray?.verdict).toBe(worst(results.map((r) => r.verdict)));
    expect(tray?.verdict).toBe('warn');
  });
});

describe('sortedCandidates', () => {
  it('returns ranked-then-severity order: a great-fit board outranks a high-quality but incompatible one', () => {
    // A narrow-waist board that fails the boot-to-board-waist rule for this rider,
    // yet has a near-ideal length (high rank quality).
    const incompatible = product({
      gear_category: 'board',
      sizes: ['157'], // near ideal -> ranks high on quality
      waist_width_mm: 200, // very narrow -> waist fail for US 10 boots
      title: 'Narrow-Incompatible',
    });
    // A clean-fit board: near-ideal length AND adequate waist.
    const compatible = product({
      gear_category: 'board',
      sizes: ['157'],
      waist_width_mm: 260,
      title: 'Clean-Fit',
    });

    // Confirm the incompatible board genuinely fails its fit badge.
    expect(badgeFor('board', incompatible, {}, rider).verdict).toBe('fail');
    expect(badgeFor('board', compatible, {}, rider).verdict).toBe('pass');

    const sorted = sortedCandidates(
      'board',
      [incompatible, compatible],
      {},
      rider,
    );
    // Severity re-sort pushes the worst-fit board down even though both rank well.
    expect(sorted[0].title).toBe('Clean-Fit');
    expect(sorted[1].title).toBe('Narrow-Incompatible');
  });

  it('is stable within a severity tier: equal-fit candidates keep their ranked order', () => {
    const a = product({ gear_category: 'boot', sizes: ['10'], title: 'A' });
    const b = product({ gear_category: 'boot', sizes: ['10'], title: 'B' });
    const c = product({ gear_category: 'boot', sizes: ['10'], title: 'C' });
    const sorted = sortedCandidates('boot', [a, b, c], {}, rider);
    expect(sorted.map((p) => p.title)).toEqual(['A', 'B', 'C']);
  });

  it('runs without crashing on a partial setup (PLACEHOLDER_* stand-ins)', () => {
    const binding = product({
      gear_category: 'binding',
      sizes: ['8', '12'],
      title: 'B1',
    });
    // No board chosen -> badgeFor('binding', ...) must NOT touch setup.board and
    // bootToBindingSize uses the placeholder board internally.
    expect(() =>
      sortedCandidates('binding', [binding], {}, rider),
    ).not.toThrow();
    const badge = badgeFor('binding', binding, {}, rider);
    expect(['pass', 'warn', 'fail', 'unknown']).toContain(badge.verdict);
  });
});

describe('SEV vs rank.ts verdictScore sort in opposite directions', () => {
  it('SEV (severity, higher = worse) is the inverse ordering of quality (higher = better)', () => {
    // Severity ordering (worst-first when sorted descending by SEV).
    const order: Verdict[] = ['pass', 'unknown', 'warn', 'fail'];
    const bySeverityDesc = [...order].sort((a, b) => SEV[b] - SEV[a]);
    expect(bySeverityDesc).toEqual(['fail', 'warn', 'unknown', 'pass']);

    // rankProducts encodes quality: a pass-fit product must rank ABOVE a fail-fit one,
    // which is the exact opposite of SEV's worst-first severity ordering.
    const passBoot = product({
      gear_category: 'boot',
      sizes: ['10'],
      title: 'Pass',
    }); // offered in US 10 -> pass
    const failBoot = product({
      gear_category: 'boot',
      sizes: ['7'],
      title: 'Warn',
    }); // not offered -> warn (lower quality)
    const ranked = rankProducts([failBoot, passBoot], rider);
    // Quality: better fit first.
    expect(ranked[0].title).toBe('Pass');
    // Severity: worse fit (higher SEV) would be first if we sorted by SEV descending.
    const passSev = SEV[badgeFor('boot', passBoot, {}, rider).verdict];
    const failSev = SEV[badgeFor('boot', failBoot, {}, rider).verdict];
    expect(failSev).toBeGreaterThan(passSev);
  });
});
