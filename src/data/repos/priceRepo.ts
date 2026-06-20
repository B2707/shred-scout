/**
 * Price observation repository for Shred Scout.
 *
 * Factory function pattern - accepts a Database instance, returns a plain object
 * of typed methods backed by prepared statements. All SQL is in this file.
 *
 * price_observations is append-only - price alerts read the full history
 * to compute price diffs. Never delete or update rows.
 */
import type Database from 'better-sqlite3';

/** A single price observation row from the price_observations table. */
export interface PriceObservation {
  id: number;
  productId: number;
  priceCents: number;
  observedAt: number;
}

/**
 * Creates a priceRepo bound to the given Database instance.
 * @param db - Initialized Database from openDatabase()
 */
export function makePriceRepo(db: Database.Database) {
  const insert = db.prepare(
    'INSERT INTO price_observations (product_id, price_cents, observed_at) VALUES (@productId, @priceCents, @observedAt)',
  );
  const selectByProduct = db.prepare(
    'SELECT id, product_id AS productId, price_cents AS priceCents, observed_at AS observedAt FROM price_observations WHERE product_id = ? ORDER BY observed_at DESC',
  );

  return {
    /**
     * Appends a price observation for a product.
     * Throws if productId does not exist (foreign key constraint).
     * @param productId - products.id FK
     * @param priceCents - Price in integer cents
     */
    record(productId: number, priceCents: number): void {
      insert.run({ productId, priceCents, observedAt: Date.now() });
    },

    /**
     * Returns all price observations for a product, newest first.
     * @param productId - products.id FK
     */
    history(productId: number): PriceObservation[] {
      return selectByProduct.all(productId) as PriceObservation[];
    },
  };
}
