/**
 * Rider profile repository for Shred Scout.
 *
 * SQL mirror of the conf-based profile store (src/lib/profile.ts).
 * conf remains the primary store for Phase 1 compatibility; riderRepo provides
 * the SQL copy for Phase 4+ queries that join rider data with products.
 *
 * Upsert semantics: only one rider profile row ever exists (single-user CLI).
 * The rider_profile table uses id=1 with a CHECK constraint to enforce this.
 */
import type Database from 'better-sqlite3';
import type { RiderProfile } from '../../types/profile.js';

/** Row shape returned from the rider_profile table SELECT. */
interface RiderRow {
  boot_size: number;
  height_cm: number;
  weight_kg: number;
  riding_style: string;
}

/**
 * Creates a riderRepo bound to the given Database instance.
 * The rider_profile table is created here (not in openDatabase migrations) since
 * it is a supplemental table that mirrors the conf store; adding it to main migrations
 * would create a dependency on rider profile for all database users.
 * @param db - Initialized Database from openDatabase()
 */
export function makeRiderRepo(db: Database.Database) {
  // Create rider_profile table — single-row table enforced by CHECK (id = 1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rider_profile (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      boot_size     REAL    NOT NULL,
      height_cm     REAL    NOT NULL,
      weight_kg     REAL    NOT NULL,
      riding_style  TEXT    NOT NULL
    )
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO rider_profile (id, boot_size, height_cm, weight_kg, riding_style)
    VALUES (1, @bootSize, @heightCm, @weightKg, @ridingStyle)
    ON CONFLICT(id) DO UPDATE SET
      boot_size    = excluded.boot_size,
      height_cm    = excluded.height_cm,
      weight_kg    = excluded.weight_kg,
      riding_style = excluded.riding_style
  `);

  const selectStmt = db.prepare(
    'SELECT boot_size, height_cm, weight_kg, riding_style FROM rider_profile WHERE id = 1'
  );

  return {
    /**
     * Inserts or updates the single rider profile row.
     * @param profile - RiderProfile from conf or onboarding wizard
     */
    upsert(profile: RiderProfile): void {
      upsertStmt.run({
        bootSize: profile.bootSize,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        ridingStyle: profile.ridingStyle,
      });
    },

    /**
     * Returns the stored rider profile, or null if none has been saved.
     */
    get(): RiderProfile | null {
      const row = selectStmt.get() as RiderRow | undefined;
      if (!row) return null;
      return {
        bootSize: row.boot_size,
        heightCm: row.height_cm,
        weightKg: row.weight_kg,
        ridingStyle: row.riding_style,
      };
    },
  };
}
