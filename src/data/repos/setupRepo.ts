/**
 * Saved gear setup repository for Shred Scout.
 *
 * Stores board+binding+boot product ID triples plus a JSON snapshot of RuleResult[]
 * at save time. Phase 6 renders these saved setups in the wishlist view.
 *
 * setupRepo references products.id FKs — products must exist before saving setups
 * with product IDs (null IDs are allowed for partial saves).
 */
import type Database from 'better-sqlite3';
import type { RuleResult } from '../../domain/compatibility/types.js';

/** A saved setup row returned from setupRepo.list(). */
export interface SavedSetup {
  id: number;
  boardId: number | null;
  bindingId: number | null;
  bootId: number | null;
  /** Parsed RuleResult[] snapshot from save time. */
  compatibility: RuleResult[] | null;
  savedAt: number;
  /** Whether price-drop alerts are enabled for this setup (Phase 6). */
  alertEnabled: boolean;
}

/** Input for saving a new setup. All product IDs are products.id values. */
export interface SaveSetupInput {
  boardId?: number;
  bindingId?: number;
  bootId?: number;
  compatibility?: RuleResult[];
}

/** Row shape from sqlite SELECT. */
interface SetupRow {
  id: number;
  board_id: number | null;
  binding_id: number | null;
  boot_id: number | null;
  compatibility: string | null;
  saved_at: number;
  alert_enabled: number;
}

/**
 * Creates a setupRepo bound to the given Database instance.
 * @param db - Initialized Database from openDatabase()
 */
export function makeSetupRepo(db: Database.Database) {
  const insertStmt = db.prepare(`
    INSERT INTO saved_setups (board_id, binding_id, boot_id, compatibility, saved_at)
    VALUES (@boardId, @bindingId, @bootId, @compatibility, @savedAt)
  `);

  const selectAllStmt = db.prepare(
    'SELECT id, board_id, binding_id, boot_id, compatibility, saved_at, alert_enabled FROM saved_setups ORDER BY saved_at DESC, id DESC'
  );

  const selectCompleteStmt = db.prepare<[], SetupRow>(
    'SELECT id, board_id, binding_id, boot_id, compatibility, saved_at, alert_enabled FROM saved_setups WHERE board_id IS NOT NULL AND binding_id IS NOT NULL AND boot_id IS NOT NULL ORDER BY saved_at DESC, id DESC LIMIT 1'
  );

  const deleteStmt = db.prepare('DELETE FROM saved_setups WHERE id = ?');
  const setAlertStmt = db.prepare('UPDATE saved_setups SET alert_enabled = ? WHERE id = ?');

  return {
    /**
     * Saves a gear setup to the wishlist.
     * @param input - Setup product IDs and optional compatibility snapshot
     * @returns The new setup's row ID
     */
    save(input: SaveSetupInput): number {
      const result = insertStmt.run({
        boardId: input.boardId ?? null,
        bindingId: input.bindingId ?? null,
        bootId: input.bootId ?? null,
        compatibility: input.compatibility ? JSON.stringify(input.compatibility) : null,
        savedAt: Date.now(),
      });
      return result.lastInsertRowid as number;
    },

    /**
     * Returns all saved setups, newest first.
     */
    list(): SavedSetup[] {
      return (selectAllStmt.all() as SetupRow[]).map(row => ({
        id: row.id,
        boardId: row.board_id,
        bindingId: row.binding_id,
        bootId: row.boot_id,
        compatibility: (() => {
          if (!row.compatibility) return null;
          try {
            return JSON.parse(row.compatibility) as RuleResult[];
          } catch {
            // Corrupt or manually-edited row — treat as no compatibility data
            return null;
          }
        })(),
        savedAt: row.saved_at,
        alertEnabled: row.alert_enabled === 1,
      }));
    },

    /**
     * Returns the most recently saved SavedSetup with all three gear slots filled,
     * or null if no such row exists.
     */
    findCompleteSetup(): SavedSetup | null {
      const row = selectCompleteStmt.get();
      if (!row) return null;
      return {
        id: row.id,
        boardId: row.board_id,
        bindingId: row.binding_id,
        bootId: row.boot_id,
        compatibility: (() => {
          if (!row.compatibility) return null;
          try {
            return JSON.parse(row.compatibility) as RuleResult[];
          } catch {
            return null;
          }
        })(),
        savedAt: row.saved_at,
        alertEnabled: row.alert_enabled === 1,
      };
    },

    /**
     * Deletes a saved setup by ID.
     * @param id - The saved_setups.id to delete
     */
    delete(id: number): void {
      deleteStmt.run(id);
    },

    /**
     * Enables or disables price-drop alerts for a saved setup.
     * @param id - The saved_setups.id to update
     * @param enabled - true to enable alerts, false to disable
     */
    setAlert(id: number, enabled: boolean): void {
      setAlertStmt.run(enabled ? 1 : 0, id);
    },
  };
}
