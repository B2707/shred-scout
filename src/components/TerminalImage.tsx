/**
 * TerminalImage - renders an image from a local file path OR an http(s) URL, using the
 * terminal graphics protocol (iTerm2/Kitty) when available and a chafa text-art fallback
 * otherwise. Reserves a fixed width×height box so the Ink layout stays stable while the
 * image resolves asynchronously (and so OSC escape sequences, which Yoga measures as
 * zero-height, still occupy space).
 */

import { readFile } from 'node:fs/promises';
import { execa } from 'execa';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';

export interface TerminalImageProps {
  /** Local file path or http(s) URL. */
  source: string;
  supportsImages: boolean;
  /** Width in terminal columns. */
  width?: number;
  /** Height in terminal rows. */
  height?: number;
  /**
   * What this image IS, which decides how it's drawn AND which size/byte budget it gets:
   * - 'art'   → illustrative concept art (board profiles, flex, category icons). ALWAYS
   *             rendered as chafa block-art: real measurable characters Ink can lay out and
   *             redraw exactly, so it never desyncs/leaks - works in every terminal.
   * - 'photo' → a real product photo on the PAGED RESULTS LIST. Rendered as a true inline
   *             image (iTerm2/Kitty graphics) when supported; otherwise the caller shows a
   *             link. Kept on the tight list budget (≤128 px source, ≤12 KB inline) because
   *             several of these redraw per frame through Ink's loop.
   * - 'photo-detail' → a real product photo in the RENDER-ONCE detail view (ProductDetail).
   *             Same inline-image rendering as 'photo', but with a MUCH larger source-width
   *             cap and inline-byte ceiling: this screen is static and the image is the last
   *             element with nothing after it, so a large payload can't corrupt later frames.
   *             This is the only context that may upscale to a wide box without blurring.
   * Defaults to 'photo'.
   */
  kind?: ImageKind;
}

export type ImageKind = 'art' | 'photo' | 'photo-detail';

/**
 * PAGED-LIST inline-byte ceiling. Above this, a remote image is dropped rather than emitted
 * as an inline-image escape. Inline images go through Ink's redraw loop, which has a per-frame
 * payload ceiling: a diagnostic showed ~41 KB of images across a frame renders fine but
 * ~120 KB blanks out (iTerm2 itself renders the same bytes fine outside Ink). With 4 cards/page
 * this ~12 KB cap keeps a worst-case frame near the proven-good budget; in practice thumbnails
 * are ~9 KB. The cap also drops full-size images (often 150 KB-2 MB) that would flood the loop.
 *
 * This MUST stay tied to the paged-list contexts ('art'/'photo'). Widening it there reopens a
 * real Ink redraw-corruption bug (base64 leaks as text, stacked frames).
 */
export const LIST_INLINE_BYTES = 12_288;

/**
 * RENDER-ONCE detail-view inline-byte ceiling. The detail screen is static and the photo is the
 * last element with nothing rendered after it, so it never goes through a multi-image redraw -
 * a several-hundred-KB inline payload is safe. We still cap it (rather than fully bypass) so a
 * pathological multi-MB original can't be emitted; a crisp ~512-1024 px thumbnail is well under.
 */
export const DETAIL_INLINE_BYTES = 2_097_152; // 2 MB

/** The inline-byte ceiling for a given image context. Gated strictly: only 'photo-detail' is raised. */
export function inlineByteCeiling(kind: ImageKind = 'photo'): number {
  return kind === 'photo-detail' ? DETAIL_INLINE_BYTES : LIST_INLINE_BYTES;
}

/**
 * Per-context cap on the SOURCE device-pixel width we request from the CDN.
 * - list ('art'/'photo'): 128 px - tight, to keep the inline payload small for Ink's paged
 *   redraw loop. Widening this reopens the same redraw-corruption bug as the byte ceiling.
 * - detail ('photo-detail'): 1024 px - the render-once detail box can be ~40 cells (~240 px)
 *   up to a fullscreen width, so a 128 px source upscales to a blurry mess. A 512-1024 px
 *   source renders crisp; the static screen tolerates the larger payload (see DETAIL_INLINE_BYTES).
 */
const LIST_SOURCE_PX = 128;
const DETAIL_SOURCE_PX = 1024;

/** The source-width cap for a given image context. Gated strictly: only 'photo-detail' is widened. */
export function sourcePxCap(kind: ImageKind = 'photo'): number {
  return kind === 'photo-detail' ? DETAIL_SOURCE_PX : LIST_SOURCE_PX;
}

/**
 * Rewrites a remote image URL to request an appropriately-sized image when the CDN supports
 * on-the-fly resizing. Shopify (the bulk of our retailers) resizes via a `width` query param,
 * so we ask for the size directly - no image-decode/resize dependency. ~6 device px per terminal
 * cell keeps the list payload small for Ink's redraw loop while staying legible; the detail
 * context uses the same per-cell rate but a much higher cap so a wide box stays crisp.
 */
export function thumbnailUrl(
  source: string,
  cells: number,
  kind: ImageKind = 'photo',
): string {
  try {
    const u = new URL(source);
    const isShopify =
      /(^|\.)shopify\.com$/i.test(u.hostname) ||
      /(^|\.)shopifycdn\.com$/i.test(u.hostname) ||
      u.hostname.includes('cdn.shopify');
    if (isShopify) {
      u.searchParams.set(
        'width',
        String(Math.min(sourcePxCap(kind), Math.max(48, cells * 6))),
      );
      return u.toString();
    }
  } catch {
    // not a rewritable URL - fall through and fetch as-is
  }
  return source;
}

/** Loads image bytes; for URLs, only returns a successful, suitably small image/* response. */
async function loadBytes(
  source: string,
  signal: AbortSignal,
  cells: number,
  kind: ImageKind,
): Promise<Buffer | null> {
  if (/^https?:\/\//i.test(source)) {
    try {
      // redirect:'error' so a store cannot bounce an image request to an internal host
      // (SSRF) via a 30x. The http/https scheme is already required by the test above.
      const res = await fetch(thumbnailUrl(source, cells, kind), {
        signal,
        redirect: 'error',
      });
      if (!res.ok) return null;
      const contentType = res.headers?.get?.('content-type') ?? '';
      if (!contentType.startsWith('image/')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      // Never emit an escape larger than this context's budget. The paged list keeps the
      // tight 12 KB cap; the render-once detail view tolerates a much larger crisp payload.
      if (buf.length > inlineByteCeiling(kind)) return null;
      return buf;
    } catch {
      return null;
    }
  }
  try {
    return await readFile(source);
  } catch {
    return null;
  }
}

/**
 * Glyph shown, centered and dimmed, in the reserved image box when the picture can't be
 * drawn (chafa/convert error, fetch failure, no bytes, or an unsupported terminal). A quiet
 * hollow square - enough to signal "an image belongs here" without alarming the user, so the
 * box is never a silent empty gap.
 */
export const PLACEHOLDER_GLYPH = '▢';

export function TerminalImage({
  source,
  supportsImages,
  width = 18,
  height = 9,
  kind = 'photo',
}: TerminalImageProps): React.JSX.Element {
  const [ansi, setAnsi] = useState<string | null>(null);
  // True once an image load/render attempt has resolved without producing drawable output, so
  // the reserved box shows a quiet placeholder instead of a blank gap. Reset whenever the inputs
  // change so a re-render starts a fresh attempt.
  const [failed, setFailed] = useState(false);

  // Concept art always goes through chafa (measurable characters, no inline-image desync);
  // only real product photos (paged-list 'photo' or render-once 'photo-detail') use the
  // terminal's native graphics protocol, and only when the terminal supports it.
  const useInlineImage =
    supportsImages && (kind === 'photo' || kind === 'photo-detail');

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    // Fresh attempt for these inputs: clear any prior placeholder/render.
    setFailed(false);
    setAnsi(null);
    void (async () => {
      const buf = await loadBytes(source, ctrl.signal, width, kind);
      if (cancelled) return;
      // No bytes (fetch failed, non-image response, over budget, or unreadable file): nothing
      // to draw, so surface the placeholder instead of leaving a silent empty gap.
      if (!buf) {
        setFailed(true);
        return;
      }
      try {
        if (useInlineImage) {
          // Emit the iTerm2 inline-image (IIP) escape directly. We deliberately avoid
          // terminal-image@4's buffer(): in iTerm2 it auto-selects the Kitty protocol,
          // writes raw escapes straight to stdout (bypassing Ink) and returns an empty
          // string - so the picture never appears in the reserved box. The IIP escape is
          // a plain string Ink can carry through its renderer, and iTerm2 draws it inline.
          //
          // preserveAspectRatio=0 makes iTerm2 fill EXACTLY width×height cells. With aspect
          // preserved the image renders shorter/narrower than the reserved box, so the terminal
          // cursor lands in a different cell than Ink's layout assumes - and across Ink's
          // per-frame redraws that desync corrupts the escape (base64 leaks as text) and stacks
          // frames. Filling the exact reserved cells keeps iTerm2's cursor in lockstep with Ink.
          // The render-once detail view ('photo-detail') has NOTHING rendered after the image
          // and never redraws, so cursor desync below it is impossible - there we preserve the
          // photo's true aspect ratio so it isn't stretched to fill the box.
          const preserveAspectRatio = kind === 'photo-detail' ? 1 : 0;
          const b64 = buf.toString('base64');
          const osc = `]1337;File=inline=1;width=${width};height=${height};preserveAspectRatio=${preserveAspectRatio};size=${buf.length}:${b64}`;
          if (!cancelled) setAnsi(osc);
        } else {
          const res = await execa(
            'chafa',
            [
              '--size',
              `${width}x${height}`,
              '--format',
              'symbols',
              '--symbols',
              'block+border',
              '-',
            ],
            { input: buf, timeout: 5000, cancelSignal: ctrl.signal },
          );
          if (!cancelled) setAnsi(res.stdout);
        }
      } catch {
        // chafa/convert failed (e.g. the binary is missing) or the inline escape couldn't be
        // built: show the placeholder so the reserved box isn't a silent empty gap.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [source, useInlineImage, width, height, kind]);

  // Quiet placeholder when nothing could be drawn: a dim hollow square centered in the SAME
  // reserved box. It adds no rows/columns of its own (the glyph sits inside the existing
  // width×height Box), so the wizard's height-sensitive layout never shifts. Only shown once an
  // attempt has failed AND there's no successful render to display.
  const showPlaceholder = failed && !ansi;

  return (
    // overflow:hidden clips the rendered art to exactly the reserved cells. chafa emits one
    // extra row beyond the requested height, and clipping it keeps the surrounding layout
    // rock-stable (no row creep → no frame stacking). Harmless for the width-0 inline-image
    // escape, which already sits within bounds.
    <Box
      width={width}
      height={height}
      flexShrink={0}
      // Center the placeholder glyph within the reserved cells without changing the box size.
      alignItems={showPlaceholder ? 'center' : undefined}
      justifyContent={showPlaceholder ? 'center' : undefined}
      // Clip chafa art / the placeholder to exactly the reserved cells (chafa emits 1 extra row)
      // so the layout never creeps. But NOT for a true inline-image escape: Ink clips via
      // slice-ansi, which treats the width-0 OSC sequence as having no visible columns and would
      // slice it away.
      overflow={useInlineImage && !showPlaceholder ? 'visible' : 'hidden'}
    >
      {ansi ? (
        <Text>{ansi}</Text>
      ) : showPlaceholder ? (
        <Text dimColor>{PLACEHOLDER_GLYPH}</Text>
      ) : null}
    </Box>
  );
}
