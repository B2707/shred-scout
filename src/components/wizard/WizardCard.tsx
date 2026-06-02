/**
 * WizardCard — Cyan round-border container with step progress title.
 * Wraps each wizard step with consistent branding and step indicator.
 */

import { Box, Text } from 'ink';
import type React from 'react';

interface WizardCardProps {
  step: 1 | 2 | 3 | 4;
  error: string | null;
  children: React.ReactNode;
}

export function WizardCard({
  step,
  error,
  children,
}: WizardCardProps): React.JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      gap={1}
      width={60}
    >
      <Text>
        <Text bold color="cyanBright">
          Shred Scout
        </Text>
        <Text>{' — Profile Setup ('}</Text>
        <Text color="cyan">{step}</Text>
        <Text dimColor>/4)</Text>
      </Text>
      {children}
      {error !== null && <Text color="red">{error}</Text>}
    </Box>
  );
}
