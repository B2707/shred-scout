import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// Use a fresh temp dir per test run so conf writes don't collide
const testCwd = mkdtempSync(join(tmpdir(), 'shred-scout-profile-test-'));

describe('parseHeight()', () => {
  it('parses 5\'10" as 178cm', async () => {
    const { parseHeight } = await import('../src/lib/conversions.js');
    expect(parseHeight('5\'10"')).toBe(178);
  });
  it("parses 5'10 (no inch mark) as 178cm", async () => {
    const { parseHeight } = await import('../src/lib/conversions.js');
    expect(parseHeight("5'10")).toBe(178);
  });
  it("parses 6' (no inches) as 183cm", async () => {
    const { parseHeight } = await import('../src/lib/conversions.js');
    expect(parseHeight("6'")).toBe(183);
  });
  it('parses bare cm passthrough', async () => {
    const { parseHeight } = await import('../src/lib/conversions.js');
    expect(parseHeight('178')).toBe(178);
  });
  it('returns NaN for non-numeric input', async () => {
    const { parseHeight } = await import('../src/lib/conversions.js');
    expect(parseHeight('abc')).toBeNaN();
  });
});

describe('parseWeight()', () => {
  it('converts 165 lbs to 75 kg', async () => {
    const { parseWeight } = await import('../src/lib/conversions.js');
    expect(parseWeight('165')).toBe(75);
  });
  it('converts 200 lbs to 91 kg', async () => {
    const { parseWeight } = await import('../src/lib/conversions.js');
    expect(parseWeight('200')).toBe(91);
  });
  it('returns NaN for non-numeric input', async () => {
    const { parseWeight } = await import('../src/lib/conversions.js');
    expect(parseWeight('abc')).toBeNaN();
  });
});

describe('validateBootSize()', () => {
  it('accepts minimum valid size 4.0', async () => {
    const { validateBootSize } = await import('../src/lib/profile.js');
    expect(validateBootSize(4.0)).toBe(true);
  });
  it('accepts mid-range size 10.5', async () => {
    const { validateBootSize } = await import('../src/lib/profile.js');
    expect(validateBootSize(10.5)).toBe(true);
  });
  it('accepts maximum valid size 18.0', async () => {
    const { validateBootSize } = await import('../src/lib/profile.js');
    expect(validateBootSize(18.0)).toBe(true);
  });
  it('rejects size below 4.0', async () => {
    const { validateBootSize } = await import('../src/lib/profile.js');
    expect(validateBootSize(3.9)).toBe(false);
  });
  it('rejects size above 18.0', async () => {
    const { validateBootSize } = await import('../src/lib/profile.js');
    expect(validateBootSize(18.1)).toBe(false);
  });
  it('rejects NaN', async () => {
    const { validateBootSize } = await import('../src/lib/profile.js');
    expect(validateBootSize(NaN)).toBe(false);
  });
});

describe('validateHeightCm()', () => {
  it('accepts minimum valid height 120cm', async () => {
    const { validateHeightCm } = await import('../src/lib/profile.js');
    expect(validateHeightCm(120)).toBe(true);
  });
  it('accepts maximum valid height 250cm', async () => {
    const { validateHeightCm } = await import('../src/lib/profile.js');
    expect(validateHeightCm(250)).toBe(true);
  });
  it('rejects height below 120cm', async () => {
    const { validateHeightCm } = await import('../src/lib/profile.js');
    expect(validateHeightCm(119)).toBe(false);
  });
  it('rejects height above 250cm', async () => {
    const { validateHeightCm } = await import('../src/lib/profile.js');
    expect(validateHeightCm(251)).toBe(false);
  });
});

describe('validateWeightKg()', () => {
  it('accepts minimum valid weight 30kg', async () => {
    const { validateWeightKg } = await import('../src/lib/profile.js');
    expect(validateWeightKg(30)).toBe(true);
  });
  it('accepts maximum valid weight 200kg', async () => {
    const { validateWeightKg } = await import('../src/lib/profile.js');
    expect(validateWeightKg(200)).toBe(true);
  });
  it('rejects weight below 30kg', async () => {
    const { validateWeightKg } = await import('../src/lib/profile.js');
    expect(validateWeightKg(29)).toBe(false);
  });
  it('rejects weight above 200kg', async () => {
    const { validateWeightKg } = await import('../src/lib/profile.js');
    expect(validateWeightKg(201)).toBe(false);
  });
});

describe('readProfile() + writeProfile() round-trip', () => {
  it('readProfile returns null when no profile stored', async () => {
    vi.resetModules();
    // Override conf cwd to isolated temp dir so this test is independent
    vi.doMock('conf', async () => {
      const { default: OrigConf } = await vi.importActual<{
        default: typeof import('conf').default;
      }>('conf');
      return {
        default: class extends OrigConf<Record<string, unknown>> {
          constructor(opts: Record<string, unknown>) {
            super({ ...opts, cwd: testCwd });
          }
        },
      };
    });
    const { readProfile } = await import('../src/lib/profile.js');
    expect(readProfile()).toBeNull();
  });

  it('writeProfile then readProfile returns stored profile', async () => {
    vi.resetModules();
    vi.doMock('conf', async () => {
      const { default: OrigConf } = await vi.importActual<{
        default: typeof import('conf').default;
      }>('conf');
      return {
        default: class extends OrigConf<Record<string, unknown>> {
          constructor(opts: Record<string, unknown>) {
            super({ ...opts, cwd: testCwd });
          }
        },
      };
    });
    const { readProfile, writeProfile } = await import('../src/lib/profile.js');
    const profile = {
      bootSize: 10.5,
      heightCm: 178,
      weightKg: 75,
      ridingStyle: 'all-mountain',
    };
    writeProfile(profile);
    const result = readProfile();
    expect(result).not.toBeNull();
    expect(result?.bootSize).toBe(10.5);
    expect(result?.heightCm).toBe(178);
    expect(result?.weightKg).toBe(75);
    expect(result?.ridingStyle).toBe('all-mountain');
  });
});
