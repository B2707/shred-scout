/**
 * SearchView — NL search input + streaming token display + results area.
 *
 * Subscribes to AgentLoop via useAgent (EventEmitter → useReducer bridge).
 * Phase 5: grouped product rendering via groupProducts() + useMemo,
 * ResultCard for single-retailer products, ComparisonGroup for multi-retailer matches,
 * empty state when no products have arrived, and supportsImages prop threading.
 */
import React, { useCallback } from 'react';
import { Box, Text, Static } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { AgentLoop } from '../agent/agent-loop.js';
import type { RiderProfile } from '../types/profile.js';
import { useAgent } from '../hooks/useAgent.js';
import { ResultCard } from './ResultCard.js';
import { ComparisonGroup } from './ComparisonGroup.js';
import { groupProducts } from '../types/product-groups.js';
import type { ProductGroup } from '../types/product-groups.js';

export interface SearchViewProps {
  agentLoop: AgentLoop;
  profile: RiderProfile;
  supportsImages: boolean;
}

export function SearchView({ agentLoop, supportsImages }: SearchViewProps): React.JSX.Element {
  const state = useAgent(agentLoop);

  const groups = React.useMemo<ProductGroup[]>(
    () => groupProducts(state.products),
    [state.products],
  );

  const handleSubmit = useCallback(
    (query: string) => {
      // void to satisfy no-floating-promises — agent loop emits results via events
      void agentLoop.run(query);
    },
    [agentLoop],
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={groups}>
        {(group) =>
          group.type === 'comparison' ? (
            <ComparisonGroup
              key={group.normalizedTitle}
              normalizedTitle={group.normalizedTitle}
              products={group.products}
            />
          ) : (
            <ResultCard
              key={group.product.shopify_id}
              product={group.product}
              supportsImages={supportsImages}
            />
          )
        }
      </Static>
      {state.products.length === 0 && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text bold>No results yet</Text>
          <Text dimColor>Type a search above to find compatible gear.</Text>
        </Box>
      )}
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
