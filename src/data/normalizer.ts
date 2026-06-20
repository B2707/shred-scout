/**
 * Shopify product normalization utilities for Shred Scout.
 *
 * All functions are pure - no I/O, no side effects.
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

/** Gear category for filtering - maps to the products.gear_category column. */
export type GearCategory = 'board' | 'binding' | 'boot' | null;

/** Mount pattern inference result including the raw source string. */
export interface MountPatternResult {
  /** Normalized mount pattern for the mount_pattern column. */
  mountPattern: MountPattern;
  /** Raw source string stored in mount_pattern_raw column. */
  mountPatternRaw: string;
}

/**
 * The internal normalized product shape - maps 1:1 to the products SQLite table columns.
 * Created by normalizeProduct() from a raw Shopify products.json product object.
 */
export interface NormalizedProduct {
  shopify_id: string; // String(product.id)
  retailer: string; // from RETAILERS constant
  title: string;
  handle: string;
  vendor: string | null;
  product_type: string | null;
  gear_category: GearCategory;
  /** PDP scraping fills this; null for Shopify products */
  flex_rating: string | null;
  waist_width_mm: number | null; // null for Shopify products; PDP scraping fills this
  mount_pattern: MountPattern;
  mount_pattern_raw: string;
  image_url: string | null;
  price_cents: number; // cheapest variant, INTEGER cents
  variants_json: string; // JSON.stringify(variants)
  fetched_at: number; // Unix ms timestamp
}

// ---------------------------------------------------------------------------
// Internal keyword sets
// ---------------------------------------------------------------------------

// NOTE: bare 'board' was removed - it false-matched 'Boardshorts', 'longboard', etc.
// The board signal now requires the compound 'snowboard' in product_type/title.
const BOARD_TYPE_KEYWORDS = ['snowboard'];
const BINDING_TYPE_KEYWORDS = ['binding', 'bindings'];
const BOOT_TYPE_KEYWORDS = ['boot', 'boots'];

// Accessory / apparel keywords. Short-circuited FIRST against product_type + title so
// that a shop-wide 'snowboard' tag (present on EVERY listing at a snowboard retailer)
// can never push a jacket / wax / glove / beanie into the 'board' category.
const NON_BOARD_KEYWORDS = [
  'boardshort',
  'jacket',
  'pant',
  'wax',
  'glove',
  'mitt',
  'beanie',
  'sock',
  'hat',
  'helmet',
  'goggle',
  'bag',
  'tool',
  'stomp',
  'leash',
  'apparel',
  'outerwear',
  'accessor',
  't-shirt',
  'tee',
  'hoodie',
  'sticker',
  'backpack',
];

// Burton-exclusive channel system keywords - ONLY assign 'channel' when vendor is Burton
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
 * Splits a string into lowercase alphanumeric tokens, dropping any non-alphanumeric
 * separators (spaces, hyphens, slashes, colons, etc.). Hyphenated keywords like 't-shirt'
 * tokenize to ['t', 'shirt'] so they match the same way real titles do.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

/**
 * True when an accessory/apparel keyword matches a single token (word-boundary aware), so a
 * coincidental substring can never null a real board:
 *   - Long keywords (>= 5 chars, e.g. 'boardshort', 'accessor', 'outerwear', 'shirt') match
 *     as a substring of a single token so prefixes/compounds still work ('boardshorts',
 *     'accessories'). They are long enough that a substring match inside one token is safe.
 *   - Short keywords (< 5 chars, e.g. 'pant', 'wax', 'hat', 'sock', 'tee', 'bag', 'mitt',
 *     'tool', 'tshirt'->'t'/'shirt') match only the exact token OR its simple plural
 *     (keyword + 's'). This blocks coincidental substrings like 'pant' inside 'pantera' or
 *     'hat' inside 'whatever', while still catching 'pants'/'socks'/'hats'.
 *
 * Multi-token keywords (e.g. 't-shirt' -> ['t','shirt']) require ALL of their parts to be
 * present as tokens so the whole compound matches without spanning unrelated words.
 */
function tokenMatchesKeyword(token: string, keywordPart: string): boolean {
  return keywordPart.length >= 5
    ? token.includes(keywordPart)
    : token === keywordPart || token === `${keywordPart}s`;
}

function matchesAccessoryKeyword(text: string): boolean {
  const tokens = tokenize(text);
  if (tokens.length === 0) return false;
  return NON_BOARD_KEYWORDS.some((keyword) => {
    const parts = tokenize(keyword);
    if (parts.length === 0) return false;
    // Every part of the keyword must appear as a token (single-part keywords are the
    // common case; 't-shirt' is the only multi-part keyword).
    return parts.every((part) =>
      tokens.some((token) => tokenMatchesKeyword(token, part)),
    );
  });
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
  title: string,
): GearCategory {
  const pt = productType.toLowerCase();
  const ti = title.toLowerCase();
  const allTags = tags.map((t) => t.toLowerCase());

  // Layer 0: accessory / apparel short-circuit. Runs BEFORE any board match, against
  // product_type + title only (NOT tags - the shop-wide 'snowboard' tag is on every
  // listing and proves nothing). Jackets, wax, gloves, beanies, boardshorts, etc. are
  // not hard gear; returning null here keeps them out of the 'board' bucket. We still let
  // boot/binding win below for genuinely categorizable hard goods, but none of the
  // accessory keywords overlap with boot/binding so this short-circuit is safe.
  //
  // Matching is token-based (word boundaries) so a coincidental substring cannot null a
  // real board: 'Nitro Pantera' must NOT match the 'pant' keyword, and a 'GNU ...hat...'
  // board must NOT match 'hat'. We additionally only short-circuit when there is no
  // boot/binding signal present, so a genuinely categorizable hard good still wins below.
  const hasBootOrBindingSignal =
    BOOT_TYPE_KEYWORDS.some((k) => pt.includes(k) || ti.includes(k)) ||
    BINDING_TYPE_KEYWORDS.some((k) => pt.includes(k) || ti.includes(k));
  if (
    !hasBootOrBindingSignal &&
    (matchesAccessoryKeyword(pt) || matchesAccessoryKeyword(ti))
  ) {
    return null;
  }

  // Layer 1: product_type - the most authoritative signal, so it gets the first say
  // with full boot > binding > board priority. "Snowboard Boots" contains "snowboard" as
  // a substring but the dominant keyword is "boot"; boot runs first to prevent false board.
  if (BOOT_TYPE_KEYWORDS.some((k) => pt.includes(k))) return 'boot';
  if (BINDING_TYPE_KEYWORDS.some((k) => pt.includes(k))) return 'binding';
  if (BOARD_TYPE_KEYWORDS.some((k) => pt.includes(k))) return 'board';

  // Layers 2+3 (tags + title) - category-major priority ACROSS both layers.
  // A boot/binding keyword in EITHER tags or title must outrank a 'snowboard' keyword:
  // a boot whose only board-ish signal is a generic 'snowboard' tag (common on every
  // snowboard-shop listing) must not be misclassified as a board. Checking each category
  // across both layers - instead of finishing the tags layer before the title layer - is
  // what keeps boot/binding ahead of board.
  const matchesIn = (keywords: string[]): boolean =>
    allTags.some((t) => keywords.some((k) => t.includes(k))) ||
    keywords.some((k) => ti.includes(k));

  if (matchesIn(BOOT_TYPE_KEYWORDS)) return 'boot';
  if (matchesIn(BINDING_TYPE_KEYWORDS)) return 'binding';

  // Board requires a REAL board signal - the compound 'snowboard' in product_type or
  // title. A lone shop-wide 'snowboard' tag on an accessory must not win, so the board
  // check deliberately ignores the tags layer (tags can mention 'snowboard' for anything).
  if (BOARD_TYPE_KEYWORDS.some((k) => pt.includes(k) || ti.includes(k))) {
    return 'board';
  }

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
  tags: string[],
): MountPatternResult {
  const ti = title.toLowerCase();
  const ve = (vendor ?? '').toLowerCase();
  const allTags = tags.map((t) => t.toLowerCase());
  const allText = [ti, ...allTags].join(' ');

  // Burton Channel (EST/Re:Flex) - Burton-exclusive, check vendor first
  const isBurton = ve.includes('burton');
  const hasBurtonChannelKeyword = BURTON_CHANNEL_KEYWORDS.some((k) =>
    allText.includes(k),
  );
  if (isBurton && hasBurtonChannelKeyword) {
    const matched =
      BURTON_CHANNEL_KEYWORDS.find((k) => allText.includes(k)) ?? 'channel';
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
    /** Shopify variant in-stock flag. Absent (undefined) is treated as in-stock. */
    available?: boolean;
  }>;
}

/**
 * Normalizes a raw Shopify product JSON object to the NormalizedProduct shape.
 *
 * Called for every product returned by fetchAllProducts(). Pure function -
 * no I/O, no side effects, returns null fields for unparseable data.
 *
 * @param raw - Raw product from Shopify products.json
 * @param retailer - Retailer name from RETAILERS constant (e.g. 'evo')
 */
export function normalizeProduct(
  raw: ShopifyProductInput,
  retailer: string,
): NormalizedProduct {
  // Defensive: a malformed listing must never throw - the documented contract is
  // "unparseable -> null / safe fields". Coalesce every array/string field that the
  // logic below indexes into or calls methods on, so one bad product cannot crash a
  // whole store fetch.
  const title = typeof raw.title === 'string' ? raw.title : '';
  const handle = typeof raw.handle === 'string' ? raw.handle : '';
  const productType =
    typeof raw.product_type === 'string' ? raw.product_type : '';
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const images = Array.isArray(raw.images) ? raw.images : [];

  // Normalize tags to array. tags may be a comma-separated string, an array, or
  // missing/null entirely (treated as no tags).
  const tags: string[] = Array.isArray(raw.tags)
    ? raw.tags
    : typeof raw.tags === 'string'
      ? raw.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

  // Cheapest IN-STOCK variant price (positive prices only). A sold-out cheap variant must
  // not become the displayed price or win [Best Price]. Fall back to all variants
  // only when every variant is sold out.
  const inStock = variants.filter((v) => v.available !== false);
  const pricePool = inStock.length > 0 ? inStock : variants;
  const positiveCents = pricePool
    .map((v) => parsePriceCents(v.price))
    .filter((c) => c > 0);
  const priceCents =
    positiveCents.length > 0 ? Math.min(...positiveCents) : Infinity;

  const { mountPattern, mountPatternRaw } = inferMountPattern(
    title,
    raw.vendor ?? '',
    tags,
  );

  return {
    shopify_id: String(raw.id),
    retailer,
    title,
    handle,
    vendor: raw.vendor ?? null,
    product_type: raw.product_type ?? null,
    gear_category: detectGearCategory(productType, tags, title),
    flex_rating: null,
    waist_width_mm: null,
    mount_pattern: mountPattern,
    mount_pattern_raw: mountPatternRaw,
    image_url: images[0]?.src ?? null,
    // Infinity → no variants present (reduce over empty array). We store 0 as the
    // sentinel; downstream callers must check variants_json length to distinguish
    // "free product (price = 0)" from "no variants yet (price = 0)".
    price_cents: Number.isFinite(priceCents) ? priceCents : 0,
    variants_json: JSON.stringify(variants),
    fetched_at: Date.now(),
  };
}
