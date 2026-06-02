/**
 * TerminalImage — renders an image from a local file path OR an http(s) URL, using the
 * terminal graphics protocol (iTerm2/Kitty) when available and a chafa text-art fallback
 * otherwise. Reserves a fixed width×height box so the Ink layout stays stable while the
 * image resolves asynchronously (and so OSC escape sequences, which Yoga measures as
 * zero-height, still occupy space).
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { readFile } from 'node:fs/promises';
import terminalImage from 'terminal-image';
import { execa } from 'execa';

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
async function loadBytes(source: string, signal: AbortSignal): Promise<Buffer | null> {
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

export function TerminalImage({ source, supportsImages, width = 18, height = 9 }: TerminalImageProps): React.JSX.Element {
  const [ansi, setAnsi] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    void (async () => {
      const buf = await loadBytes(source, ctrl.signal);
      if (!buf || cancelled) return;
      try {
        if (supportsImages) {
          const out = await terminalImage.buffer(buf, { width, height, preserveAspectRatio: true });
          if (!cancelled) setAnsi(out);
        } else {
          const res = await execa(
            'chafa',
            ['--size', `${width}x${height}`, '--format', 'symbols', '--symbols', 'block+border', '-'],
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
