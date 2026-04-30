/**
 * SearchView + groupProducts() integration tests — covers PRES-02 grouping logic
 * and supportsImages prop threading.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { render } from 'ink-testing-library';
import { EventEmitter } from 'node:events';

// Mock terminal-image to avoid real image rendering
vi.mock('terminal-image', () => ({
  default: {
    buffer: vi.fn().mockResolvedValue('[mock-image]'),
  },
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeMockAgentLoop() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    run: vi.fn(),
    abort: vi.fn(),
  }) as unknown as import('../src/agent/agent-loop.js').AgentLoop;
}

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

describe('SearchView', () => {
  it('renders ComparisonGroup when 2 products share the same normalized title', async () => {
    const { SearchView } = await import('../src/components/SearchView.js');
    const loop = makeMockAgentLoop();
    const profile = { bootSize: 10, heightCm: 178, weightKg: 75, ridingStyle: 'all-mountain' as const };
    const { lastFrame } = render(
      React.createElement(SearchView, { agentLoop: loop, profile, supportsImages: false }),
    );
    await act(async () => {
      (loop as unknown as EventEmitter).emit('result', [
        makeProduct('evo', 64999, '1'),
        makeProduct('tactics', 62999, '2'),
      ]);
    });
    expect(lastFrame()).toContain('[Best Price]');
  });

  it('renders ResultCard for a single-retailer product (no ComparisonGroup)', async () => {
    const { SearchView } = await import('../src/components/SearchView.js');
    const loop = makeMockAgentLoop();
    const profile = { bootSize: 10, heightCm: 178, weightKg: 75, ridingStyle: 'all-mountain' as const };
    const { lastFrame } = render(
      React.createElement(SearchView, { agentLoop: loop, profile, supportsImages: false }),
    );
    await act(async () => {
      (loop as unknown as EventEmitter).emit('result', [makeProduct('evo', 64999, '1', 'Never Summer V.O.L.E.')]);
    });
    expect(lastFrame()).toContain('Never Summer V.O.L.E.');
    expect(lastFrame()).not.toContain('[Best Price]');
  });

  it('renders empty state copy when no products have arrived', async () => {
    const { SearchView } = await import('../src/components/SearchView.js');
    const loop = makeMockAgentLoop();
    const profile = { bootSize: 10, heightCm: 178, weightKg: 75, ridingStyle: 'all-mountain' as const };
    const { lastFrame } = render(
      React.createElement(SearchView, { agentLoop: loop, profile, supportsImages: false }),
    );
    expect(lastFrame()).toContain('No results yet');
  });
});
