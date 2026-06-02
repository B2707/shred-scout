/**
 * Product repository for Shred Scout.
 *
 * Provides upsert and query access to the products SQLite table.
 * All scraped NormalizedProduct objects must be persisted through this repo
 * before priceRepo.record() can be called (priceRepo takes a products.id FK).
 *
 * Upsert semantics: ON CONFLICT(shopify_id, retailer) updates all mutable columns
 * and refreshes fetched_at — the integer primary key (id) is preserved across updates.
 */
import type Database from 'better-sqlite3';
import type { NormalizedProduct } from '../normalizer.js';

/**
 * Creates a productRepo bound to the given Database instance.
 * @param db - Initialized Database from openDatabase()
 */
export function makeProductRepo(db: Database.Database) {
  const upsertStmt = db.prepare(`
    INSERT INTO products
      (shopify_id, retailer, title, handle, vendor, product_type, gear_category,
       waist_width_mm, flex_rating, mount_pattern, mount_pattern_raw, image_url,
       price_cents, variants_json, fetched_at)
    VALUES
      (@shopify_id, @retailer, @title, @handle, @vendor, @product_type, @gear_category,
       @waist_width_mm, @flex_rating, @mount_pattern, @mount_pattern_raw, @image_url,
       @price_cents, @variants_json, @fetched_at)
    ON CONFLICT(shopify_id, retailer) DO UPDATE SET
      title             = excluded.title,
      handle            = excluded.handle,
      vendor            = excluded.vendor,
      product_type      = excluded.product_type,
      gear_category     = excluded.gear_category,
      waist_width_mm    = excluded.waist_width_mm,
      flex_rating       = excluded.flex_rating,
      mount_pattern     = excluded.mount_pattern,
      mount_pattern_raw = excluded.mount_pattern_raw,
      image_url         = excluded.image_url,
      price_cents       = excluded.price_cents,
      variants_json     = excluded.variants_json,
      fetched_at        = excluded.fetched_at
    RETURNING id
  `);

  const selectByRetailerStmt = db.prepare(
    'SELECT * FROM products WHERE retailer = ?'
  );

  const selectByIdStmt = db.prepare('SELECT * FROM products WHERE id = ?');

  return {
    /**
     * Inserts or updates a normalized product row.
     * @returns The products.id (integer PK) of the upserted row — pass to priceRepo.record().
     *
     * Uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING id so the returned id is
     * always the affected row's own PK. (lastInsertRowid is wrong on the UPDATE path:
     * it reports the last *inserted* rowid, returning a DIFFERENT product's id — B1.)
     */
    upsert(product: NormalizedProduct): number {
      const row = upsertStmt.get(product) as { id: number };
      return row.id;
    },

    /**
     * Returns all products for a given retailer slug (e.g. 'evo', 'tactics').
     */
    findByRetailer(retailer: string): NormalizedProduct[] {
      return selectByRetailerStmt.all(retailer) as NormalizedProduct[];
    },

    /**
     * Returns a single product by its integer primary key, or null if not found.
     * @param id - The products.id to look up
     */
    findById(id: number): NormalizedProduct | null {
      return (selectByIdStmt.get(id) as NormalizedProduct | undefined) ?? null;
    },
  };
}
