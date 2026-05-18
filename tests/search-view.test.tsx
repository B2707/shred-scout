/**
 * SearchView tests — uses mocked runSearch() instead of mock AgentLoop.
 * Verifies product rendering, ComparisonGroup grouping, and empty state.
 * Phase 9: conversational opener (Q1 boot size, Q2 riding style) gates the search
 * TextInput — tests that need the search input must advance past the opener first.
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

/**
 * Advance past the conversational opener by sending 'y' twice (Q1 + Q2).
 * Must be called before any search interaction when SearchView is freshly mounted.
 */
async function advancePastOpener(stdin: { write: (s: string) => void }): Promise<void> {
  // Q1: boot size still right? → 'y' advances to Q2
  await act(async () => { stdin.write('y'); });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });
  // Q2: riding style change anything? → 'y' advances to done
  await act(async () => { stdin.write('y'); });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });
}

async function submitSearch(stdin: { write: (s: string) => void }, query: string): Promise<void> {
  await act(async () => { stdin.write(query); });
  await act(async () => { stdin.write('\r'); });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
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
  const profile = { bootSize: 10, heightCm: 178, weightKg: 75, ridingStyle: 'all-mountain' as const };

  it('renders conversational opener Q1 prompt on initial mount — search box not yet visible', async () => {
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, { profile, supportsImages: false, setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    expect(lastFrame()).toContain('still right? [y/n]');
    expect(lastFrame()).not.toContain('Search for gear...');
  });

  it('renders search box after advancing past opener with two y presses', async () => {
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, { profile, supportsImages: false, setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await advancePastOpener(stdin);
    expect(lastFrame()).toContain('Search for gear...');
    expect(lastFrame()).not.toContain('still right? [y/n]');
  });

  it('renders ComparisonGroup when 2 products share the same normalized title', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [makeProduct('evo', 64999, '1'), makeProduct('tactics', 62999, '2')],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, { profile, supportsImages: false, setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await advancePastOpener(stdin);
    await submitSearch(stdin, 'boards');
    expect(lastFrame()).toContain('[Best Price]');
  });

  it('renders ResultCard for a single-retailer product (no ComparisonGroup)', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [makeProduct('evo', 64999, '1', 'Never Summer V.O.L.E.')],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, { profile, supportsImages: false, setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await advancePastOpener(stdin);
    await submitSearch(stdin, 'boards');
    expect(lastFrame()).toContain('Never Summer V.O.L.E.');
    expect(lastFrame()).not.toContain('[Best Price]');
  });

  it('renders empty state copy after opener when no products have arrived', async () => {
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, { profile, supportsImages: false, setupRepo: mockRepo() as any, priceRepo: mockRepo() as any, productRepo: mockRepo() as any, onSetupSaved: () => {}, onModalChange: () => {} }),
    );
    await advancePastOpener(stdin);
    expect(lastFrame()).toContain('No results yet');
  });
});
