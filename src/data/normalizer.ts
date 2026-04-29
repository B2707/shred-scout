/**
 * Shopify product normalization utilities for Shred Scout.
 *
 * All functions are pure — no I/O, no side effects.
 * Maps raw Shopify storefront JSON to the internal NormalizedProduct shape
 * that feeds directly into the products SQLite table.
 *
 * Key invariants:
 * - Prices are always INTEGER cents (Math.round(parseFloat(price) * 100))
 * - mountPattern 'channel' is Burton-exclusive: only assigned when vendor is Burton
 *   AND title/tags contain EST/Re:Flex/Channel keywords
 * - Unknown/unparseable fields default to null (never throw)
 * - gear_category uses layered heuristic: product_type → tags → title keywords
 */
import type { MountPattern } from '../domain/compatibility/types.js';

/** Gear category for filtering — maps to the products.gear_category column. */
export type GearCategory = 'board' | 'binding' | 'boot' | null;

/** Mount pattern inference result including the raw source string. */
export interface MountPatternResult {
  /** Normalized mount pattern for the mount_pattern column. */
  mountPattern: MountPattern;
  /** Raw source string stored in mount_pattern_raw column. */
  mountPatternRaw: string;
}

/**
 * The internal normalized product shape — maps 1:1 to the products SQLite table columns.
 * Created by normalizeProduct() from a raw Shopify products.json product object.
 */
export interface NormalizedProduct {
  shopify_id: string;           // String(product.id)
  retailer: string;             // from RETAILERS constant
  title: string;
  handle: string;
  vendor: string | null;
  product_type: string | null;
  gear_category: GearCategory;
  waist_width_mm: null;         // always null in Phase 3; Phase 7 PDP scraping fills this
  mount_pattern: MountPattern;
  mount_pattern_raw: string;
  image_url: string | null;
  price_cents: number;          // cheapest variant, INTEGER cents
  variants_json: string;        // JSON.stringify(variants)
  fetched_at: number;           // Unix ms timestamp
}

// ---------------------------------------------------------------------------
// Internal keyword sets
// ---------------------------------------------------------------------------

const BOARD_TYPE_KEYWORDS = ['snowboard', 'board'];
const BINDING_TYPE_KEYWORDS = ['binding', 'bindings'];
const BOOT_TYPE_KEYWORDS = ['boot', 'boots'];

// Burton-exclusive channel system keywords — ONLY assign 'channel' when vendor is Burton
const BURTON_CHANNEL_KEYWORDS = ['channel', 'est', 're:flex', 'reflex'];

// ---------------------------------------------------------------------------
// Exported pure helper functions
// ---------------------------------------------------------------------------

/**
 * Converts a Shopify price string (e.g. "449.95") to integer cents (44995).
 * Uses Math.round to avoid IEEE 754 float errors.
 * Returns 0 for empty, null, or unparseable inputs.
 */
export function parsePriceCents(price: string | null | undefined): number {
  if (!price) return 0;
  const n = parseFloat(price);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Detects gear category using the layered heuristic:
 * 1. product_type field (merchant-controlled, check for known keywords)
 * 2. tags array (scan for gear keywords)
 * 3. title string (keyword fallback)
 *
 * Returns null for unknown categories (accessories, apparel, etc.)
 *
 * @param productType - Shopify product_type field value
 * @param tags - Normalized tags array
 * @param title - Product title string
 */
export function detectGearCategory(
  productType: string,
  tags: string[],
  title: string
): GearCategory {
  const pt = productType.toLowerCase();
  const ti = title.toLowerCase();
  const allTags = tags.map(t => t.toLowerCase());

  // Layer 1: product_type
  // Check boot before board — "Snowboard Boots" contains "board" as a substring
  // but the dominant keyword is "boot"; boot check runs first to prevent false board classification.
  if (BOOT_TYPE_KEYWORDS.some(k => pt.includes(k))) return 'boot';
  if (BINDING_TYPE_KEYWORDS.some(k => pt.includes(k))) return 'binding';
  if (BOARD_TYPE_KEYWORDS.some(k => pt.includes(k))) return 'board';

  // Layer 2: tags — same priority order as layer 1: boot > binding > board.
  // "Snowboard Boots" tags contain 'snowboard' (a BOARD keyword) so boot must
  // be checked first to prevent false board classification.
  if (allTags.some(t => BOOT_TYPE_KEYWORDS.some(k => t.includes(k)))) return 'boot';
  if (allTags.some(t => BINDING_TYPE_KEYWORDS.some(k => t.includes(k)))) return 'binding';
  if (allTags.some(t => BOARD_TYPE_KEYWORDS.some(k => t.includes(k)))) return 'board';

  // Layer 3: title keywords
  if (BOARD_TYPE_KEYWORDS.some(k => ti.includes(k))) return 'board';
  if (BINDING_TYPE_KEYWORDS.some(k => ti.includes(k))) return 'binding';
  if (BOOT_TYPE_KEYWORDS.some(k => ti.includes(k))) return 'boot';

  return null;
}

/**
 * Infers the mount pattern from product title, vendor, and tags.
 *
 * CRITICAL INVARIANT: mountPattern='channel' is ONLY assigned when:
 * - vendor is 'burton' (case-insensitive), AND
 * - title or tags contain 'channel', 'est', or 're:flex'
 *
 * Non-Burton products with 'channel' in their name (Nitro 3D, Sparks track, etc.)
 * MUST map to '4x4' to prevent false compatibility verdicts in discToMount().
 *
 * @param title - Product title
 * @param vendor - Product vendor string
 * @param tags - Normalized tags array
 * @returns MountPatternResult with both normalized and raw values
 */
export function inferMountPattern(
  title: string,
  vendor: string,
  tags: string[]
): MountPatternResult {
  const ti = title.toLowerCase();
  const ve = (vendor ?? '').toLowerCase();
  const allTags = tags.map(t => t.toLowerCase());
  const allText = [ti, ...allTags].join(' ');

  // Burton Channel (EST/Re:Flex) — Burton-exclusive, check vendor first
  const isBurton = ve.includes('burton');
  const hasBurtonChannelKeyword = BURTON_CHANNEL_KEYWORDS.some(k => allText.includes(k));
  if (isBurton && hasBurtonChannelKeyword) {
    const matched = BURTON_CHANNEL_KEYWORDS.find(k => allText.includes(k)) ?? 'channel';
    return { mountPattern: 'channel', mountPatternRaw: matched };
  }

  // 2x4 pattern
  if (ti.includes('2x4') || ti.includes('2 x 4')) {
    return { mountPattern: '2x4', mountPatternRaw: '2x4' };
  }

  // Explicit 4x4
  if (ti.includes('4x4') || ti.includes('4 x 4')) {
    return { mountPattern: '4x4', mountPatternRaw: '4x4' };
  }

  // Default: unknown → '4x4'
  return { mountPattern: '4x4', mountPatternRaw: '' };
}

/** Minimal Shopify product shape accepted by normalizeProduct(). */
export interface ShopifyProductInput {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  vendor: string;
  tags: string | string[];
  images: Array<{ src: string; position: number }>;
  variants: Array<{
    price: string;
    compare_at_price: string | null;
    option1: string | null;
  }>;
}

/**
 * Normalizes a raw Shopify product JSON object to the NormalizedProduct shape.
 *
 * Called for every product returned by fetchAllProducts(). Pure function —
 * no I/O, no side effects, returns null fields for unparseable data.
 *
 * @param raw - Raw product from Shopify products.json
 * @param retailer - Retailer name from RETAILERS constant (e.g. 'evo')
 */
export function normalizeProduct(
  raw: ShopifyProductInput,
  retailer: string
): NormalizedProduct {
  // Normalize tags to array
  const tags: string[] = Array.isArray(raw.tags)
    ? raw.tags
    : raw.tags.split(',').map(t => t.trim()).filter(Boolean);

  // Cheapest variant price
  const priceCents = raw.variants.reduce((min, v) => {
    const cents = parsePriceCents(v.price);
    return cents < min ? cents : min;
  }, Infinity);

  const { mountPattern, mountPatternRaw } = inferMountPattern(
    raw.title,
    raw.vendor ?? '',
    tags
  );

  return {
    shopify_id: String(raw.id),
    retailer,
    title: raw.title,
    handle: raw.handle,
    vendor: raw.vendor ?? null,
    product_type: raw.product_type ?? null,
    gear_category: detectGearCategory(raw.product_type ?? '', tags, raw.title),
    waist_width_mm: null,
    mount_pattern: mountPattern,
    mount_pattern_raw: mountPatternRaw,
    image_url: raw.images[0]?.src ?? null,
    // Infinity → no variants present (reduce over empty array). We store 0 as the
    // sentinel; downstream callers must check variants_json length to distinguish
    // "free product (price = 0)" from "no variants yet (price = 0)".
    price_cents: Number.isFinite(priceCents) ? priceCents : 0,
    variants_json: JSON.stringify(raw.variants),
    fetched_at: Date.now(),
  };
}
