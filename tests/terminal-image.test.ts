/**
 * TerminalImage source-budget tests.
 *
 * Regression cover for finding O: ProductDetail renders a render-once "crisp real photo",
 * but TerminalImage applied the paged-results-list caps (source ≤128 device px, inline
 * payload ≤12 KB) to it, so a wide detail box upscaled a tiny source → blurry/distorted.
 *
 * The detail context ('photo-detail') must request a much larger source and a much larger
 * inline-byte ceiling, while the paged-list contexts ('art' | 'photo') keep the exact
 * 128 px / 12288-byte caps that prevent a real Ink redraw-corruption bug.
 *
 * These exercise the pure budget helpers directly - no React render, no network - so the
 * numeric caps are asserted with concrete values for both contexts.
 */

import { render } from 'ink-testing-library';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ImageKind,
  inlineByteCeiling,
  LIST_INLINE_BYTES,
  TerminalImage,
  thumbnailUrl,
} from '../src/components/TerminalImage.js';

const SHOPIFY_SRC =
  'https://cdn.shopify.com/s/files/1/0000/0001/products/board.jpg';

/** Pull the requested device-pixel width out of the rewritten Shopify CDN URL. */
function requestedWidth(url: string): number {
  return Number(new URL(url).searchParams.get('width'));
}

describe('thumbnailUrl source-width cap', () => {
  // A 40-cell-wide box is exactly the ProductDetail case (imgW up to ~40 cells).
  const cells = 40;

  it('caps the list context ("photo") at 128 device px even for a wide 40-cell box', () => {
    const w = requestedWidth(thumbnailUrl(SHOPIFY_SRC, cells, 'photo'));
    expect(w).toBe(128);
  });

  it('caps the list context ("art") at 128 device px even for a wide 40-cell box', () => {
    const w = requestedWidth(thumbnailUrl(SHOPIFY_SRC, cells, 'art'));
    expect(w).toBe(128);
  });

  it('requests a much larger source (>128 px, ~cells*6) for the detail context at 40 cells', () => {
    const w = requestedWidth(thumbnailUrl(SHOPIFY_SRC, cells, 'photo-detail'));
    // ~6 device px per cell → 240 px for a 40-cell box, well above the 128 list cap
    // and far below the high detail ceiling.
    expect(w).toBeGreaterThan(128);
    expect(w).toBe(240);
  });

  it('caps the detail source at the larger ceiling for an enormous box', () => {
    // 1000 cells * 6 = 6000 px requested, but the detail cap clamps it.
    const w = requestedWidth(thumbnailUrl(SHOPIFY_SRC, 1000, 'photo-detail'));
    expect(w).toBeGreaterThan(128);
    expect(w).toBeLessThanOrEqual(1024);
    expect(w).toBe(1024);
  });

  it('defaults to the list cap when no kind is supplied', () => {
    expect(requestedWidth(thumbnailUrl(SHOPIFY_SRC, cells))).toBe(128);
  });
});

describe('inlineByteCeiling', () => {
  it('keeps the 12288-byte cap for the list contexts', () => {
    expect(inlineByteCeiling('photo')).toBe(LIST_INLINE_BYTES);
    expect(inlineByteCeiling('art')).toBe(LIST_INLINE_BYTES);
    expect(LIST_INLINE_BYTES).toBe(12_288);
  });

  it('defaults to the 12288-byte list cap when no kind is supplied', () => {
    expect(inlineByteCeiling()).toBe(12_288);
  });

  it('raises the ceiling far above 12288 bytes for the detail context', () => {
    const detail = inlineByteCeiling('photo-detail');
    expect(detail).toBeGreaterThan(LIST_INLINE_BYTES);
    // Render-once / static screen - a multi-hundred-KB payload is safe here.
    expect(detail).toBeGreaterThanOrEqual(1_000_000);
  });
});

// Type-level guard: 'photo-detail' is a valid ImageKind.
const _detailKind: ImageKind = 'photo-detail';
void _detailKind;

// The PLACEHOLDER glyph shown in the reserved box when an image can't be drawn.
const PLACEHOLDER_GLYPH = '▢';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A successful image response - loadBytes validates res.ok + content-type before rendering.
const okImageResponse = () => ({
  ok: true,
  headers: {
    get: (h: string) =>
      h.toLowerCase() === 'content-type' ? 'image/jpeg' : null,
  },
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
});

describe('TerminalImage failure placeholder', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('shows a placeholder when the fetch fails (no bytes available)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const { lastFrame, unmount } = render(
      createElement(TerminalImage, {
        source: 'https://cdn.shopify.com/s/files/board.jpg',
        supportsImages: true,
        kind: 'photo',
      }),
    );
    await sleep(50);
    expect(lastFrame()).toContain(PLACEHOLDER_GLYPH);
    unmount();
  });

  it('shows a placeholder when chafa/execa rejects for art', async () => {
    // execa is mocked per-test to reject like a missing chafa binary.
    vi.doMock('execa', () => ({
      execa: vi.fn().mockRejectedValue(new Error('chafa: command not found')),
    }));
    mockFetch.mockResolvedValue(okImageResponse());
    const { TerminalImage: FreshTerminalImage } = await import(
      '../src/components/TerminalImage.js'
    );
    const { lastFrame, unmount } = render(
      createElement(FreshTerminalImage, {
        source: 'https://cdn.shopify.com/s/files/board.jpg',
        supportsImages: false,
        kind: 'art',
      }),
    );
    await sleep(50);
    expect(lastFrame()).toContain(PLACEHOLDER_GLYPH);
    unmount();
    vi.doUnmock('execa');
  });

  it('does NOT show the placeholder once an inline image renders successfully', async () => {
    mockFetch.mockResolvedValue(okImageResponse());
    const { lastFrame, unmount } = render(
      createElement(TerminalImage, {
        source: 'https://cdn.shopify.com/s/files/board.jpg',
        supportsImages: true,
        kind: 'photo',
      }),
    );
    await sleep(50);
    expect(lastFrame()).not.toContain(PLACEHOLDER_GLYPH);
    unmount();
  });
});
