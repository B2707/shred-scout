/**
 * RidingStyleStep — Select step for riding style selection.
 * Renders all 5 riding style options; onChange fires on Enter.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';

const RIDING_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All-Mountain', value: 'all-mountain' },
  { label: 'Freestyle',    value: 'freestyle'    },
  { label: 'Freeride',     value: 'freeride'     },
  { label: 'Backcountry',  value: 'backcountry'  },
  { label: 'Beginner',     value: 'beginner'     },
];

interface RidingStyleStepProps {
  onChange: (value: string) => void;
}

export function RidingStyleStep({ onChange }: RidingStyleStepProps): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>What is your riding style?</Text>
      <Select
        options={RIDING_OPTIONS}
        visibleOptionCount={5}
        onChange={onChange}
      />
    </Box>
  );
}
