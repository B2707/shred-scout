import { describe, expect, it } from 'vitest';
import {
  parseBoardLengthsCm,
  recommendBoardLength,
} from '../src/domain/compatibility/board-sizing.js';
import type { RiderProfile } from '../src/types/profile.js';

const base: RiderProfile = {
  bootSize: 10,
  heightCm: 178,
  weightKg: 75,
  ridingStyle: 'all-mountain',
  skillLevel: 'intermediate',
};

describe('recommendBoardLength', () => {
  it('returns a sane min < ideal < max within real board lengths', () => {
    const rec = recommendBoardLength(base);
    expect(rec.min).toBeLessThan(rec.ideal);
    expect(rec.ideal).toBeLessThan(rec.max);
    expect(rec.min).toBeGreaterThanOrEqual(135);
    expect(rec.max).toBeLessThanOrEqual(185);
  });

  it('recommends a longer board for a heavier rider (weight is the primary driver)', () => {
    const light = recommendBoardLength({ ...base, weightKg: 55 });
    const heavy = recommendBoardLength({ ...base, weightKg: 95 });
    expect(heavy.ideal).toBeGreaterThan(light.ideal);
  });

  it('recommends a shorter board for beginners than for advanced riders', () => {
    const beginner = recommendBoardLength({ ...base, skillLevel: 'beginner' });
    const advanced = recommendBoardLength({ ...base, skillLevel: 'advanced' });
    expect(beginner.ideal).toBeLessThan(advanced.ideal);
  });

  it('recommends a longer board for powder than for park', () => {
    const powder = recommendBoardLength({ ...base, ridingStyle: 'powder' });
    const park = recommendBoardLength({ ...base, ridingStyle: 'park' });
    expect(powder.ideal).toBeGreaterThan(park.ideal);
  });
});

describe('parseBoardLengthsCm', () => {
  const variants = (opts: string[]) =>
    JSON.stringify(opts.map((o) => ({ option1: o })));

  it('parses board lengths from size variants, including a wide "W" suffix', () => {
    expect(parseBoardLengthsCm(variants(['154', '157W', '160']))).toEqual([
      154, 157, 160,
    ]);
  });

  it('ignores boot/binding sizes that are not plausible board lengths', () => {
    expect(parseBoardLengthsCm(variants(['9', '9.5', '10', 'M']))).toEqual([]);
  });

  it('returns an empty array for unparseable variants', () => {
    expect(parseBoardLengthsCm('not json')).toEqual([]);
    expect(parseBoardLengthsCm(variants([]))).toEqual([]);
  });
});
