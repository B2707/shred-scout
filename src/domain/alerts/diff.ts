/**
 * Price-drop alert computation for Shred Scout.
 *
 * Compares the latest price observation against the minimum of all prior
 * observations. Returns a PriceDropAlert if the latest price is lower, null
 * otherwise.
 *
 * NOTE: This is a stub created by plan 06-02 to unblock the CLI build.
 *       Plan 06-01 provides the full implementation — this file will be
 *       replaced when the two branches merge.
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
 * below the historical minimum, or null otherwise.
 *
 * @param history - Full observation history for one product (newest first)
 */
export function priceDropAlert(history: PriceObservation[]): PriceDropAlert | null {
  if (history.length < 2) return null;
  const [latest, ...prior] = history;
  const previousMinCents = Math.min(...prior.map(o => o.priceCents));
  if (latest.priceCents >= previousMinCents) return null;
  return {
    productId: latest.productId,
    newPriceCents: latest.priceCents,
    previousMinCents,
    dropCents: previousMinCents - latest.priceCents,
  };
}
