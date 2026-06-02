/**
 * SearchView tests — uses mocked runSearch() instead of mock AgentLoop.
 * Verifies product rendering, ComparisonGroup grouping, and empty state.
 * Phase 10: the conversational opener was removed (UI-3); the wizard always supplies
 * initialQuery, so the results view renders immediately on mount.
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
) => ({
  shopify_id: id,
  retailer,
  title,
  handle: 'proto-synthesis',
  vendor: 'Never Summer',
  product_type: 'Snowboard',
  gear_category: 'board' as const,
  waist_width_mm: null,
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

  it('renders the results view (no opener prompt) even when mounted WITHOUT initialQuery — guards UI-3', async () => {
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

  it('shows the results view immediately on mount (no opener — UI-3)', async () => {
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

  it('paginates large result sets and pages through them with the arrow keys (SC-04)', async () => {
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
    // 7 results, 5 per page -> page 1 shows exactly 5 cards (one rounded border each).
    expect(page1).toContain('Page 1 of 2');
    expect((page1.match(/╭/g) ?? []).length).toBe(5);

    // Right arrow advances to page 2, which holds the remaining 2 cards.
    await act(async () => {
      stdin.write('[C');
    });
    await settle(40);
    const page2 = lastFrame() ?? '';
    expect(page2).toContain('Page 2 of 2');
    expect((page2.match(/╭/g) ?? []).length).toBe(2);

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
