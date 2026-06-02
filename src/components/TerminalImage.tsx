/**
 * TerminalImage — renders an image from a local file path OR an http(s) URL, using the
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
}

/** Loads image bytes; for URLs, only returns a successful image/* response (no 404 HTML). */
async function loadBytes(
  source: string,
  signal: AbortSignal,
): Promise<Buffer | null> {
  if (/^https?:\/\//i.test(source)) {
    try {
      const res = await fetch(source, { signal });
      if (!res.ok) return null;
      const contentType = res.headers?.get?.('content-type') ?? '';
      if (!contentType.startsWith('image/')) return null;
      return Buffer.from(await res.arrayBuffer());
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

export function TerminalImage({
  source,
  supportsImages,
  width = 18,
  height = 9,
}: TerminalImageProps): React.JSX.Element {
  const [ansi, setAnsi] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    void (async () => {
      const buf = await loadBytes(source, ctrl.signal);
      if (!buf || cancelled) return;
      try {
        if (supportsImages) {
          // Emit the iTerm2 inline-image (IIP) escape directly. We deliberately avoid
          // terminal-image@4's buffer(): in iTerm2 it auto-selects the Kitty protocol,
          // writes raw escapes straight to stdout (bypassing Ink) and returns an empty
          // string — so the picture never appears in the reserved box. The IIP escape is
          // a plain string Ink can carry through its renderer, and iTerm2 draws it inline
          // at width×height cells.
          const b64 = buf.toString('base64');
          const osc = `]1337;File=inline=1;width=${width};height=${height};preserveAspectRatio=1;size=${buf.length}:${b64}`;
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
        // best-effort: leave the reserved space empty when rendering fails
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [source, supportsImages, width, height]);

  return (
    <Box width={width} height={height} flexShrink={0}>
      {ansi ? <Text>{ansi}</Text> : null}
    </Box>
  );
}
