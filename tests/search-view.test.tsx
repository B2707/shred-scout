/**
 * SearchView tests — uses mocked runSearch() instead of mock AgentLoop.
 * Verifies product rendering, ComparisonGroup grouping, and empty state.
 * Phase 10: the conversational opener was removed (UI-3); the wizard always supplies
 * initialQuery, so the results view renders immediately on mount.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { render } from 'ink-testing-library';

vi.mock('terminal-image', () => ({
  default: { buffer: vi.fn().mockResolvedValue('[mock-image]') },
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
}));

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

const makeProduct = (retailer: string, priceCents: number, id: string, title = 'Never Summer Proto Synthesis') => ({
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
  variants_json: JSON.stringify([{ price: (priceCents / 100).toFixed(2), compare_at_price: null, option1: 'L' }]),
  fetched_at: Date.now(),
});

/** Wait for an async effect (e.g. the wizard auto-run search) to settle. */
async function settle(ms = 100): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, ms)); });
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
  const profile = { bootSize: 10, heightCm: 178, weightKg: 75, ridingStyle: 'all-mountain' as const };

  it('shows the results view immediately on mount (no opener — UI-3)', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({ products: [], errors: [] });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, { profile, supportsImages: false, initialQuery: 'boards', initialFilters: ['board'], setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await settle(80);
    expect(lastFrame()).not.toContain('still right? [y/n]');
    expect(lastFrame()).toContain('[/] filters');
  });

  it('renders ComparisonGroup when 2 products share the same normalized title', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [makeProduct('evo', 64999, '1'), makeProduct('tactics', 62999, '2')],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, { profile, supportsImages: false, initialQuery: 'boards', setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
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
      React.createElement(SearchView, { profile, supportsImages: false, initialQuery: 'boards', setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await settle(120);
    expect(lastFrame()).toContain('Never Summer V.O.L.E.');
    expect(lastFrame()).not.toContain('[Best Price]');
  });

  it('renders empty-state copy when a wizard-driven search returns nothing', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({ products: [], errors: [] });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, { profile, supportsImages: false, initialQuery: 'boards', setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await settle(80);
    expect(lastFrame()).toContain('No compatible gear found');
  });

  it('renders the filter chip row on mount', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({ products: [], errors: [] });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, { profile, supportsImages: false, initialQuery: 'boards', setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await settle(80);
    const frame = lastFrame()!;
    // All 9 filter chips should be visible
    expect(frame).toContain('[Board:b]');
    expect(frame).toContain('[Binding:i]');
    expect(frame).toContain('[Boot:o]');
  });
});
