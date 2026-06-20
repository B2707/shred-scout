/**
 * ProductDetail tests - confirms the render-once detail view requests the FULL-RES image
 * context from TerminalImage (finding O), not the paged-list thumbnail budget.
 *
 * We spy on TerminalImage to capture the props ProductDetail passes it, so we can assert the
 * detail context ('photo-detail') is used. fetch/execa are mocked so no real I/O happens.
 */

import { render } from 'ink-testing-library';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedProduct } from '../src/data/normalizer.js';

vi.mock('execa', () => ({
  execa: vi.fn().mockRejectedValue(new Error('chafa not found')),
}));

// Capture the props the real TerminalImage receives without rendering an image.
const terminalImageProps: Array<Record<string, unknown>> = [];
vi.mock('../src/components/TerminalImage.js', () => ({
  TerminalImage: (props: Record<string, unknown>) => {
    terminalImageProps.push(props);
    return null;
  },
}));

// Imported AFTER the mock so ProductDetail picks up the spy.
const { ProductDetail } = await import('../src/components/ProductDetail.js');

// Build a complete NormalizedProduct (mirrors the makeProduct helper in rank.test.ts) so
// the fixture type-checks against every required field with no `as unknown` coercion.
function makeProduct(
  partial: Partial<NormalizedProduct> = {},
): NormalizedProduct {
  return {
    shopify_id: 'p1',
    retailer: 'evo',
    title: 'Test Board',
    handle: 'test-board',
    vendor: 'Test',
    product_type: 'Snowboard',
    gear_category: 'board',
    flex_rating: '6/10',
    waist_width_mm: 255,
    mount_pattern: '4x4',
    mount_pattern_raw: '4x4',
    image_url: 'https://cdn.shopify.com/s/files/1/0/products/board.jpg',
    price_cents: 49999,
    variants_json: '[]',
    fetched_at: 0,
    ...partial,
  };
}

const baseProduct: NormalizedProduct = makeProduct();

beforeEach(() => {
  terminalImageProps.length = 0;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProductDetail image context', () => {
  it('passes the full-res detail context (kind="photo-detail") to TerminalImage', () => {
    act(() => {
      render(<ProductDetail product={baseProduct} supportsImages={true} />);
    });

    expect(terminalImageProps.length).toBe(1);
    expect(terminalImageProps[0]?.kind).toBe('photo-detail');
  });

  it('still sizes the box up to ~40 cells wide for the detail photo', () => {
    act(() => {
      render(<ProductDetail product={baseProduct} supportsImages={true} />);
    });

    const w = Number(terminalImageProps[0]?.width);
    expect(w).toBeGreaterThan(12);
  });

  it('does not render TerminalImage when there is no image_url', () => {
    act(() => {
      render(
        <ProductDetail
          product={makeProduct({ image_url: null })}
          supportsImages={true}
        />,
      );
    });
    expect(terminalImageProps.length).toBe(0);
  });
});
