import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface ApiKeyStepProps {
  onSubmit: (key: string) => void;
}

export function ApiKeyStep({ onSubmit }: ApiKeyStepProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(raw: string): void {
    const key = raw.trim();
    if (!key.startsWith('sk-ant-') || key.length < 20) {
      setError('Must be a valid Anthropic API key (starts with sk-ant-)');
      return;
    }
    setError(null);
    onSubmit(key);
  }

  return (
    <Box flexDirection="column" gap={0}>
      <Text bold>Paste your Anthropic API key</Text>
      <Text dimColor>Get yours at platform.anthropic.com → API Keys</Text>
      {error && <Text color="red">{error}</Text>}
      <TextInput placeholder="sk-ant-..." onSubmit={handleSubmit} />
    </Box>
  );
}
