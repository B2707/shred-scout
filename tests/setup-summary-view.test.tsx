/**
 * SetupSummaryView tests — renders the "Setup Complete" summary screen
 * after all three gear slots (board, binding, boot) have been saved.
 */

import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedProduct } from '../src/data/normalizer.js';
import type { makeProductRepo } from '../src/data/repos/productRepo.js';
import type { SavedSetup } from '../src/data/repos/setupRepo.js';

type ProductRepo = ReturnType<typeof makeProductRepo>;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeSetup(overrides: Partial<SavedSetup> = {}): SavedSetup {
  return {
    id: 1,
    boardId: 10,
    bindingId: 20,
    bootId: 30,
    compatibility: null,
    savedAt: Date.now(),
    alertEnabled: false,
    ...overrides,
  };
}

function makeProduct(
  id: number,
  title: string,
  priceCents: number,
  category: 'board' | 'binding' | 'boot',
): NormalizedProduct {
  return {
    shopify_id: String(id),
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
        option1: 'L',
      },
    ]),
    fetched_at: Date.now(),
  };
}

const BOARD = makeProduct(10, 'Burton Custom Flying V', 64999, 'board');
const BINDING = makeProduct(20, 'Union Force Bindings', 24999, 'binding');
const BOOT = makeProduct(30, 'Burton Ruler BOA Boots', 22999, 'boot');

const mockProductRepo = (
  overrides: Record<number, NormalizedProduct | null> = {},
): ProductRepo =>
  ({
    findById: vi.fn((id: number) => {
      if (id in overrides) return overrides[id];
      if (id === 10) return BOARD;
      if (id === 20) return BINDING;
      if (id === 30) return BOOT;
      return null;
    }),
    upsert: vi.fn().mockReturnValue(1),
    findByRetailer: vi.fn().mockReturnValue([]),
  }) as unknown as ProductRepo;

const mockRider = {
  bootSize: 10,
  heightCm: 178,
  weightKg: 75,
  ridingStyle: 'all-mountain',
};

describe('SetupSummaryView', () => {
  it('renders the Setup Complete heading', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const { lastFrame } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup(),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch: vi.fn(),
      }),
    );
    expect(lastFrame()).toContain('Setup Complete');
  });

  it('renders three product rows with title and price', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const { lastFrame } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup(),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch: vi.fn(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Burton Custom Flying V');
    expect(frame).toContain('Union Force Bindings');
    expect(frame).toContain('Burton Ruler BOA Boots');
    expect(frame).toContain('$649.99');
    expect(frame).toContain('$249.99');
    expect(frame).toContain('$229.99');
  });

  it('renders the compatibility verdict line when all rules pass', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const { lastFrame } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup(),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch: vi.fn(),
      }),
    );
    // Verdict should appear (pass/warn/fail)
    const frame = lastFrame() ?? '';
    expect(frame.toLowerCase()).toMatch(/pass|warn|fail/);
  });

  it('pressing q invokes onWishlist callback', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const onWishlist = vi.fn();
    const { stdin } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup(),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist,
        onNewSearch: vi.fn(),
      }),
    );
    await act(async () => {
      stdin.write('q');
    });
    expect(onWishlist).toHaveBeenCalledOnce();
  });

  it('pressing n invokes onNewSearch callback', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const onNewSearch = vi.fn();
    const { stdin } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup(),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch,
      }),
    );
    await act(async () => {
      stdin.write('n');
    });
    expect(onNewSearch).toHaveBeenCalledOnce();
  });

  it('offers a price-alert opt-in on the Setup Complete screen', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const { lastFrame } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup({ alertEnabled: false }),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch: vi.fn(),
        onToggleAlert: vi.fn(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame.toLowerCase()).toContain('price alert');
    expect(frame).toContain('[a]');
  });

  it('pressing a enables the price alert and flips the status', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const onToggleAlert = vi.fn();
    const { stdin, lastFrame } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup({ id: 7, alertEnabled: false }),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch: vi.fn(),
        onToggleAlert,
      }),
    );
    await act(async () => {
      stdin.write('a');
    });
    expect(onToggleAlert).toHaveBeenCalledWith(7, true);
    expect((lastFrame() ?? '').toLowerCase()).toMatch(/price alert on/);
  });

  it('pressing a twice toggles the alert back off', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    const onToggleAlert = vi.fn();
    const { stdin } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup({ id: 7, alertEnabled: false }),
        productRepo: mockProductRepo(),
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch: vi.fn(),
        onToggleAlert,
      }),
    );
    await act(async () => {
      stdin.write('a');
    });
    await act(async () => {
      stdin.write('a');
    });
    expect(onToggleAlert).toHaveBeenLastCalledWith(7, false);
  });

  it('renders error line when productRepo.findById returns null for a slot', async () => {
    const { SetupSummaryView } = await import(
      '../src/components/SetupSummaryView.js'
    );
    // Make boardId=10 return null (product deleted)
    const brokenRepo = mockProductRepo({ 10: null });
    const { lastFrame } = render(
      React.createElement(SetupSummaryView, {
        setup: makeSetup(),
        productRepo: brokenRepo,
        rider: mockRider,
        onWishlist: vi.fn(),
        onNewSearch: vi.fn(),
      }),
    );
    expect(lastFrame()).toContain('deleted');
  });
});
