import { describe, expect, it } from 'vitest';
import { kgToLbs, parseHeight, parseWeight } from '../src/lib/conversions.js';

describe('parseWeight (lbs → kg)', () => {
  it('parses pounds to rounded kilograms', () => {
    expect(parseWeight('165')).toBe(75);
    expect(parseWeight('200')).toBe(91);
  });
});

describe('kgToLbs (kg → lbs)', () => {
  it('converts kilograms to rounded pounds', () => {
    expect(kgToLbs(75)).toBe(165);
    expect(kgToLbs(80)).toBe(176);
  });

  // The corruption bug: the wizard pre-fills the stored kg value but the prompt parses lbs.
  // Displaying the value in the parser's unit (lbs) must round-trip without drift, so a
  // returning rider who re-types the number they see does NOT silently rewrite their weight.
  it('round-trips through parseWeight without corrupting the stored kg', () => {
    for (const kg of [50, 66, 75, 80, 91, 120]) {
      expect(parseWeight(String(kgToLbs(kg)))).toBe(kg);
    }
  });
});

describe('parseHeight round-trips its displayed cm value', () => {
  it('re-typing the bare cm value yields the same height', () => {
    for (const cm of [160, 178, 190]) {
      expect(parseHeight(String(cm))).toBe(cm);
    }
  });
});
