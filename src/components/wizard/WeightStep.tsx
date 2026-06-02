/**
 * WeightStep — TextInput step for weight entry (lbs).
 */

import { TextInput } from '@inkjs/ui';
import { Box, Text } from 'ink';
import type React from 'react';

interface WeightStepProps {
  onSubmit: (raw: string) => void;
}

export function WeightStep({ onSubmit }: WeightStepProps): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={0}>
      <Text bold>How much do you weigh?</Text>
      <Text dimColor>e.g. 165 lbs</Text>
      <TextInput placeholder="e.g. 165" onSubmit={onSubmit} />
    </Box>
  );
}
