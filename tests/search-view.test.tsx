/**
 * SearchView tests - uses a mocked runSearch().
 * Verifies product rendering, ComparisonGroup grouping, and empty state.
 * The wizard always supplies initialQuery, so the results view renders
 * immediately on mount.
 */

import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { makePriceRepo } from '../src/data/repos/priceRepo.js';
import type { makeProductRepo } from '../src/data/repos/productRepo.js';
import type { makeSetupRepo } from '../src/data/repos/setupRepo.js';

vi.mock('terminal-image', () => ({
  default: { buffer: vi.fn().mockResolvedValue('[mock-image]') },
}));

vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  }),
);

// Mock runSearch to control what products are returned
vi.mock('../src/agent/search-pipeline.js', () => ({
  runSearch: vi.fn().mockResolvedValue({ products: [], errors: [] }),
}));

// Mock RequestPipeline so SearchView's useRef(new RequestPipeline()) does not fail
vi.mock('../src/data/pipeline.js', () => ({
  RequestPipeline: class MockRequestPipeline {},
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const makeProduct = (
  retailer: string,
  priceCents: number,
  id: string,
  title = 'Never Summer Proto Synthesis',
  extra: Record<string, unknown> = {},
) => ({
  shopify_id: id,
  retailer,
  title,
  handle: 'proto-synthesis',
  vendor: 'Never Summer',
  product_type: 'Snowboard',
  gear_category: 'board' as const,
  waist_width_mm: null,
  flex_rating: null,
  mount_pattern: '4x4' as const,
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
  ...extra,
});

/** A board offered in a single length (cm) - used to exercise length-based ranking. */
const boardOfLength = (id: string, title: string, lengthCm: number) =>
  makeProduct('evo', 50000, id, title, {
    variants_json: JSON.stringify([
      { price: '500.00', compare_at_price: null, option1: String(lengthCm) },
    ]),
  });

/** Wait for an async effect (e.g. the wizard auto-run search) to settle. */
async function settle(ms = 100): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

const mockRepo = () => ({
  list: vi.fn().mockReturnValue([]),
  save: vi.fn().mockReturnValue(1),
  saveSlot: vi.fn().mockReturnValue(7),
  findCompleteSetup: vi.fn().mockReturnValue(null),
  setCompatibility: vi.fn(),
  delete: vi.fn(),
  setAlert: vi.fn(),
  upsert: vi.fn().mockReturnValue(1),
  findById: vi.fn().mockReturnValue(null),
  record: vi.fn(),
  history: vi.fn().mockReturnValue([]),
});

describe('SearchView', () => {
  const profile = {
    bootSize: 10,
    heightCm: 178,
    weightKg: 75,
    ridingStyle: 'all-mountain' as const,
  };

  it('renders the results view (no opener prompt) even when mounted WITHOUT initialQuery', async () => {
    // Discriminating regression guard: the removed opener only ever showed on the
    // initialQuery-absent path, so a test that omits initialQuery is what actually fails
    // against the pre-fix code. (The other tests all pass initialQuery and would pass either way.)
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(80);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('still right? [y/n]'); // pre-fix opener prompt must be gone
    expect(frame).toContain('[/] filters'); // results footer renders instead
  });

  it('shows the results view immediately on mount (no opener)', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        initialFilters: ['board'],
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(80);
    expect(lastFrame()).not.toContain('still right? [y/n]');
    expect(lastFrame()).toContain('[/] filters');
  });

  it('opens the full-screen product view on a card number, and any key returns', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [makeProduct('evo', 49999, '1', 'Capita DOA 2026')],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(80);
    expect(lastFrame()).toContain('Capita DOA 2026'); // list view

    await act(async () => {
      stdin.write('1'); // open card #1's full-screen photo view
    });
    await settle(40);
    expect(lastFrame()).toContain('press any key to go back');

    await act(async () => {
      stdin.write('x'); // any key returns to the list
    });
    await settle(40);
    expect(lastFrame()).not.toContain('press any key to go back');
    expect(lastFrame()).toContain('[/] filters'); // back on the results footer
  });

  it('numbers cards per page so items beyond page 1 are reachable with one digit', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    const products = Array.from({ length: 10 }, (_, i) =>
      makeProduct('evo', 50000 + i, String(i + 1), `Snowboard Model ${i + 1}`),
    );
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products,
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    expect(lastFrame()).toContain('[1] Snowboard Model 1');

    // Advance to page 2 (models 5-8). With page-relative numbering they are [1]-[4], not
    // [5]-[8] - the global scheme is what left items past index 9 unreachable by one digit.
    await act(async () => {
      stdin.write('[C');
    });
    await settle(80);
    const page2 = lastFrame() ?? '';
    expect(page2).toContain('Page 2 of 3');
    expect(page2).toContain('[1] Snowboard Model 5');
    expect(page2).toContain('[4] Snowboard Model 8');
  });

  it('makes a Best-Price comparison group addressable - it carries an [N] and # opens it', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [
        makeProduct('evo', 64999, '1'),
        makeProduct('tactics', 62999, '2'),
      ],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    expect(lastFrame()).toContain('[Best Price]');
    expect(lastFrame()).toContain('[1]'); // comparison group is now selectable

    await act(async () => {
      stdin.write('1'); // open the best-price product's photo view
    });
    await settle(40);
    expect(lastFrame()).toContain('press any key to go back');
  });

  it('passes the just-saved setup id up so a second setup is not hijacked', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [makeProduct('evo', 49999, '1', 'Capita DOA 2026')],
      errors: [],
    });
    const setupRepo = mockRepo();
    const onSetupSaved = vi.fn();
    const { SearchView } = await import('../src/components/SearchView.js');
    const { stdin } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: setupRepo as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved,
        onModalChange: () => {},
      }),
    );
    await settle(80);
    await act(async () => {
      stdin.write('s'); // enter save mode
    });
    await settle(40);
    await act(async () => {
      stdin.write('1'); // item #1
    });
    await settle(20);
    await act(async () => {
      stdin.write('\r'); // submit
    });
    await settle(40);
    // saveSlot returns 7; that id must be handed up so App can tell THIS save apart from any
    // pre-existing complete setup (otherwise every save hijacks back to the old summary).
    expect(onSetupSaved).toHaveBeenCalledWith(7);
  });

  it('renders ComparisonGroup when 2 products share the same normalized title', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [
        makeProduct('evo', 64999, '1'),
        makeProduct('tactics', 62999, '2'),
      ],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    expect(lastFrame()).toContain('[Best Price]');
  });

  it('renders ResultCard for a single-retailer product (no ComparisonGroup)', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [makeProduct('evo', 64999, '1', 'Never Summer V.O.L.E.')],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    expect(lastFrame()).toContain('Never Summer V.O.L.E.');
    expect(lastFrame()).not.toContain('[Best Price]');
  });

  it('ranks results so a board near the recommended length comes first', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    // rider weight 75 → recommended length ≈ 157, so the 157 board must outrank the 144.
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [
        boardOfLength('1', 'FarBoard', 144),
        boardOfLength('2', 'NearBoard', 157),
      ],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[1] NearBoard');
    expect(frame.indexOf('NearBoard')).toBeLessThan(frame.indexOf('FarBoard'));
  });

  it('shows a board-length recommendation derived from the rider profile', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [boardOfLength('1', 'SomeBoard', 157)],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Recommended board length');
    expect(frame).toContain('cm');
  });

  it('keeps a numeric-flex board visible under a matching flex-band chip', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    // "6/10" is a MEDIUM flex board; the medium chip must keep it, not hide it on a substring miss.
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [
        makeProduct('evo', 50000, '1', 'MidFlexBoard', { flex_rating: '6/10' }),
      ],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        initialFilters: ['medium'],
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    expect(lastFrame()).toContain('MidFlexBoard');
  });

  it('renders empty-state copy when a wizard-driven search returns nothing', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(80);
    expect(lastFrame()).toContain('No compatible gear found');
  });

  it('paginates large result sets and pages through them with the arrow keys', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    const products = Array.from({ length: 7 }, (_, i) =>
      makeProduct('evo', 50000 + i, String(i + 1), `Snowboard Model ${i + 1}`),
    );
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products,
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(120);
    const page1 = lastFrame() ?? '';
    // 7 results, 4 per page -> page 1 shows exactly 4 cards (one rounded border each).
    expect(page1).toContain('Page 1 of 2');
    expect((page1.match(/╭/g) ?? []).length).toBe(4);

    // Right arrow advances to page 2, which holds the remaining 3 cards.
    await act(async () => {
      stdin.write('[C');
    });
    await settle(40);
    const page2 = lastFrame() ?? '';
    expect(page2).toContain('Page 2 of 2');
    expect((page2.match(/╭/g) ?? []).length).toBe(3);

    // Left arrow goes back to page 1.
    await act(async () => {
      stdin.write('[D');
    });
    await settle(40);
    expect(lastFrame()).toContain('Page 1 of 2');
  });

  it('renders the filter chip row on mount', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, {
        profile,
        supportsImages: false,
        initialQuery: 'boards',
        setupRepo: mockRepo() as unknown as ReturnType<typeof makeSetupRepo>,
        priceRepo: mockRepo() as unknown as ReturnType<typeof makePriceRepo>,
        productRepo: mockRepo() as unknown as ReturnType<
          typeof makeProductRepo
        >,
        onSetupSaved: () => {},
        onModalChange: () => {},
      }),
    );
    await settle(80);
    const frame = lastFrame() ?? '';
    // All 9 filter chips should be visible
    expect(frame).toContain('[Board:b]');
    expect(frame).toContain('[Binding:i]');
    expect(frame).toContain('[Boot:o]');
  });
});
