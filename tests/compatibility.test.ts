import { describe, it, expect, vi, afterEach } from 'vitest';
import type { GearSetup } from '../src/domain/compatibility/types.js';
import type { RiderProfile } from '../src/types/profile.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Wide board (310mm waist) that always passes the waist width rule for US 10 boots. */
function makeSetup(overrides: {
  waistWidthMm?: number;
  mountingPattern?: GearSetup['board']['mountingPattern'];
  flexRating?: number;
  sizeRange?: [number, number];
  discPattern?: GearSetup['binding']['discPattern'];
  sizeUS?: number;
}): GearSetup {
  return {
    board: {
      waistWidthMm: overrides.waistWidthMm ?? 310,
      mountingPattern: overrides.mountingPattern ?? '4x4',
      flexRating: overrides.flexRating,
    },
    binding: {
      sizeRange: overrides.sizeRange ?? [7, 10],
      discPattern: overrides.discPattern ?? '4x4',
    },
    boot: { sizeUS: overrides.sizeUS ?? 8.5 },
  };
}

const BASE_RIDER: RiderProfile = {
  bootSize: 10,
  heightCm: 178,
  weightKg: 75,
  ridingStyle: 'all-mountain',
};

// ─── bootToBindingSize() ─────────────────────────────────────────────────────

describe('bootToBindingSize()', () => {
  // ── Clear pass (5 tests) ──────────────────────────────────────────────────

  it('returns pass for mid-range boot US 8.5 on [7,10]', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 8.5 }));
    expect(result.verdict).toBe('pass');
  });

  it('returns pass for mid-range boot US 9.5 on [8,11]', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8, 11], sizeUS: 9.5 }));
    expect(result.verdict).toBe('pass');
  });

  it('returns pass for Burton S range [6,8]: sizeUS=7.25', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [6, 8], sizeUS: 7.25 }));
    expect(result.verdict).toBe('pass');
  });

  it('returns pass for Union S range [5.5,7.5]: sizeUS=6.5', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [5.5, 7.5], sizeUS: 6.5 }));
    expect(result.verdict).toBe('pass');
  });

  it('returns pass for Flow L range [8.5,10.5]: sizeUS=9.5', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8.5, 10.5], sizeUS: 9.5 }));
    expect(result.verdict).toBe('pass');
  });

  // ── Warn zone (10 tests) ─────────────────────────────────────────────────

  it('returns warn for sizeUS=7.0 (exactly at min of [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 7.0 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=7.24 (within 0.25 of min of [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 7.24 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=9.76 (within 0.25 of max of [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 9.76 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=10.0 (exactly at max of [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 10.0 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=8.0 (exactly at min of [8,11])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8, 11], sizeUS: 8.0 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=10.76 (within 0.25 of max of [8,11])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8, 11], sizeUS: 10.76 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=11.0 (exactly at max of [8,11])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8, 11], sizeUS: 11.0 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=6.0 (exactly at min of [6,8])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [6, 8], sizeUS: 6.0 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=7.76 (within 0.25 of max of [6,8])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [6, 8], sizeUS: 7.76 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns warn for sizeUS=8.0 (exactly at max of [6,8])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [6, 8], sizeUS: 8.0 }));
    expect(result.verdict).toBe('warn');
  });

  // ── Fail zone (6 tests) ──────────────────────────────────────────────────

  it('returns fail for sizeUS=6.99 (just below min of [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 6.99 }));
    expect(result.verdict).toBe('fail');
  });

  it('returns fail for sizeUS=10.01 (just above max of [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 10.01 }));
    expect(result.verdict).toBe('fail');
  });

  it('returns fail for sizeUS=6.5 (well below [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 6.5 }));
    expect(result.verdict).toBe('fail');
  });

  it('returns fail for sizeUS=11.0 (well above [7,10])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 11.0 }));
    expect(result.verdict).toBe('fail');
  });

  it('returns fail for sizeUS=4.0 (way below [8,11])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8, 11], sizeUS: 4.0 }));
    expect(result.verdict).toBe('fail');
  });

  it('returns fail for sizeUS=14.0 (way above [6,8])', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [6, 8], sizeUS: 14.0 }));
    expect(result.verdict).toBe('fail');
  });

  // ── Boundary edge cases (6 tests) ────────────────────────────────────────

  it('returns pass for sizeUS=7.25 on [7,10] — exactly 0.25 from min (strict <, not <=)', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 7.25 }));
    expect(result.verdict).toBe('pass');
  });

  it('returns warn for sizeUS=7.24 on [7,10] — inside 0.25 of min edge', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 7.24 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns pass for sizeUS=9.75 on [7,10] — exactly 0.25 from max (strict <, not <=)', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 9.75 }));
    expect(result.verdict).toBe('pass');
  });

  it('returns warn for sizeUS=9.76 on [7,10] — inside 0.25 of max edge', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [7, 10], sizeUS: 9.76 }));
    expect(result.verdict).toBe('warn');
  });

  it('returns pass for sizeUS=8.25 on [8,11] — exactly 0.25 from min', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8, 11], sizeUS: 8.25 }));
    expect(result.verdict).toBe('pass');
  });

  it('returns pass for sizeUS=10.75 on [8,11] — exactly 0.25 from max (strict <)', async () => {
    const { bootToBindingSize } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBindingSize(makeSetup({ sizeRange: [8, 11], sizeUS: 10.75 }));
    expect(result.verdict).toBe('pass');
  });
});

// ─── bootToBoardWaist() ──────────────────────────────────────────────────────
// US10 boot: bootLengthMm = 10*8.1+209 = 290, warn threshold = 275, fail threshold = 265
// US9 boot:  bootLengthMm = 9*8.1+209 = 281.9, warn threshold ≈ 266.9, fail threshold ≈ 256.9
// US7 boot:  bootLengthMm = 7*8.1+209 = 265.7, warn threshold ≈ 250.7, fail threshold ≈ 240.7

describe('bootToBoardWaist()', () => {
  // ── US10 boot tests ──────────────────────────────────────────────────────

  it('US10: waist=300 returns pass (well above threshold)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 300, sizeUS: 10 }));
    expect(result.verdict).toBe('pass');
  });

  it('US10: waist=276 returns pass (1mm above warn threshold of 275)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 276, sizeUS: 10 }));
    expect(result.verdict).toBe('pass');
  });

  it('US10: waist=275 returns pass (exactly at bootLengthMm-15 boundary — strict <, PASS)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 275, sizeUS: 10 }));
    expect(result.verdict).toBe('pass');
  });

  it('US10: waist=274 returns warn (1mm below warn threshold)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 274, sizeUS: 10 }));
    expect(result.verdict).toBe('warn');
  });

  it('US10: waist=266 returns warn (mid-warn zone)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 266, sizeUS: 10 }));
    expect(result.verdict).toBe('warn');
  });

  it('US10: waist=265 returns warn (exactly at bootLengthMm-25 boundary — strict <, WARN)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 265, sizeUS: 10 }));
    expect(result.verdict).toBe('warn');
  });

  it('US10: waist=264 returns fail (1mm below fail threshold)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 264, sizeUS: 10 }));
    expect(result.verdict).toBe('fail');
  });

  it('US10: waist=250 returns fail (typical narrow board)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 250, sizeUS: 10 }));
    expect(result.verdict).toBe('fail');
  });

  // ── US9 boot tests ───────────────────────────────────────────────────────

  it('US9: waist=295 returns pass (wide board)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 295, sizeUS: 9 }));
    expect(result.verdict).toBe('pass');
  });

  it('US9: waist=263 returns warn (in warn zone, bootLengthMm=281.9, warn threshold=266.9, fail threshold=256.9)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 263, sizeUS: 9 }));
    expect(result.verdict).toBe('warn');
  });

  it('US9: waist=255 returns fail (narrow board)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 255, sizeUS: 9 }));
    expect(result.verdict).toBe('fail');
  });

  // ── US7 boot tests ───────────────────────────────────────────────────────

  it('US7: waist=280 returns pass (wide board passes for small boot)', async () => {
    const { bootToBoardWaist } = await import('../src/domain/compatibility/rules.js');
    const result = bootToBoardWaist(makeSetup({ waistWidthMm: 280, sizeUS: 7 }));
    expect(result.verdict).toBe('pass');
  });
});

// ─── discToMount() ───────────────────────────────────────────────────────────

describe('discToMount()', () => {
  it('4x4 board + 4x4 binding → pass', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: '4x4', discPattern: '4x4' }));
    expect(result.verdict).toBe('pass');
  });

  it('4x4 board + 2x4 binding → pass', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: '4x4', discPattern: '2x4' }));
    expect(result.verdict).toBe('pass');
  });

  it('2x4 board + 4x4 binding → pass', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: '2x4', discPattern: '4x4' }));
    expect(result.verdict).toBe('pass');
  });

  it('2x4 board + 2x4 binding → pass', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: '2x4', discPattern: '2x4' }));
    expect(result.verdict).toBe('pass');
  });

  it('channel board + channel binding → pass (both channel)', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: 'channel', discPattern: 'channel' }));
    expect(result.verdict).toBe('pass');
  });

  it('channel board + 4x4 binding → fail (channel requires Burton EST/Re:Flex)', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: 'channel', discPattern: '4x4' }));
    expect(result.verdict).toBe('fail');
  });

  it('channel board + 2x4 binding → fail (channel requires Burton EST/Re:Flex)', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: 'channel', discPattern: '2x4' }));
    expect(result.verdict).toBe('fail');
  });

  it('4x4 board + channel binding → fail (EST disc cannot mount on 4-screw board)', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: '4x4', discPattern: 'channel' }));
    expect(result.verdict).toBe('fail');
  });

  it('2x4 board + channel binding → fail (EST disc cannot mount on 2x4 board)', async () => {
    const { discToMount } = await import('../src/domain/compatibility/rules.js');
    const result = discToMount(makeSetup({ mountingPattern: '2x4', discPattern: 'channel' }));
    expect(result.verdict).toBe('fail');
  });
});

// ─── runRules() ──────────────────────────────────────────────────────────────

describe('runRules()', () => {
  it('returns array of exactly 3 results', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    const results = runRules(makeSetup({}), BASE_RIDER);
    expect(results).toHaveLength(3);
  });

  it('first result has ruleId boot-to-binding-size', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    const results = runRules(makeSetup({}), BASE_RIDER);
    expect(results[0]?.ruleId).toBe('boot-to-binding-size');
  });

  it('second result has ruleId boot-to-board-waist', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    const results = runRules(makeSetup({}), BASE_RIDER);
    expect(results[1]?.ruleId).toBe('boot-to-board-waist');
  });

  it('third result has ruleId binding-disc-to-mount', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    const results = runRules(makeSetup({}), BASE_RIDER);
    expect(results[2]?.ruleId).toBe('binding-disc-to-mount');
  });

  it('all-pass setup returns 3 pass verdicts', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    // sizeUS=8.5 on [7,10] = pass; waist=310 with US8.5 = pass; 4x4+4x4 = pass
    const results = runRules(makeSetup({ sizeUS: 8.5, sizeRange: [7, 10], waistWidthMm: 310, mountingPattern: '4x4', discPattern: '4x4' }), BASE_RIDER);
    expect(results[0]?.verdict).toBe('pass');
    expect(results[1]?.verdict).toBe('pass');
    expect(results[2]?.verdict).toBe('pass');
  });

  it('mixed verdict setup returns expected verdicts', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    // sizeUS=8.5 on [7,10] = pass; waist=250 with US8.5 (bootLengthMm=277.85, fail<252.85) = fail; channel+4x4 = fail
    const results = runRules(makeSetup({ sizeUS: 8.5, sizeRange: [7, 10], waistWidthMm: 250, mountingPattern: 'channel', discPattern: '4x4' }), BASE_RIDER);
    expect(results[0]?.verdict).toBe('pass');
    expect(results[1]?.verdict).toBe('fail');
    expect(results[2]?.verdict).toBe('fail');
  });

  it('each RuleResult.reason is a non-empty string (COMP-03: reason for badge rendering)', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    const results = runRules(makeSetup({}), BASE_RIDER);
    for (const r of results) {
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('each RuleResult.ruleId is a non-empty string (COMP-03: stable ruleId for badge key)', async () => {
    const { runRules } = await import('../src/domain/compatibility/engine.js');
    const results = runRules(makeSetup({}), BASE_RIDER);
    for (const r of results) {
      expect(r.ruleId.length).toBeGreaterThan(0);
    }
  });
});

