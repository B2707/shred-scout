/**
 * ResultCard component tests — covers PRES-01.
 * terminal-image is mocked to return a fixed ANSI string — no real terminal required.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { render } from 'ink-testing-library';

// Must be hoisted: terminal-image uses async buffer() API — mock before ResultCard import
vi.mock('terminal-image', () => ({
  default: {
    buffer: vi.fn().mockResolvedValue('[mock-image]'),
  },
}));

// Mock fetch to avoid real HTTP in tests
const mockFetch = vi.fn().mockResolvedValue({
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
});
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
});

const baseProduct = {
  shopify_id: '123',
  retailer: 'evo',
  title: 'Never Summer Proto Synthesis',
  handle: 'proto-synthesis',
  vendor: 'Never Summer',
  product_type: 'Snowboard',
  gear_category: 'board' as const,
  waist_width_mm: null,
  mount_pattern: '4x4' as const,
  mount_pattern_raw: '4x4',
  image_url: 'https://cdn.shopify.com/test.jpg',
  price_cents: 64999,
  variants_json: JSON.stringify([{ price: '649.99', compare_at_price: null, option1: 'L' }]),
  fetched_at: Date.now(),
};

describe('ResultCard', () => {
  it('renders product title and price in text-only mode (supportsImages=false)', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, { product: baseProduct, supportsImages: false }),
    );
    expect(lastFrame()).toContain('Never Summer Proto Synthesis');
    expect(lastFrame()).toContain('649.99');
    expect(lastFrame()).toContain('evo');
  });

  it('renders retailer metadata (gear_category · retailer) in text-only mode', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, { product: baseProduct, supportsImages: false }),
    );
    expect(lastFrame()).toContain('board');
    expect(lastFrame()).toContain('evo');
  });

  it('does NOT render image section when supportsImages=false', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, { product: baseProduct, supportsImages: false }),
    );
    expect(lastFrame()).not.toContain('[mock-image]');
  });

  it('sets imageAnsi state when supportsImages=true and image_url is set', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, { product: baseProduct, supportsImages: true }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(lastFrame()).toContain('[mock-image]');
  });

  it('renders text card without image section when image_url is null', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const nullImageProduct = { ...baseProduct, image_url: null };
    const { lastFrame } = render(
      React.createElement(ResultCard, { product: nullImageProduct, supportsImages: true }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(lastFrame()).not.toContain('[mock-image]');
    expect(lastFrame()).toContain('Never Summer Proto Synthesis');
  });

  it('renders SaleDisplay when variants_json contains compare_at_price > price', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const saleProduct = {
      ...baseProduct,
      price_cents: 51999,
      variants_json: JSON.stringify([
        { price: '519.99', compare_at_price: '649.99', option1: 'L' },
      ]),
    };
    const { lastFrame } = render(
      React.createElement(ResultCard, { product: saleProduct, supportsImages: false }),
    );
    expect(lastFrame()).toContain('% OFF');
  });
});
