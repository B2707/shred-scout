import { describe, it, expect } from 'vitest';
import { flexAdvisory } from '../src/domain/compatibility/flex-advisory.js';
import type { GearSetup } from '../src/domain/compatibility/types.js';
import type { RiderProfile } from '../src/types/profile.js';

function makeSetup(flexRating?: number): GearSetup {
  return {
    board: { waistWidthMm: 250, mountingPattern: '4x4', flexRating },
    binding: { sizeRange: [8, 11], discPattern: '4x4' },
    boot: { sizeUS: 10 },
  };
}

function makeRider(ridingStyle: 'beginner' | 'all-mountain' | 'freeride'): RiderProfile {
  return {
    bootSize: 10,
    heightCm: 175,
    weightKg: 75,
    ridingStyle,
  };
}

describe('flexAdvisory', () => {
  it('Test 1: beginner + flexRating 2 → verdict pass', () => {
    const result = flexAdvisory(makeSetup(2), makeRider('beginner'));
    expect(result.verdict).toBe('pass');
    expect(result.reason).toContain('Flex 2/10');
    expect(result.advisory).toBe(true);
  });

  it('Test 2: beginner + flexRating 7 → verdict warn (outside 1–4)', () => {
    const result = flexAdvisory(makeSetup(7), makeRider('beginner'));
    expect(result.verdict).toBe('warn');
    expect(result.reason).toContain('outside recommended range 1–4');
    expect(result.advisory).toBe(true);
  });

  it('Test 3: all-mountain + flexRating 5 → verdict pass', () => {
    const result = flexAdvisory(makeSetup(5), makeRider('all-mountain'));
    expect(result.verdict).toBe('pass');
  });

  it('Test 4: all-mountain + flexRating 3 → verdict warn (below range 4–7)', () => {
    const result = flexAdvisory(makeSetup(3), makeRider('all-mountain'));
    expect(result.verdict).toBe('warn');
    expect(result.reason).toContain('outside recommended range 4–7');
  });

  it('Test 5: freeride + flexRating 8 → verdict pass', () => {
    const result = flexAdvisory(makeSetup(8), makeRider('freeride'));
    expect(result.verdict).toBe('pass');
  });

  it('Test 6: freeride + flexRating 3 → verdict warn', () => {
    const result = flexAdvisory(makeSetup(3), makeRider('freeride'));
    expect(result.verdict).toBe('warn');
  });

  it('Test 7: flexRating undefined → verdict unknown', () => {
    const result = flexAdvisory(makeSetup(undefined), makeRider('beginner'));
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toBe('Flex rating not available for this product');
    expect(result.advisory).toBe(true);
  });

  it('Test 8: ruleId is always flex-pairing', () => {
    expect(flexAdvisory(makeSetup(2), makeRider('beginner')).ruleId).toBe('flex-pairing');
    expect(flexAdvisory(makeSetup(7), makeRider('beginner')).ruleId).toBe('flex-pairing');
    expect(flexAdvisory(makeSetup(undefined), makeRider('freeride')).ruleId).toBe('flex-pairing');
  });
});
