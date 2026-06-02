/**
 * RidingStyleStep — onboarding riding-style selection. Arrow keys move the highlight,
 * Enter confirms (onChange fires for the highlighted option). Each option shows a small
 * terminal image (the same per-style icons used by the gear wizard).
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { ImageOption } from './ImageOption.js';

const RIDING_OPTIONS: Array<{
  label: string;
  value: string;
  description: string;
  image: string;
}> = [
  {
    label: 'All-Mountain',
    value: 'all-mountain',
    description: 'Ride everywhere — the do-it-all choice.',
    image: 'style-all-mountain.png',
  },
  {
    label: 'Freestyle',
    value: 'freestyle',
    description: 'Creative, playful riding all over the hill.',
    image: 'style-freestyle.png',
  },
  {
    label: 'Freeride',
    value: 'freeride',
    description: 'Off-piste, steeps and big-mountain lines.',
    image: 'style-freeride.png',
  },
  {
    label: 'Backcountry',
    value: 'backcountry',
    description: 'Earn your turns beyond the resort boundary.',
    image: 'style-backcountry.png',
  },
  {
    label: 'Beginner',
    value: 'beginner',
    description: 'New to it — start gentle and forgiving.',
    image: 'style-beginner.png',
  },
];

interface RidingStyleStepProps {
  onChange: (value: string) => void;
}

export function RidingStyleStep({
  onChange,
}: RidingStyleStepProps): React.JSX.Element {
  const supportsImages =
    process.env['TERM_PROGRAM'] === 'iTerm.app' ||
    process.env['KITTY_WINDOW_ID'] !== undefined;
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow)
      setCursor((c) => (c - 1 + RIDING_OPTIONS.length) % RIDING_OPTIONS.length);
    else if (key.downArrow) setCursor((c) => (c + 1) % RIDING_OPTIONS.length);
    else if (key.return) onChange(RIDING_OPTIONS[cursor]!.value);
  });

  return (
    <Box flexDirection="column">
      <Text bold>What is your riding style?</Text>
      {RIDING_OPTIONS.map((o, i) => (
        <ImageOption
          key={o.value}
          label={o.label}
          description={o.description}
          image={o.image}
          selected={i === cursor}
          supportsImages={supportsImages}
        />
      ))}
    </Box>
  );
}
