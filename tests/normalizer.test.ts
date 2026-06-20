import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// parsePriceCents()
// ---------------------------------------------------------------------------

describe('parsePriceCents()', () => {
  it('converts "449.95" to 44995', async () => {
    const { parsePriceCents } = await import('../src/data/normalizer.js');
    expect(parsePriceCents('449.95')).toBe(44995);
  });

  it('converts "0.99" to 99', async () => {
    const { parsePriceCents } = await import('../src/data/normalizer.js');
    expect(parsePriceCents('0.99')).toBe(99);
  });

  it('converts "1000.00" to 100000', async () => {
    const { parsePriceCents } = await import('../src/data/normalizer.js');
    expect(parsePriceCents('1000.00')).toBe(100000);
  });

  it('returns 0 for empty string (safe fallback)', async () => {
    const { parsePriceCents } = await import('../src/data/normalizer.js');
    expect(parsePriceCents('')).toBe(0);
  });

  it('returns 0 for null input (safe fallback)', async () => {
    const { parsePriceCents } = await import('../src/data/normalizer.js');
    expect(parsePriceCents(null)).toBe(0);
  });

  it('returns 0 for non-numeric string (safe fallback)', async () => {
    const { parsePriceCents } = await import('../src/data/normalizer.js');
    expect(parsePriceCents('free')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectGearCategory()
// ---------------------------------------------------------------------------

describe('detectGearCategory()', () => {
  it('detects board from product_type "Snowboards"', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('Snowboards', [], '')).toBe('board');
  });

  it('a lone shop-wide "snowboard" tag (no product_type/title signal) is NOT board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    // Regression for finding Q: the bare 'snowboard' tag is on EVERY listing at a
    // snowboard retailer, so it alone must not win 'board'.
    expect(detectGearCategory('', ['snowboard'], '')).toBeNull();
  });

  it('detects board from "Snowboard" title keyword fallback', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('', [], 'Burton Custom Snowboard 157cm')).toBe(
      'board',
    );
  });

  it('detects binding from product_type "Bindings"', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('Bindings', [], '')).toBe('binding');
  });

  it('detects binding from tags when product_type is empty', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('', ['binding'], '')).toBe('binding');
  });

  it('detects boot from product_type "Snowboard Boots"', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('Snowboard Boots', [], '')).toBe('boot');
  });

  it('detects boot from title keyword fallback', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('', [], 'Thirtytwo Lashed Boot')).toBe('boot');
  });

  it('returns null for unknown category (accessories)', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('Accessories', [], 'Helmet Cover')).toBeNull();
  });

  it('layer 3 (title): "Snowboard Bindings" classifies as binding, not board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory('', [], 'Union Force Snowboard Bindings 2026'),
    ).toBe('binding');
  });

  it('layer 3 (title): "Snowboard Boots" classifies as boot, not board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory('', [], 'Burton Photon Snowboard Boots 2026'),
    ).toBe('boot');
  });

  it('cross-layer: a boot with a bare "snowboard" tag classifies as boot, not board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    // The bare 'snowboard' tag matches the BOARD keyword at the tags layer, but the
    // title carries the dominant 'boot' keyword - boot must win across layers.
    expect(
      detectGearCategory(
        '',
        ['snowboard', 'mens', 'on-sale'],
        'Burton Photon Boots',
      ),
    ).toBe('boot');
  });

  it('cross-layer: a binding with a bare "snowboard" tag classifies as binding, not board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('', ['snowboard'], 'Union Force Bindings')).toBe(
      'binding',
    );
  });

  it('product_type stays authoritative: "Snowboards" type wins board even if title has a stray keyword', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory('Snowboards', ['snowboard'], 'Custom Board'),
    ).toBe('board');
  });

  // -------------------------------------------------------------------------
  // Non-board accessories/apparel must NOT classify as 'board' (finding Q)
  // -------------------------------------------------------------------------

  it('a jacket with a shop-wide "snowboard" tag is NOT classified as board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory(
        'Jackets',
        ['snowboard', 'mens', 'outerwear'],
        "Burton Men's Jacket",
      ),
    ).toBeNull();
  });

  it('snowboard wax is NOT classified as board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(detectGearCategory('Wax', [], 'One Ball Snowboard Wax')).toBeNull();
  });

  it('boardshorts are NOT classified as board (bare "board" substring)', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory('Boardshorts', [], 'Volcom Boardshorts'),
    ).toBeNull();
  });

  it('gloves with a shop-wide "snowboard" tag are NOT classified as board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory('Gloves', ['snowboard'], 'Burton Gore-Tex Gloves'),
    ).toBeNull();
  });

  it('a beanie with a shop-wide "snowboard" tag is NOT classified as board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory('Beanies', ['snowboard'], 'Coal The Frena Beanie'),
    ).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Positive regressions: real gear still classifies correctly
  // -------------------------------------------------------------------------

  it('a real board "Burton Custom Flying V 158" (Snowboards) classifies as board', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory(
        'Snowboards',
        ['snowboard'],
        'Burton Custom Flying V 158',
      ),
    ).toBe('board');
  });

  it('a real binding "Union Force" (Bindings) classifies as binding', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory(
        'Bindings',
        ['snowboard'],
        'Union Force Bindings 2026',
      ),
    ).toBe('binding');
  });

  it('a real boot "Burton Photon" (Snowboard Boots) classifies as boot', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory(
        'Snowboard Boots',
        ['snowboard'],
        'Burton Photon Boots',
      ),
    ).toBe('boot');
  });

  // -------------------------------------------------------------------------
  // Coincidental-substring overmatch (finding: non-board-keyword-substring-overmatch)
  // A real board whose name merely *contains* an accessory keyword as a substring
  // (e.g. "Pantera" contains "pant") must NOT be nulled by the accessory short-circuit.
  // -------------------------------------------------------------------------

  it('"Nitro Pantera Snowboard" (Snowboards) is a board - "pant" substring must not null it', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory(
        'Snowboards',
        ['snowboard'],
        'Nitro Pantera Snowboard',
      ),
    ).toBe('board');
  });

  it('a "GNU ...hat..." board is not nulled by the "hat" keyword (word-boundary match)', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    // "Whatever" contains "hat" but only as a substring, not a standalone token.
    expect(
      detectGearCategory('Snowboards', ['snowboard'], 'GNU Whatever Snowboard'),
    ).toBe('board');
  });

  it('a real accessory "Burton Snowboard Pants" still classifies as null (genuine "pant" token)', async () => {
    const { detectGearCategory } = await import('../src/data/normalizer.js');
    expect(
      detectGearCategory('Pants', [], 'Burton Snowboard Pants'),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// inferMountPattern()
// ---------------------------------------------------------------------------

describe('inferMountPattern()', () => {
  it('returns "channel" for Burton Channel title with Burton vendor', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern(
      'Burton Custom Channel Board',
      'Burton',
      [],
    );
    expect(result.mountPattern).toBe('channel');
  });

  it('returns "channel" for Burton EST title with Burton vendor', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern('Burton EST Binding', 'Burton', []);
    expect(result.mountPattern).toBe('channel');
  });

  it('returns "4x4" (not "channel") for Nitro 3D Channel with non-Burton vendor', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern('Nitro 3D Channel Binding', 'Nitro', []);
    expect(result.mountPattern).toBe('4x4');
  });

  it('returns "2x4" for title containing "2x4"', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern('Generic Board 2x4 compatible', '', []);
    expect(result.mountPattern).toBe('2x4');
  });

  it('returns "4x4" as default for unknown board', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern('Generic All-Mountain Board', '', []);
    expect(result.mountPattern).toBe('4x4');
  });

  it('stores raw string in mountPatternRaw even when defaulting to "4x4"', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern('Generic All-Mountain Board', '', []);
    // mountPatternRaw should be a string (empty string for default)
    expect(typeof result.mountPatternRaw).toBe('string');
  });

  it('stores matched keyword in mountPatternRaw for Burton channel', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern('Burton EST Binding', 'Burton', []);
    expect(result.mountPatternRaw).toBeTruthy();
  });

  it('non-Burton "channel" keyword maps to "4x4" - Burton-exclusive guard active', async () => {
    const { inferMountPattern } = await import('../src/data/normalizer.js');
    const result = inferMountPattern(
      'Sparks Track Channel Board',
      'Sparks',
      [],
    );
    expect(result.mountPattern).toBe('4x4');
  });
});

// ---------------------------------------------------------------------------
// normalizeProduct()
// ---------------------------------------------------------------------------

describe('normalizeProduct()', () => {
  const makeRawProduct = (overrides: Record<string, unknown> = {}) => ({
    id: 123456789,
    title: 'Burton Custom Flying V',
    handle: 'burton-custom-flying-v',
    product_type: 'Snowboards',
    vendor: 'Burton',
    tags: ['snowboard', 'freeride'],
    images: [{ src: 'https://cdn.shopify.com/test.jpg', position: 1 }],
    variants: [{ price: '449.95', compare_at_price: '549.95', option1: '154' }],
    ...overrides,
  });

  it('selects cheapest variant price when multiple variants present', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({
      variants: [
        { price: '549.95', compare_at_price: null, option1: '154' },
        { price: '449.95', compare_at_price: null, option1: '158' },
        { price: '499.95', compare_at_price: null, option1: '162' },
      ],
    });
    const result = normalizeProduct(raw, 'evo');
    expect(result.price_cents).toBe(44995);
  });

  it('prefers the cheapest IN-STOCK variant price', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({
      variants: [
        {
          price: '199.95',
          compare_at_price: null,
          option1: 'S',
          available: false,
        },
        {
          price: '499.95',
          compare_at_price: null,
          option1: 'M',
          available: true,
        },
      ],
    });
    const result = normalizeProduct(raw, 'evo');
    expect(result.price_cents).toBe(49995);
  });

  it('falls back to the global min price when every variant is sold out', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({
      variants: [
        {
          price: '199.95',
          compare_at_price: null,
          option1: 'S',
          available: false,
        },
        {
          price: '299.95',
          compare_at_price: null,
          option1: 'M',
          available: false,
        },
      ],
    });
    const result = normalizeProduct(raw, 'evo');
    expect(result.price_cents).toBe(19995);
  });

  it('uses images[0].src as image_url', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const result = normalizeProduct(makeRawProduct(), 'evo');
    expect(result.image_url).toBe('https://cdn.shopify.com/test.jpg');
  });

  it('returns null image_url when no images', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({ images: [] });
    const result = normalizeProduct(raw, 'evo');
    expect(result.image_url).toBeNull();
  });

  it('stores all variants as JSON string in variants_json', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const variants = [
      { price: '449.95', compare_at_price: null, option1: '154' },
      { price: '499.95', compare_at_price: null, option1: '158' },
    ];
    const raw = makeRawProduct({ variants });
    const result = normalizeProduct(raw, 'evo');
    expect(result.variants_json).toBe(JSON.stringify(variants));
  });

  it('sets fetched_at to a positive Unix ms timestamp', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const result = normalizeProduct(makeRawProduct(), 'evo');
    expect(result.fetched_at).toBeGreaterThan(0);
    expect(typeof result.fetched_at).toBe('number');
  });

  it('converts shopify_id to string', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const result = normalizeProduct(makeRawProduct({ id: 999 }), 'evo');
    expect(result.shopify_id).toBe('999');
    expect(typeof result.shopify_id).toBe('string');
  });

  it('stores retailer name correctly', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const result = normalizeProduct(makeRawProduct(), 'tactics');
    expect(result.retailer).toBe('tactics');
  });

  it('sets waist_width_mm to null (PDP scraping deferred)', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const result = normalizeProduct(makeRawProduct(), 'evo');
    expect(result.waist_width_mm).toBeNull();
  });

  it('handles comma-separated tags string (Shopify API variation)', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({ tags: 'snowboard, freeride, channel' });
    const result = normalizeProduct(raw, 'evo');
    // Burton vendor + channel keyword → channel
    expect(result.mount_pattern).toBe('channel');
  });

  it('detects board gear_category from product_type "Snowboards"', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const result = normalizeProduct(
      makeRawProduct({ product_type: 'Snowboards' }),
      'evo',
    );
    expect(result.gear_category).toBe('board');
  });

  it('price_cents is 0 when variants array is empty (edge case)', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({ variants: [] });
    const result = normalizeProduct(raw, 'evo');
    expect(result.price_cents).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Malformed-product defensiveness (finding: normalizer-throws-on-malformed-product)
  // The documented contract is "never throw; unparseable -> null / safe fields".
  // -------------------------------------------------------------------------

  it('does not throw when variants is missing entirely', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    const raw = makeRawProduct({ variants: undefined }) as any;
    expect(() => normalizeProduct(raw, 'evo')).not.toThrow();
    const result = normalizeProduct(raw, 'evo');
    expect(result.price_cents).toBe(0);
    expect(result.variants_json).toBe('[]');
  });

  it('does not throw when images is missing entirely (array, not just element)', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    const raw = makeRawProduct({ images: undefined }) as any;
    expect(() => normalizeProduct(raw, 'evo')).not.toThrow();
    expect(normalizeProduct(raw, 'evo').image_url).toBeNull();
  });

  it('does not throw when tags is missing/null', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    const raw = makeRawProduct({ tags: null }) as any;
    expect(() => normalizeProduct(raw, 'evo')).not.toThrow();
    // No tags signal - relies on product_type/title only.
    expect(normalizeProduct(raw, 'evo').gear_category).toBe('board');
  });

  it('defaults title/handle to empty string when missing (does not throw)', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({
      title: undefined,
      handle: undefined,
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    }) as any;
    expect(() => normalizeProduct(raw, 'evo')).not.toThrow();
    const result = normalizeProduct(raw, 'evo');
    expect(result.title).toBe('');
    expect(result.handle).toBe('');
  });

  it('a fully malformed product (missing variants/images/tags/title) yields safe fields without throwing', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    // Only the id is present - everything else is missing.
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    const raw = { id: 42 } as any;
    expect(() => normalizeProduct(raw, 'evo')).not.toThrow();
    const result = normalizeProduct(raw, 'evo');
    expect(result.shopify_id).toBe('42');
    expect(result.title).toBe('');
    expect(result.handle).toBe('');
    expect(result.image_url).toBeNull();
    expect(result.price_cents).toBe(0);
    expect(result.variants_json).toBe('[]');
    expect(result.gear_category).toBeNull();
  });

  it('a coincidental-substring board ("Nitro Pantera Snowboard") normalizes as a board', async () => {
    const { normalizeProduct } = await import('../src/data/normalizer.js');
    const raw = makeRawProduct({
      title: 'Nitro Pantera Snowboard',
      product_type: 'Snowboards',
      vendor: 'Nitro',
      tags: ['snowboard'],
    });
    expect(normalizeProduct(raw, 'evo').gear_category).toBe('board');
  });
});
