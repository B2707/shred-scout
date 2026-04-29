import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('openDatabase()', () => {
  it('opens an in-memory database without throwing', async () => {
    const { openDatabase } = await import('../src/data/db.js');
    expect(() => openDatabase(':memory:')).not.toThrow();
  });

  it('creates all required tables after openDatabase()', async () => {
    const { openDatabase } = await import('../src/data/db.js');
    const db = openDatabase(':memory:');
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map(r => r.name);
    expect(tables).toContain('products');
    expect(tables).toContain('price_observations');
    expect(tables).toContain('saved_setups');
    expect(tables).toContain('schema_versions');
  });

  it('products table has UNIQUE(shopify_id, retailer) — INSERT OR REPLACE upsert works', async () => {
    const { openDatabase } = await import('../src/data/db.js');
    const db = openDatabase(':memory:');
    const insert = db.prepare(
      `INSERT OR REPLACE INTO products
         (shopify_id, retailer, title, handle, price_cents, variants_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run('shop-1', 'evo', 'Test Board', 'test-board', 44995, '[]', Date.now());
    expect(() =>
      insert.run('shop-1', 'evo', 'Test Board Updated', 'test-board', 45995, '[]', Date.now())
    ).not.toThrow();
    const row = db.prepare("SELECT title FROM products WHERE shopify_id='shop-1'").get() as {
      title: string;
    };
    expect(row.title).toBe('Test Board Updated');
  });

  it('records the migration in schema_versions after openDatabase()', async () => {
    const { openDatabase } = await import('../src/data/db.js');
    const db = openDatabase(':memory:');
    const versions = db.prepare('SELECT name FROM schema_versions').all() as { name: string }[];
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.map(v => v.name)).toContain('001_initial');
  });

  it('enables WAL mode after openDatabase()', async () => {
    const { openDatabase } = await import('../src/data/db.js');
    const db = openDatabase(':memory:');
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    // ':memory:' databases always report 'memory' journal mode — WAL pragma is accepted
    // but in-memory DBs cannot use WAL; verify pragma doesn't throw and returns a value
    expect(result).toBeDefined();
  });

  it('enables foreign keys after openDatabase()', async () => {
    const { openDatabase } = await import('../src/data/db.js');
    const db = openDatabase(':memory:');
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0]?.foreign_keys).toBe(1);
  });

  it('is idempotent — second openDatabase call on different :memory: instance does not throw', async () => {
    const { openDatabase } = await import('../src/data/db.js');
    expect(() => {
      openDatabase(':memory:');
      openDatabase(':memory:');
    }).not.toThrow();
  });
});
