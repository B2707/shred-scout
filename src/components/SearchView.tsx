/**
 * SearchView — NL search input + streaming token display + results area.
 *
 * Subscribes to AgentLoop via useAgent (EventEmitter → useReducer bridge).
 * The Phase 4 surface is intentionally minimal — Phase 5 will add image
 * rendering, side-by-side comparison, sale highlighting, and rich token
 * formatting on top of this component.
 */
import React, { useCallback } from 'react';
import { Box, Text, Static } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { AgentLoop } from '../agent/agent-loop.js';
import type { RiderProfile } from '../types/profile.js';
import { useAgent } from '../hooks/useAgent.js';

export interface SearchViewProps {
  agentLoop: AgentLoop;
  profile: RiderProfile;
}

export function SearchView({ agentLoop }: SearchViewProps): React.JSX.Element {
  const state = useAgent(agentLoop);

  const handleSubmit = useCallback(
    (query: string) => {
      // void to satisfy no-floating-promises — agent loop emits results via events
      void agentLoop.run(query);
    },
    [agentLoop],
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={state.products}>
        {(p) => (
          <Text key={p.shopify_id}>
            {p.title} — ${(p.price_cents / 100).toFixed(2)} ({p.retailer})
          </Text>
        )}
      </Static>
      {state.tokens.length > 0 && (
        <Box>
          <Text dimColor>{state.tokens}</Text>
        </Box>
      )}
      {state.error !== null && (
        <Box>
          <Text color="red">Error: {state.error.code}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <TextInput placeholder="Refine search (e.g. 'only stiff boards')..." onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}
