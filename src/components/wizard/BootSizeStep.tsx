/**
 * BootSizeStep — TextInput step for US boot size entry.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface BootSizeStepProps {
  onSubmit: (raw: string) => void;
}

export function BootSizeStep({ onSubmit }: BootSizeStepProps): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={0}>
      <Text bold>What is your boot size?</Text>
      <Text dimColor>US mens size (e.g. 10.5)</Text>
      <TextInput placeholder="e.g. 10.5" onSubmit={onSubmit} />
    </Box>
  );
}
