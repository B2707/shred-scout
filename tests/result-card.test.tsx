/**
 * ResultCard component tests.
 * Cards are text-only - real product photos render in a dedicated product view, not inline
 * (inline pixel escapes corrupt through Ink's paged, re-rendering card list). fetch/execa are
 * mocked so no real network or subprocess is required.
 */

import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock execa so the chafa availability check and rendering don't attempt real subprocesses
vi.mock('execa', () => ({
  execa: vi.fn().mockRejectedValue(new Error('chafa not found')),
}));

// A successful image response - ResultCard validates res.ok + content-type before rendering.
const okImageResponse = () => ({
  ok: true,
  headers: {
    get: (h: string) =>
      h.toLowerCase() === 'content-type' ? 'image/jpeg' : null,
  },
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
});

// Mock fetch to avoid real HTTP in tests
const mockFetch = vi.fn().mockResolvedValue(okImageResponse());

// Re-stub fetch before each test so vi.unstubAllGlobals() in afterEach does not
// permanently remove the stub for subsequent tests that rely on it.
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(okImageResponse());
});

const baseProduct = {
  shopify_id: '123',
  retailer: 'evo',
  title: 'Never Summer Proto Synthesis',
  handle: 'proto-synthesis',
  vendor: 'Never Summer',
  product_type: 'Snowboard',
  gear_category: 'board' as const,
  flex_rating: null,
  waist_width_mm: null,
  mount_pattern: '4x4' as const,
  mount_pattern_raw: '4x4',
  image_url: 'https://cdn.shopify.com/test.jpg',
  price_cents: 64999,
  variants_json: JSON.stringify([
    { price: '649.99', compare_at_price: null, option1: 'L' },
  ]),
  fetched_at: Date.now(),
};

describe('ResultCard', () => {
  it('renders product title and price in text-only mode (supportsImages=false)', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: false,
      }),
    );
    expect(lastFrame()).toContain('Never Summer Proto Synthesis');
    expect(lastFrame()).toContain('649.99');
    expect(lastFrame()).toContain('evo');
  });

  it('shows "Price unavailable" instead of $0.00 for an unpriced product', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: { ...baseProduct, price_cents: 0 },
        supportsImages: false,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('$0.00');
    expect(frame).toMatch(/unavailable/i);
  });

  it('shows a compatibility badge for the rider on a board card', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const rider = {
      bootSize: 10,
      heightCm: 180,
      weightKg: 80,
      ridingStyle: 'all-mountain',
    };
    const board = {
      ...baseProduct,
      gear_category: 'board' as const,
      waist_width_mm: 255,
    };
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: board,
        supportsImages: false,
        rider,
      }),
    );
    expect(lastFrame()).toContain('Fits your US 10 boots');
  });

  it('shows a size-availability badge on a boot card', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const rider = {
      bootSize: 10,
      heightCm: 180,
      weightKg: 80,
      ridingStyle: 'all-mountain',
    };
    const boot = {
      ...baseProduct,
      gear_category: 'boot' as const,
      title: 'Thirtytwo Lashed Boot',
      variants_json: JSON.stringify([
        { price: '299.99', compare_at_price: null, option1: '9' },
        { price: '299.99', compare_at_price: null, option1: '10' },
      ]),
    };
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: boot,
        supportsImages: false,
        rider,
      }),
    );
    expect(lastFrame()).toMatch(/US 10/);
  });

  it('omits the compatibility badge when no rider is provided', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: false,
      }),
    );
    expect(lastFrame() ?? '').not.toMatch(/Fits your|unverified|Won't fit/);
  });

  it('renders retailer metadata (gear_category · retailer) in text-only mode', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: false,
      }),
    );
    expect(lastFrame()).toContain('board');
    expect(lastFrame()).toContain('evo');
  });

  it('does NOT render image section when supportsImages=false', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: false,
      }),
    );
    expect(lastFrame()).not.toContain(']1337;File=');
  });

  it('never emits an inline image escape, even when supportsImages=true', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: true,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Cards are text-only - no raw base64 leaks into the results list.
    expect(lastFrame()).not.toContain(']1337;File=');
    expect(lastFrame()).toContain('Never Summer Proto Synthesis');
  });

  it('does NOT render an image when the fetch is a 404 HTML page', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === 'content-type' ? 'text/html' : null,
      },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    });
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: true,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // No corrupt escape sequence decoded from the 404 HTML - image simply omitted.
    expect(lastFrame()).not.toContain(']1337;File=');
  });

  it('renders text card without image section when image_url is null', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const nullImageProduct = { ...baseProduct, image_url: null };
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: nullImageProduct,
        supportsImages: true,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(lastFrame()).not.toContain(']1337;File=');
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
      React.createElement(ResultCard, {
        product: saleProduct,
        supportsImages: false,
      }),
    );
    expect(lastFrame()).toContain('% OFF');
  });

  it('renders spec line when waist_width_mm and flex_rating are set', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const specProduct = {
      ...baseProduct,
      flex_rating: '6/10',
      waist_width_mm: 254,
    };
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: specProduct,
        supportsImages: false,
      }),
    );
    expect(lastFrame()).toContain('254mm');
    expect(lastFrame()).toContain('6/10 flex');
  });

  it('omits spec line when all spec fields are null (Shopify products unchanged)', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: false,
      }),
    );
    // Spec line absent - no ⬙ diamond character
    expect(lastFrame()).not.toContain('⬙');
    // Existing metadata still present
    expect(lastFrame()).toContain('board · evo');
  });

  it('renders round-border top-left corner character ╭ (borderStyle="round")', async () => {
    const { ResultCard } = await import('../src/components/ResultCard.js');
    const { lastFrame } = render(
      React.createElement(ResultCard, {
        product: baseProduct,
        supportsImages: false,
      }),
    );
    // Ink's borderStyle="round" uses ╭ (U+256D) as the top-left corner character
    expect(lastFrame()).toContain('╭');
  });
});
