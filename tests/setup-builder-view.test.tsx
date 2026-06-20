/**
 * SetupBuilderView tests - the interactive "build a full setup" screen.
 *
 * Renders with seeded candidate products + a rider, with the three repos mocked. Drives stdin
 * through ink-testing-library and wraps writes in act(). Asserts: live per-row badge symbols
 * render, the tray verdict appears once a complete setup is built, pressing 'S' on a complete
 * setup triggers exactly ONE saveSlot with the three product ids and fires onSetupSaved(id),
 * '#'/'p' opens the ProductDetail overlay, Esc calls onBack, and process.exit is NEVER called.
 */

import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedProduct } from '../src/data/normalizer.js';
import type { makePriceRepo } from '../src/data/repos/priceRepo.js';
import type { makeProductRepo } from '../src/data/repos/productRepo.js';
import type { makeSetupRepo } from '../src/data/repos/setupRepo.js';

// No real image subprocess / network when the ProductDetail overlay opens.
vi.mock('terminal-image', () => ({
  default: { buffer: vi.fn().mockResolvedValue('[mock-image]') },
}));

// Guard the "no products supplied" branch from making real HTTP calls (not exercised here,
// since every test passes products, but the import must not pull a live pipeline in).
vi.mock('../src/agent/search-pipeline.js', () => ({
  runSearch: vi.fn().mockResolvedValue({ products: [], errors: [] }),
}));
vi.mock('../src/data/pipeline.js', () => ({
  RequestPipeline: class MockRequestPipeline {},
}));

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const rider = {
  bootSize: 10,
  heightCm: 178,
  weightKg: 75,
  ridingStyle: 'all-mountain' as const,
  skillLevel: 'advanced' as const,
};

function makeProduct(
  id: string,
  title: string,
  category: 'board' | 'binding' | 'boot',
  priceCents: number,
  extra: Record<string, unknown> = {},
): NormalizedProduct {
  return {
    shopify_id: id,
    retailer: 'evo',
    title,
    handle: title.toLowerCase().replace(/ /g, '-'),
    vendor: 'Burton',
    product_type: category,
    gear_category: category,
    flex_rating: null,
    waist_width_mm: null,
    mount_pattern: '4x4',
    mount_pattern_raw: '4x4',
    image_url: null,
    price_cents: priceCents,
    variants_json: JSON.stringify([
      {
        price: (priceCents / 100).toFixed(2),
        compare_at_price: null,
        option1: '157',
      },
    ]),
    fetched_at: Date.now(),
    ...extra,
  };
}

const PRODUCTS: NormalizedProduct[] = [
  makeProduct('b1', 'Capita DOA Board', 'board', 54999),
  makeProduct('b2', 'Never Summer Proto', 'board', 59999),
  makeProduct('i1', 'Union Force Binding', 'binding', 24999),
  makeProduct('i2', 'Burton Cartel Binding', 'binding', 27999),
  makeProduct('o1', 'Burton Ruler Boot', 'boot', 22999),
  makeProduct('o2', 'Adidas Tactical Boot', 'boot', 25999),
];

const mockRepos = () => {
  const setupRepo = {
    list: vi.fn().mockReturnValue([]),
    save: vi.fn().mockReturnValue(1),
    saveSlot: vi.fn().mockReturnValue(7),
    saveComplete: vi.fn().mockReturnValue(42),
    findCompleteSetup: vi.fn().mockReturnValue(null),
    setCompatibility: vi.fn(),
    delete: vi.fn(),
    setAlert: vi.fn(),
  } as unknown as ReturnType<typeof makeSetupRepo>;
  // Distinct PKs per product so the saveSlot assertion is meaningful.
  const idForShopify: Record<string, number> = {
    b1: 101,
    b2: 102,
    i1: 201,
    i2: 202,
    o1: 301,
    o2: 302,
  };
  const productRepo = {
    upsert: vi.fn((p: NormalizedProduct) => idForShopify[p.shopify_id] ?? 999),
    findById: vi.fn().mockReturnValue(null),
    findByRetailer: vi.fn().mockReturnValue([]),
  } as unknown as ReturnType<typeof makeProductRepo>;
  const priceRepo = {
    record: vi.fn(),
    history: vi.fn().mockReturnValue([]),
  } as unknown as ReturnType<typeof makePriceRepo>;
  return { setupRepo, productRepo, priceRepo };
};

async function settle(ms = 20): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

async function press(
  stdin: { write: (s: string) => void },
  key: string,
): Promise<void> {
  await act(async () => {
    stdin.write(key);
    await new Promise<void>((resolve) => setTimeout(resolve, 15));
  });
}

const ENTER = '\r';
const TAB = '\t';
const ESC = '\x1B';

describe('SetupBuilderView', () => {
  it('renders live per-row fit badge symbols for the candidate list', async () => {
    const repos = mockRepos();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { lastFrame } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved: vi.fn(),
        onBack: vi.fn(),
        supportsImages: false,
      }),
    );
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Capita DOA Board');
    // A live badge symbol (pass/warn/fail/unknown) renders on each candidate row.
    expect(frame).toMatch(/[✓⚠✗·]/);
  });

  it('renders the whole-setup tray verdict once board+binding+boot are all chosen', async () => {
    const repos = mockRepos();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { lastFrame, stdin } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved: vi.fn(),
        onBack: vi.fn(),
        supportsImages: false,
      }),
    );
    await settle();
    // Before a full setup, the tray shows the building placeholder and NO completed verdict
    // (no verdict symbol+word, no "ready to ride"/issue reason) renders.
    const before = lastFrame() ?? '';
    expect(before).toContain('building');
    expect(before).not.toMatch(/✓ compatible|⚠ warn|✗ fail|ready to ride/);

    await press(stdin, ENTER); // pick a board -> advance to binding
    await press(stdin, ENTER); // pick a binding -> advance to boot
    await press(stdin, ENTER); // pick a boot -> setup complete

    const frame = lastFrame() ?? '';
    // The completed-setup verdict (symbol + word, or its reason text) only renders once
    // all three slots are filled. We assert that specific chrome - NOT bare "compatible",
    // which is always present in the "{n} compatible" candidate-count line.
    expect(frame).toMatch(
      /everything fits - ready to ride|✓ compatible|⚠ warn|✗ fail/,
    );
    // ...and the building placeholder is gone now the setup is whole.
    expect(frame).not.toContain('building');
  });

  it("pressing 'S' on a complete setup calls saveComplete exactly once with the three category-correct ids and fires onSetupSaved(id)", async () => {
    const repos = mockRepos();
    const onSetupSaved = vi.fn();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { stdin } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved,
        onBack: vi.fn(),
        supportsImages: false,
      }),
    );
    await settle();
    await press(stdin, ENTER); // board (cursor row 0)
    await press(stdin, ENTER); // binding (cursor row 0)
    await press(stdin, ENTER); // boot (cursor row 0)
    await press(stdin, 'S'); // save

    // A full save INSERTs a fresh complete row via saveComplete - never saveSlot, whose
    // COALESCE-merge would hijack a stale incomplete row left by SearchView.
    expect(repos.setupRepo.saveComplete).toHaveBeenCalledTimes(1);
    expect(repos.setupRepo.saveSlot).not.toHaveBeenCalled();
    const arg = (repos.setupRepo.saveComplete as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    // All three slots are present and are the upserted integer PKs.
    expect(arg).toHaveProperty('boardId');
    expect(arg).toHaveProperty('bindingId');
    expect(arg).toHaveProperty('bootId');
    // Each id falls in its mock PK band: boards 101/102, bindings 201/202, boots 301/302.
    // This proves the right product went into the right slot (no slot cross-wiring).
    expect([101, 102]).toContain(arg.boardId);
    expect([201, 202]).toContain(arg.bindingId);
    expect([301, 302]).toContain(arg.bootId);
    // Each product was upserted and a price snapshot recorded per product.
    expect(repos.productRepo.upsert).toHaveBeenCalledTimes(3);
    expect(repos.priceRepo.record).toHaveBeenCalledTimes(3);
    // saveComplete's returned id (42) is handed up.
    expect(onSetupSaved).toHaveBeenCalledTimes(1);
    expect(onSetupSaved).toHaveBeenCalledWith(42);
  });

  it("does NOT save when the setup is incomplete and 'S' is pressed", async () => {
    const repos = mockRepos();
    const onSetupSaved = vi.fn();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { stdin } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved,
        onBack: vi.fn(),
        supportsImages: false,
      }),
    );
    await settle();
    await press(stdin, ENTER); // only pick a board
    await press(stdin, 'S'); // try to save with an incomplete setup
    expect(repos.setupRepo.saveComplete).not.toHaveBeenCalled();
    expect(repos.setupRepo.saveSlot).not.toHaveBeenCalled();
    expect(onSetupSaved).not.toHaveBeenCalled();
  });

  it("'#' opens the ProductDetail overlay for the cursor product", async () => {
    const repos = mockRepos();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { lastFrame, stdin } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved: vi.fn(),
        onBack: vi.fn(),
        supportsImages: false,
      }),
    );
    await settle();
    await press(stdin, '#');
    expect(lastFrame() ?? '').toContain('press any key to go back');
    // Any key returns to the list.
    await press(stdin, 'x');
    expect(lastFrame() ?? '').not.toContain('press any key to go back');
  });

  it("'p' also opens the ProductDetail overlay", async () => {
    const repos = mockRepos();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { lastFrame, stdin } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved: vi.fn(),
        onBack: vi.fn(),
        supportsImages: false,
      }),
    );
    await settle();
    await press(stdin, 'p');
    expect(lastFrame() ?? '').toContain('press any key to go back');
  });

  it('Esc calls onBack and NEVER calls process.exit', async () => {
    const repos = mockRepos();
    const onBack = vi.fn();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { stdin } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved: vi.fn(),
        onBack,
        supportsImages: false,
      }),
    );
    await settle();
    await press(stdin, ESC);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('tab swaps the active slot', async () => {
    const repos = mockRepos();
    const { SetupBuilderView } = await import(
      '../src/components/SetupBuilderView.js'
    );
    const { lastFrame, stdin } = render(
      React.createElement(SetupBuilderView, {
        products: PRODUCTS,
        rider,
        ...repos,
        onSetupSaved: vi.fn(),
        onBack: vi.fn(),
        supportsImages: false,
      }),
    );
    await settle();
    expect(lastFrame() ?? '').toContain('CHOOSE A BOARD');
    await press(stdin, TAB);
    expect(lastFrame() ?? '').toContain('CHOOSE A BINDING');
  });
});
