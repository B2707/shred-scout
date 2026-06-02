/**
 * Repository for dynamically configured Shopify retailer sources.
 *
 * Replaces the hardcoded RETAILERS constant with a user-extensible SQLite table.
 * Any Shopify store URL can be added at runtime — Shred Scout is not limited to
 * a predefined list of shops.
 *
 * makeRetailerRepo() is passed an open Database instance. Call openDatabase() first.
 */
import type Database from 'better-sqlite3';

/** A persisted retailer source configuration. */
export interface RetailerConfig {
  id: number;
  /** Short display name used as the `retailer` column in products. */
  name: string;
  /** Base store URL without trailing slash (e.g. 'https://stokedboardshop.com'). */
  storeUrl: string;
  /**
   * Public Shopify Storefront Access Token — enables the GraphQL Storefront API.
   * Null means the store hasn't exposed one; the scraper falls back to /products.json.
   */
  storefrontToken: string | null;
  addedAt: number;
}

/** Input shape for adding a new retailer (id and addedAt are generated). */
export type RetailerConfigInput = Omit<RetailerConfig, 'id' | 'addedAt'>;

export interface RetailerRepo {
  /** Returns all configured retailer sources ordered by addedAt ascending. */
  all(): RetailerConfig[];
  /** Adds a new retailer; no-ops if storeUrl already exists. */
  add(config: RetailerConfigInput): void;
  /** Removes a retailer by id. */
  remove(id: number): void;
  /**
   * Seeds default retailers only if the table is currently empty.
   * Called on first run so users always have a working set to start with.
   */
  seedIfEmpty(defaults: RetailerConfigInput[]): void;
}

export function makeRetailerRepo(db: Database.Database): RetailerRepo {
  const stmtAll = db.prepare<[], RetailerConfig>(
    'SELECT id, name, store_url AS storeUrl, storefront_token AS storefrontToken, added_at AS addedAt FROM retailer_configs ORDER BY added_at ASC',
  );

  const stmtInsert = db.prepare(
    'INSERT OR IGNORE INTO retailer_configs (name, store_url, storefront_token, added_at) VALUES (?, ?, ?, ?)',
  );

  const stmtRemove = db.prepare('DELETE FROM retailer_configs WHERE id = ?');

  const stmtCount = db.prepare<[], { n: number }>(
    'SELECT COUNT(*) AS n FROM retailer_configs',
  );

  return {
    all() {
      return stmtAll.all();
    },

    add(config) {
      stmtInsert.run(
        config.name,
        config.storeUrl,
        config.storefrontToken ?? null,
        Date.now(),
      );
    },

    remove(id) {
      stmtRemove.run(id);
    },

    seedIfEmpty(defaults) {
      const n = stmtCount.get()?.n ?? 0;
      if (n > 0) return;
      const insertMany = db.transaction((items: RetailerConfigInput[]) => {
        for (const item of items) {
          stmtInsert.run(
            item.name,
            item.storeUrl,
            item.storefrontToken ?? null,
            Date.now(),
          );
        }
      });
      insertMany(defaults);
    },
  };
}
