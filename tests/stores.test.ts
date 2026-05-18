/**
 * Tests for src/data/stores.ts — loadStores() and syncStoreToJson().
 * Covers the fallback-to-defaults contract and dedup logic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We manipulate process.cwd() return value to point to temp directories.
// This must be done before importing the module under test so the resolveStoresPath()
// function inside stores.ts picks up the mocked cwd.
let tempDir: string;

function setCwd(dir: string): void {
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'stores-test-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
  // Reset the module registry so each test gets a fresh import (process.cwd spy must be
  // set before the module's resolveStoresPath() is first evaluated per call).
  vi.resetModules();
});

describe('loadStores', () => {
  it('returns the 10 embedded default stores when stores.json is missing', async () => {
    setCwd(tempDir); // tempDir has no stores.json
    const { loadStores } = await import('../src/data/stores.js');
    const stores = loadStores();
    expect(stores).toHaveLength(10);
    expect(stores.every((s) => typeof s.name === 'string' && typeof s.storeUrl === 'string')).toBe(true);
    // Confirm a known entry is present
    expect(stores.some((s) => s.storeUrl === 'https://stokedboardshop.com')).toBe(true);
  });

  it('returns parsed stores when a valid stores.json exists', async () => {
    const twoStores = [
      { name: 'alpha', baseUrl: 'https://alpha.com', type: 'shopify' },
      { name: 'beta', baseUrl: 'https://beta.com', type: 'html' },
    ];
    writeFileSync(join(tempDir, 'stores.json'), JSON.stringify(twoStores, null, 2), 'utf-8');
    setCwd(tempDir);
    const { loadStores } = await import('../src/data/stores.js');
    const stores = loadStores();
    expect(stores).toHaveLength(2);
    expect(stores[0].storeUrl).toBe('https://alpha.com');
    expect(stores[1].storeUrl).toBe('https://beta.com');
    // storefrontToken is always null from the mapper
    expect(stores.every((s) => s.storefrontToken === null)).toBe(true);
  });

  it('falls back to defaults on malformed JSON', async () => {
    writeFileSync(join(tempDir, 'stores.json'), 'this is not json', 'utf-8');
    setCwd(tempDir);
    const { loadStores } = await import('../src/data/stores.js');
    const stores = loadStores();
    expect(stores).toHaveLength(10); // embedded defaults
  });

  it('falls back to defaults when JSON is valid but schema is wrong (missing baseUrl)', async () => {
    const badSchema = [{ name: 'broken', notBaseUrl: 'https://example.com', type: 'shopify' }];
    writeFileSync(join(tempDir, 'stores.json'), JSON.stringify(badSchema), 'utf-8');
    setCwd(tempDir);
    const { loadStores } = await import('../src/data/stores.js');
    const stores = loadStores();
    expect(stores).toHaveLength(10); // embedded defaults
  });
});

describe('syncStoreToJson', () => {
  it('appends a new entry to an existing stores.json', async () => {
    const initial = [{ name: 'stoked', baseUrl: 'https://stokedboardshop.com', type: 'shopify' }];
    writeFileSync(join(tempDir, 'stores.json'), JSON.stringify(initial, null, 2), 'utf-8');
    setCwd(tempDir);
    const { syncStoreToJson } = await import('../src/data/stores.js');
    await syncStoreToJson({ name: 'newshop', baseUrl: 'https://newshop.com', type: 'shopify' });
    const result = JSON.parse(readFileSync(join(tempDir, 'stores.json'), 'utf-8')) as unknown[];
    expect(result).toHaveLength(2);
  });

  it('skips writing when baseUrl already exists (dedup)', async () => {
    const initial = [{ name: 'stoked', baseUrl: 'https://stokedboardshop.com', type: 'shopify' }];
    writeFileSync(join(tempDir, 'stores.json'), JSON.stringify(initial, null, 2), 'utf-8');
    setCwd(tempDir);
    const { syncStoreToJson } = await import('../src/data/stores.js');
    await syncStoreToJson({ name: 'stoked', baseUrl: 'https://stokedboardshop.com', type: 'shopify' });
    const result = JSON.parse(readFileSync(join(tempDir, 'stores.json'), 'utf-8')) as unknown[];
    expect(result).toHaveLength(1); // still 1, not 2
  });

  it('creates stores.json from scratch when file is missing', async () => {
    setCwd(tempDir); // no stores.json in tempDir
    const { syncStoreToJson } = await import('../src/data/stores.js');
    await syncStoreToJson({ name: 'fresh', baseUrl: 'https://fresh.com', type: 'shopify' });
    const result = JSON.parse(readFileSync(join(tempDir, 'stores.json'), 'utf-8')) as unknown[];
    expect(result).toHaveLength(1);
  });
});
