/**
 * ImageOption — one selectable wizard option: a small terminal image on the left (when the
 * option has one) and a label + description on the right. The whole row is boxed so the
 * highlight (green border + green label) reads clearly and the layout doesn't jump between
 * the selected and unselected states.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { resolveAssetPath } from '../../lib/assets.js';
import { TerminalImage } from '../TerminalImage.js';

export interface ImageOptionProps {
  label: string;
  description: string;
  /** Bundled asset filename; omit for text-only options. */
  image?: string;
  selected: boolean;
  supportsImages: boolean;
}

export function ImageOption({
  label,
  description,
  image,
  selected,
  supportsImages,
}: ImageOptionProps): React.JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor={selected ? 'green' : 'gray'}
      paddingX={1}
      marginBottom={image ? 0 : undefined}
    >
      {image && (
        <Box marginRight={1}>
          <TerminalImage
            source={resolveAssetPath(image)}
            supportsImages={supportsImages}
            width={16}
            height={7}
          />
        </Box>
      )}
      <Box flexDirection="column" justifyContent="center">
        <Text bold color={selected ? 'green' : undefined}>
          {selected ? '▶ ' : '  '}
          {label}
        </Text>
        <Text dimColor={!selected}>{description}</Text>
      </Box>
    </Box>
  );
}
