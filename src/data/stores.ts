/**
 * Dynamic store configuration loader for Shred Scout.
 *
 * loadStores() reads stores.json from the project root at runtime, enabling
 * users to add, remove, or modify stores without changing source code.
 *
 * Falls back to EMBEDDED_DEFAULTS on any read/parse/schema failure - so the
 * global-install (npx) case works even if stores.json is not bundled.
 *
 * syncStoreToJson() appends a new entry to stores.json, deduplicating on baseUrl.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RetailerConfigInput } from './repos/retailerRepo.js';

/** A store entry as serialized in stores.json. */
export interface StoreEntry {
  name: string;
  baseUrl: string;
  type: 'shopify' | 'html';
}

/**
 * Embedded defaults - identical to the 10 entries in stores.json.
 * Used as fallback when stores.json is missing, malformed, or has a schema error.
 */
const EMBEDDED_DEFAULTS: StoreEntry[] = [
  { name: 'stoked', baseUrl: 'https://stokedboardshop.com', type: 'shopify' },
  { name: 'thirtytwo', baseUrl: 'https://www.thirtytwo.com', type: 'shopify' },
  { name: 'nidecker', baseUrl: 'https://www.nidecker.com', type: 'shopify' },
  { name: 'bataleon', baseUrl: 'https://www.bataleon.com', type: 'shopify' },
  {
    name: 'jones',
    baseUrl: 'https://www.jonessnowboards.com',
    type: 'shopify',
  },
  {
    name: 'nitro',
    baseUrl: 'https://www.nitrosnowboards.com',
    type: 'shopify',
  },
  { name: 'roxy', baseUrl: 'https://www.roxy.com', type: 'shopify' },
  {
    name: 'springbreak',
    baseUrl: 'https://www.springbreaksnowboards.com',
    type: 'shopify',
  },
  { name: 'korua', baseUrl: 'https://www.korua-shapes.com', type: 'shopify' },
  { name: 'evo', baseUrl: 'https://www.evo.com', type: 'html' },
];

/**
 * Returns the resolved path to stores.json using process.cwd().
 * Does NOT depend on dist/ layout - works for both dev and production installs.
 */
function resolveStoresPath(): string {
  return join(process.cwd(), 'stores.json');
}

/**
 * Validates that a parsed value matches the StoreEntry schema.
 */
function isValidStoreEntries(value: unknown): value is StoreEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).name === 'string' &&
        typeof (entry as Record<string, unknown>).baseUrl === 'string' &&
        ((entry as Record<string, unknown>).type === 'shopify' ||
          (entry as Record<string, unknown>).type === 'html'),
    )
  );
}

/**
 * Loads store configuration from stores.json at process.cwd().
 *
 * On missing file, malformed JSON, or schema validation failure, returns
 * the embedded defaults so callers never receive an empty or thrown result.
 *
 * @returns Array of RetailerConfigInput ready for retailerRepo.seedIfEmpty()
 */
export function loadStores(): RetailerConfigInput[] {
  let entries: StoreEntry[];
  try {
    const raw = readFileSync(resolveStoresPath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoreEntries(parsed)) {
      entries = EMBEDDED_DEFAULTS;
    } else {
      entries = parsed;
    }
  } catch {
    entries = EMBEDDED_DEFAULTS;
  }

  return entries.map((s) => ({
    name: s.name,
    storeUrl: s.baseUrl,
    storefrontToken: null,
  }));
}

/**
 * Appends a new store entry to stores.json - idempotent on baseUrl.
 *
 * Reads the current file (or starts with an empty array if missing/malformed),
 * checks for an existing entry with the same baseUrl, and writes back with
 * 2-space JSON formatting (prevents JSON injection via well-formed serialization).
 */
export async function syncStoreToJson(entry: StoreEntry): Promise<void> {
  let arr: StoreEntry[];
  try {
    const raw = readFileSync(resolveStoresPath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    arr = isValidStoreEntries(parsed) ? parsed : [];
  } catch {
    arr = [];
  }

  // Dedup on baseUrl - idempotent
  if (arr.some((e) => e.baseUrl === entry.baseUrl)) {
    return;
  }

  arr.push(entry);
  writeFileSync(resolveStoresPath(), JSON.stringify(arr, null, 2), 'utf-8');
}
