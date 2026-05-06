/**
 * SearchView tests — uses mocked runSearch() instead of mock AgentLoop.
 * Verifies product rendering, ComparisonGroup grouping, and empty state.
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

async function submitSearch(stdin: { write: (s: string) => void }, query: string): Promise<void> {
  await act(async () => { stdin.write(query); });
  await act(async () => { stdin.write('\r'); });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  });
}

describe('SearchView', () => {
  const profile = { bootSize: 10, heightCm: 178, weightKg: 75, ridingStyle: 'all-mountain' as const };

  it('renders ComparisonGroup when 2 products share the same normalized title', async () => {
    const { runSearch } = await import('../src/agent/search-pipeline.js');
    (runSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      products: [makeProduct('evo', 64999, '1'), makeProduct('tactics', 62999, '2')],
      errors: [],
    });
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame, stdin } = render(
      React.createElement(SearchView, { profile, supportsImages: false }),
    );
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
      React.createElement(SearchView, { profile, supportsImages: false }),
    );
    await submitSearch(stdin, 'boards');
    expect(lastFrame()).toContain('Never Summer V.O.L.E.');
    expect(lastFrame()).not.toContain('[Best Price]');
  });

  it('renders empty state copy when no products have arrived', async () => {
    const { SearchView } = await import('../src/components/SearchView.js');
    const { lastFrame } = render(
      React.createElement(SearchView, { profile, supportsImages: false }),
    );
    expect(lastFrame()).toContain('No results yet');
  });
});
