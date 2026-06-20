import { describe, expect, it } from 'vitest';
import {
  isReturningRider,
  optionWindow,
  truncateAtWord,
} from '../src/components/wizard/wizard-config.js';

describe('optionWindow (scroll a long option list to fit the terminal)', () => {
  it('shows everything from the top when all options fit', () => {
    expect(optionWindow(4, 0, 6)).toBe(0);
    expect(optionWindow(4, 3, 6)).toBe(0);
  });
  it('keeps the cursor in view, centered, when the list is taller than the window', () => {
    expect(optionWindow(6, 0, 3)).toBe(0); // clamp at top
    expect(optionWindow(6, 3, 3)).toBe(2); // centered
    expect(optionWindow(6, 5, 3)).toBe(3); // clamp at bottom (last 3: indices 3,4,5)
  });
});

describe('truncateAtWord (no mid-word cuts in option descriptions)', () => {
  it('leaves short text untouched', () => {
    expect(truncateAtWord('Ride everywhere', 40)).toBe('Ride everywhere');
  });
  it('truncates at a word boundary and never exceeds the width', () => {
    const out = truncateAtWord('hello world foo', 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('hello…'); // not "hello wor…"
  });
  it('keeps a whole word that exactly fits with the ellipsis', () => {
    expect(truncateAtWord('hello world foo', 12)).toBe('hello world…');
  });
});

describe('isReturningRider', () => {
  it('is true when a saved profile carries the body facts', () => {
    expect(
      isReturningRider({
        bootSize: 10,
        heightCm: 178,
        weightKg: 75,
        ridingStyle: 'all-mountain',
      }),
    ).toBe(true);
  });
  it('is false with no profile', () => {
    expect(isReturningRider(null)).toBe(false);
    expect(isReturningRider(undefined)).toBe(false);
  });
});
