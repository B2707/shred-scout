/**
 * SearchView — NL search input + loading state + results area.
 *
 * Calls runSearch() directly via useState + async handleSubmit.
 * No AgentLoop, no useAgent, no EventEmitter — plain async await.
 * Phase 8: deterministic search pipeline wired directly into UI state.
 */
import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, Static } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import { RequestPipeline } from '../data/pipeline.js';
import { runSearch } from '../agent/search-pipeline.js';
import { ResultCard } from './ResultCard.js';
import { ComparisonGroup } from './ComparisonGroup.js';
import { groupProducts } from '../types/product-groups.js';
import type { ProductGroup } from '../types/product-groups.js';

export interface SearchViewProps {
  profile: RiderProfile;
  supportsImages: boolean;
}

export function SearchView({ profile, supportsImages }: SearchViewProps): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [searchErrors, setSearchErrors] = useState<string[]>([]);
  const pipelineRef = useRef<RequestPipeline>(new RequestPipeline());

  const groups = React.useMemo<ProductGroup[]>(() => groupProducts(products), [products]);

  const handleSubmit = useCallback((query: string) => {
    if (isLoading) return;
    void (async () => {
      setIsLoading(true);
      setProducts([]);
      setSearchErrors([]);
      try {
        const { products: found, errors } = await runSearch(query, profile, pipelineRef.current);
        setProducts(found);
        setSearchErrors(errors);
      } catch (err) {
        setSearchErrors([err instanceof Error ? err.message : String(err)]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isLoading, profile]);

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
      {products.length === 0 && !isLoading && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Text bold>No results yet</Text>
          <Text dimColor>Type a search above to find compatible gear.</Text>
        </Box>
      )}
      {searchErrors.length > 0 && (
        <Box flexDirection="column">
          {searchErrors.map((err, i) => (
            <Text key={i} color="yellow">{err}</Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        {isLoading
          ? <Text dimColor>Searching...</Text>
          : <TextInput placeholder="Search for gear..." onSubmit={handleSubmit} />
        }
      </Box>
    </Box>
  );
}
