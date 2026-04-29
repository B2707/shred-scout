/**
 * SQLite database initializer for Shred Scout.
 *
 * openDatabase() opens a better-sqlite3 database, enables WAL mode and foreign keys,
 * and runs all pending inline SQL migrations tracked in schema_versions.
 *
 * Migrations are inlined as template literals (not file-based) to avoid tsup copy
 * configuration. All schema changes go here as new migration entries in MIGRATIONS.
 *
 * Run once at startup — pass the returned Database instance to all repo factory functions.
 */
import Database from 'better-sqlite3';

/** A single migration entry — name must be stable (used as PK in schema_versions). */
interface Migration {
  name: string;
  sql: string;
}

/**
 * Ordered list of all schema migrations.
 * Append new entries here — never modify existing entries (breaks idempotency).
 */
const MIGRATIONS: Migration[] = [
  {
    name: '001_initial',
    sql: `
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  shopify_id      TEXT    NOT NULL,
  retailer        TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  handle          TEXT    NOT NULL,
  vendor          TEXT,
  product_type    TEXT,
  gear_category   TEXT,
  waist_width_mm  INTEGER,
  mount_pattern   TEXT,
  mount_pattern_raw TEXT,
  image_url       TEXT,
  price_cents     INTEGER NOT NULL,
  variants_json   TEXT    NOT NULL,
  fetched_at      INTEGER NOT NULL,
  UNIQUE(shopify_id, retailer)
);
CREATE INDEX IF NOT EXISTS idx_products_gear_category ON products(gear_category);
CREATE INDEX IF NOT EXISTS idx_products_retailer ON products(retailer);

CREATE TABLE IF NOT EXISTS price_observations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  price_cents INTEGER NOT NULL,
  observed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_obs_product ON price_observations(product_id, observed_at);

CREATE TABLE IF NOT EXISTS saved_setups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id        INTEGER REFERENCES products(id),
  binding_id      INTEGER REFERENCES products(id),
  boot_id         INTEGER REFERENCES products(id),
  compatibility   TEXT,
  saved_at        INTEGER NOT NULL
);
    `.trim(),
  },
  {
    // WR-04: rider_profile moved from makeRiderRepo() into migration system so the
    // table is version-tracked and exists for all database users regardless of whether
    // makeRiderRepo() is called.
    name: '002_rider_profile',
    sql: `
CREATE TABLE IF NOT EXISTS rider_profile (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  boot_size     REAL    NOT NULL,
  height_cm     REAL    NOT NULL,
  weight_kg     REAL    NOT NULL,
  riding_style  TEXT    NOT NULL
);
    `.trim(),
  },
];

/**
 * Opens (or creates) the Shred Scout SQLite database and runs all pending migrations.
 *
 * @param dbPath - File path for the database, or ':memory:' for in-memory (tests).
 * @returns Initialized better-sqlite3 Database instance ready for use.
 */
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Bootstrap schema_versions table on first run
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      name       TEXT    PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM schema_versions').all() as { name: string }[]).map(r => r.name)
  );

  const insertVersion = db.prepare(
    'INSERT INTO schema_versions (name, applied_at) VALUES (?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    // Wrap DDL + version tracking in a single transaction so a crash between
    // db.exec() and the INSERT cannot leave the DB in a corrupt state where the
    // schema has changed but the version row was never written.
    const runMigration = db.transaction(() => {
      db.exec(migration.sql);
      insertVersion.run(migration.name, Date.now());
    });
    runMigration();
  }

  return db;
}
