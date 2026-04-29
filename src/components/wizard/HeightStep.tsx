/**
 * HeightStep — TextInput step for height entry (feet/inches or bare cm).
 */
import React from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface HeightStepProps {
  onSubmit: (raw: string) => void;
}

export function HeightStep({ onSubmit }: HeightStepProps): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={0}>
      <Text bold>How tall are you?</Text>
      <Text dimColor>{"e.g. 5'10\" or 178cm"}</Text>
      <TextInput placeholder={"e.g. 5'10\""} onSubmit={onSubmit} />
    </Box>
  );
}
