import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDatabase } from '../src/data/db.js';
import { makePriceRepo } from '../src/data/repos/priceRepo.js';
import { makeRiderRepo } from '../src/data/repos/riderRepo.js';
import { makeSetupRepo } from '../src/data/repos/setupRepo.js';
import { makeProductRepo } from '../src/data/repos/productRepo.js';
import type Database from 'better-sqlite3';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

/**
 * Helper: insert a products row to satisfy FK constraint for price_observations.
 * Returns the lastInsertRowid as a number.
 */
function insertTestProduct(db: Database.Database): number {
  return db
    .prepare(
      `INSERT INTO products (shopify_id, retailer, title, handle, price_cents, variants_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run('test-id-1', 'evo', 'Test Board', 'test-board', 44995, '[]', Date.now())
    .lastInsertRowid as number;
}

// ---------------------------------------------------------------------------
// priceRepo
// ---------------------------------------------------------------------------

describe('priceRepo', () => {
  it('records and returns a price observation', () => {
    const db = openDatabase(':memory:');
    const repo = makePriceRepo(db);
    const productId = insertTestProduct(db);
    repo.record(productId, 44995);
    const history = repo.history(productId);
    expect(history).toHaveLength(1);
    expect(history[0]?.priceCents).toBe(44995);
  });

  it('returns observations ordered by observed_at DESC (newest first)', () => {
    const db = openDatabase(':memory:');
    const repo = makePriceRepo(db);
    const productId = insertTestProduct(db);
    repo.record(productId, 40000);
    repo.record(productId, 45000);
    repo.record(productId, 42000);
    const history = repo.history(productId);
    expect(history).toHaveLength(3);
    // All records should have increasing IDs; DESC by observed_at means latest is first.
    // Since we inserted sequentially, the last insert (42000) should be first.
    expect(history[0]?.priceCents).toBe(42000);
  });

  it('returns empty array for product with no observations', () => {
    const db = openDatabase(':memory:');
    const repo = makePriceRepo(db);
    const productId = insertTestProduct(db);
    expect(repo.history(productId)).toHaveLength(0);
  });

  it('throws on invalid productId (foreign key enforcement)', () => {
    const db = openDatabase(':memory:');
    const repo = makePriceRepo(db);
    // product_id=9999 does not exist — foreign_keys=ON must throw
    expect(() => repo.record(9999, 44995)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// riderRepo
// ---------------------------------------------------------------------------

describe('riderRepo', () => {
  it('returns null when no profile has been saved', () => {
    const db = openDatabase(':memory:');
    const repo = makeRiderRepo(db);
    expect(repo.get()).toBeNull();
  });

  it('upsert() then get() round-trip returns same data', () => {
    const db = openDatabase(':memory:');
    const repo = makeRiderRepo(db);
    const profile = {
      bootSize: 10.5,
      heightCm: 178,
      weightKg: 75,
      ridingStyle: 'all-mountain' as const,
    };
    repo.upsert(profile);
    const result = repo.get();
    expect(result).not.toBeNull();
    expect(result?.bootSize).toBe(10.5);
    expect(result?.heightCm).toBe(178);
    expect(result?.weightKg).toBe(75);
    expect(result?.ridingStyle).toBe('all-mountain');
  });

  it('second upsert() updates the row (no duplicate rows)', () => {
    const db = openDatabase(':memory:');
    const repo = makeRiderRepo(db);
    repo.upsert({ bootSize: 10.5, heightCm: 178, weightKg: 75, ridingStyle: 'all-mountain' });
    repo.upsert({ bootSize: 11, heightCm: 180, weightKg: 80, ridingStyle: 'freeride' });
    // Only one row should exist
    const count = db.prepare('SELECT COUNT(*) as cnt FROM rider_profile').get() as { cnt: number };
    expect(count.cnt).toBe(1);
    const result = repo.get();
    expect(result?.bootSize).toBe(11);
    expect(result?.ridingStyle).toBe('freeride');
  });
});

// ---------------------------------------------------------------------------
// setupRepo
// ---------------------------------------------------------------------------

describe('setupRepo', () => {
  it('returns empty array when no setups saved', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    expect(repo.list()).toHaveLength(0);
  });

  it('save() then list() returns the saved setup', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    const id = repo.save({ boardId: undefined, bindingId: undefined, bootId: undefined });
    const setups = repo.list();
    expect(setups).toHaveLength(1);
    expect(setups[0]?.id).toBe(id);
  });

  it('save() with compatibility stores JSON; list() parses it back', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    const compatibility = [
      { ruleId: 'boot-to-binding-size', verdict: 'pass' as const, reason: 'Fits' },
      { ruleId: 'binding-disc-to-mount', verdict: 'fail' as const, reason: 'Mismatch' },
    ];
    repo.save({ compatibility });
    const setups = repo.list();
    expect(setups[0]?.compatibility).toEqual(compatibility);
  });

  it('list() returns setups newest first', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    const id1 = repo.save({});
    const id2 = repo.save({});
    const setups = repo.list();
    // Newest first: id2 should come before id1
    expect(setups[0]?.id).toBe(id2);
    expect(setups[1]?.id).toBe(id1);
  });
});

// ---------------------------------------------------------------------------
// setupRepo — Phase 6 extensions
// ---------------------------------------------------------------------------

describe('setupRepo — Phase 6 extensions', () => {
  it('list() maps alert_enabled column to alertEnabled boolean (false by default)', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    repo.save({});
    expect(repo.list()[0]?.alertEnabled).toBe(false);
  });

  it('setAlert(id, true) sets alertEnabled to true', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    const id = repo.save({});
    repo.setAlert(id, true);
    expect(repo.list()[0]?.alertEnabled).toBe(true);
  });

  it('setAlert(id, false) sets alertEnabled back to false', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    const id = repo.save({});
    repo.setAlert(id, true);
    repo.setAlert(id, false);
    expect(repo.list()[0]?.alertEnabled).toBe(false);
  });

  it('delete(id) removes the setup row', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    const id = repo.save({});
    repo.delete(id);
    expect(repo.list()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// setupRepo — Phase 9 findCompleteSetup
// ---------------------------------------------------------------------------

function insertThreeProducts(db: Database.Database): [number, number, number] {
  const insert = db.prepare(
    `INSERT INTO products (shopify_id, retailer, title, handle, price_cents, variants_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const p1 = insert.run('board-1', 'evo', 'Test Board', 'test-board', 44995, '[]', Date.now()).lastInsertRowid as number;
  const p2 = insert.run('binding-1', 'evo', 'Test Binding', 'test-binding', 19995, '[]', Date.now()).lastInsertRowid as number;
  const p3 = insert.run('boot-1', 'evo', 'Test Boot', 'test-boot', 22995, '[]', Date.now()).lastInsertRowid as number;
  return [p1, p2, p3];
}

describe('setupRepo — findCompleteSetup', () => {
  it('returns null when table is empty', () => {
    const db = openDatabase(':memory:');
    const repo = makeSetupRepo(db);
    expect(repo.findCompleteSetup()).toBeNull();
  });

  it('returns null when a row has only boardId (incomplete setup)', () => {
    const db = openDatabase(':memory:');
    const [p1] = insertThreeProducts(db);
    const repo = makeSetupRepo(db);
    repo.save({ boardId: p1 });
    expect(repo.findCompleteSetup()).toBeNull();
  });

  it('returns the row when a single row has all three IDs', () => {
    const db = openDatabase(':memory:');
    const [p1, p2, p3] = insertThreeProducts(db);
    const repo = makeSetupRepo(db);
    const id = repo.save({ boardId: p1, bindingId: p2, bootId: p3 });
    const result = repo.findCompleteSetup();
    expect(result).not.toBeNull();
    expect(result?.id).toBe(id);
    expect(result?.boardId).toBe(p1);
    expect(result?.bindingId).toBe(p2);
    expect(result?.bootId).toBe(p3);
  });

  it('returns the most recently saved of multiple complete rows', () => {
    const db = openDatabase(':memory:');
    const [p1, p2, p3] = insertThreeProducts(db);
    const repo = makeSetupRepo(db);
    repo.save({ boardId: p1, bindingId: p2, bootId: p3 });
    // Second save must also have valid product IDs — reuse same products for simplicity
    const id2 = repo.save({ boardId: p1, bindingId: p2, bootId: p3 });
    const result = repo.findCompleteSetup();
    expect(result).not.toBeNull();
    // Most recent by saved_at DESC, id DESC — id2 was saved later
    expect(result?.id).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// productRepo — Phase 6 extensions
// ---------------------------------------------------------------------------

describe('productRepo — Phase 6 extensions', () => {
  it('findById returns product by primary key', () => {
    const db = openDatabase(':memory:');
    const repo = makeProductRepo(db);
    const productId = insertTestProduct(db);
    const product = repo.findById(productId);
    expect(product).not.toBeNull();
    expect(product?.title).toBe('Test Board');
  });

  it('findById returns null for missing id', () => {
    const db = openDatabase(':memory:');
    const repo = makeProductRepo(db);
    expect(repo.findById(999999)).toBeNull();
  });
});
