import { describe, expect, it } from 'vitest';
import type { PriceObservation } from '../src/data/repos/priceRepo.js';
import { priceDropAlert } from '../src/domain/alerts/diff.js';

const makeObs = (priceCents: number, id: number): PriceObservation => ({
  id,
  productId: 1,
  priceCents,
  observedAt: Date.now() - id * 1000,
});

describe('priceDropAlert()', () => {
  it('returns null when history is empty', () => {
    expect(priceDropAlert([])).toBeNull();
  });

  it('returns null when history has only 1 observation', () => {
    expect(priceDropAlert([makeObs(40000, 1)])).toBeNull();
  });

  it('returns null when latest price is equal to prior minimum', () => {
    // latest=40000, prior min=40000 - not strictly less than
    const history = [makeObs(40000, 2), makeObs(40000, 1)];
    expect(priceDropAlert(history)).toBeNull();
  });

  it('returns null when latest price is above prior minimum', () => {
    // latest=45000, prior=[50000, 40000] - min=40000, 45000 > 40000, no drop
    const history = [makeObs(45000, 3), makeObs(50000, 2), makeObs(40000, 1)];
    expect(priceDropAlert(history)).toBeNull();
  });

  it('returns PriceDropAlert when latest < min(all prior)', () => {
    // latest=35000, prior=[50000, 40000] - min=40000, 35000 < 40000 - drop!
    const history = [makeObs(35000, 3), makeObs(50000, 2), makeObs(40000, 1)];
    const result = priceDropAlert(history);
    expect(result).not.toBeNull();
    expect(result?.newPriceCents).toBe(35000);
    expect(result?.previousMinCents).toBe(40000);
    expect(result?.dropCents).toBe(5000);
    expect(result?.productId).toBe(1);
  });

  it('uses minimum of all prior observations, not just the immediately previous', () => {
    // latest=38000, prior=[50000, 42000, 39000] - min=39000, 38000 < 39000 - drop!
    const history = [
      makeObs(38000, 4),
      makeObs(50000, 3),
      makeObs(42000, 2),
      makeObs(39000, 1),
    ];
    const result = priceDropAlert(history);
    expect(result).not.toBeNull();
    expect(result?.previousMinCents).toBe(39000);
    expect(result?.dropCents).toBe(1000);
  });
});
