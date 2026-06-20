/**
 * Price drop alert computation for Shred Scout.
 *
 * Pure function - no I/O, no side effects. Called by the watch daemon
 * after priceRepo.history() to determine whether to fire an OS notification.
 */
import type { PriceObservation } from '../../data/repos/priceRepo.js';

export interface PriceDropAlert {
  productId: number;
  newPriceCents: number;
  previousMinCents: number;
  dropCents: number;
}

/**
 * Returns a PriceDropAlert if the latest observation is a confirmed price drop
 * (new price < minimum of all prior observations), or null if no drop detected.
 *
 * @param history - All observations from priceRepo.history(productId), newest first.
 */
export function priceDropAlert(
  history: PriceObservation[],
): PriceDropAlert | null {
  if (history.length < 2) return null;
  const [latest, ...prior] = history;
  if (!latest) return null;
  const priorMin = Math.min(...prior.map((o) => o.priceCents));
  if (latest.priceCents < priorMin) {
    return {
      productId: latest.productId,
      newPriceCents: latest.priceCents,
      previousMinCents: priorMin,
      dropCents: priorMin - latest.priceCents,
    };
  }
  return null;
}
