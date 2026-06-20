/**
 * ImageOption - one row in a wizard selection list: a `❯` highlight marker, a small image, and
 * a label + description. Deliberately NOT boxed - the parent wizard frame is the only border,
 * so a step reads as one clean scannable list rather than a stack of boxes. The selected row is
 * marked with a green `❯` and a bold green label; the others sit quiet and dim.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { resolveAssetPath } from '../../lib/assets.js';
import { TerminalImage } from '../TerminalImage.js';
import { truncateAtWord } from './wizard-config.js';

export interface ImageOptionProps {
  label: string;
  description: string;
  /** Bundled asset filename; omit for text-only options. */
  image?: string;
  selected: boolean;
  supportsImages: boolean;
  /** Thumbnail size in terminal cells. Larger than the old 8×3 so chafa art is legible. */
  imageWidth?: number;
  imageHeight?: number;
  /** Max description width (cells); truncated at a word boundary to avoid mid-word cuts. */
  descWidth?: number;
}

export function ImageOption({
  label,
  description,
  image,
  selected,
  supportsImages,
  imageWidth = 14,
  imageHeight = 5,
  descWidth = 48,
}: ImageOptionProps): React.JSX.Element {
  return (
    <Box flexDirection="row">
      {/* Highlight marker - a fixed-width gutter keeps every row's image/text aligned. */}
      <Box width={2} flexShrink={0}>
        <Text bold color="green">
          {selected ? '❯' : ' '}
        </Text>
      </Box>
      {image && (
        <Box marginRight={1} flexShrink={0}>
          <TerminalImage
            source={resolveAssetPath(image)}
            supportsImages={supportsImages}
            width={imageWidth}
            height={imageHeight}
            kind="art"
          />
        </Box>
      )}
      <Box flexDirection="column" justifyContent="center" flexGrow={1}>
        <Text
          bold={selected}
          color={selected ? 'green' : undefined}
          dimColor={!selected}
        >
          {label}
        </Text>
        <Text dimColor>{truncateAtWord(description, descWidth)}</Text>
      </Box>
    </Box>
  );
}
