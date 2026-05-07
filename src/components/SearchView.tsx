/**
 * SearchView — NL search input + loading state + results area + save UX.
 *
 * Calls runSearch() directly via useState + async handleSubmit.
 * No AgentLoop, no useAgent, no EventEmitter — plain async await.
 * Phase 8: deterministic search pipeline wired directly into UI state.
 * Phase 6: save TextInput below results, alert opt-in flow, repo props from App.tsx.
 */
import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, Static, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import { RequestPipeline } from '../data/pipeline.js';
import { runSearch } from '../agent/search-pipeline.js';
import { ResultCard } from './ResultCard.js';
import { ComparisonGroup } from './ComparisonGroup.js';
import { groupProducts } from '../types/product-groups.js';
import type { ProductGroup } from '../types/product-groups.js';
import type { makeSetupRepo } from '../data/repos/setupRepo.js';
import type { makePriceRepo } from '../data/repos/priceRepo.js';
import type { makeProductRepo } from '../data/repos/productRepo.js';

export interface SearchViewProps {
  profile: RiderProfile;
  supportsImages: boolean;
  setupRepo: ReturnType<typeof makeSetupRepo>;
  priceRepo: ReturnType<typeof makePriceRepo>;
  productRepo: ReturnType<typeof makeProductRepo>;
  /** Called after a setup is saved so App.tsx can refresh wishlist state. */
  onSetupSaved: () => void;
}

export function SearchView({ profile, supportsImages, setupRepo, priceRepo, productRepo, onSetupSaved }: SearchViewProps): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [searchErrors, setSearchErrors] = useState<string[]>([]);
  const pipelineRef = useRef<RequestPipeline>(new RequestPipeline());

  const groups = React.useMemo<ProductGroup[]>(() => groupProducts(products), [products]);

  // savableProducts maps display index [N] → product for single-card groups only.
  // Comparison groups are not individually saveable and are excluded from this index.
  // handleSave uses savableProducts[n-1] so [N] always resolves to the correct product.
  const savableProducts = React.useMemo<NormalizedProduct[]>(
    () => groups.flatMap(g => g.type === 'single' ? [g.product] : []),
    [groups],
  );

  // Save UX state
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const saveMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending alert opt-in: after successful save, prompt [y/n]
  const [alertOptIn, setAlertOptIn] = useState<{ setupId: number; title: string } | null>(null);
  // Track the alert opt-in delay timer so it can be cancelled on rapid saves
  const alertOptInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSaveMsg(msg: string): void {
    if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
    setSaveMsg(msg);
    saveMsgTimerRef.current = setTimeout(() => setSaveMsg(null), 2000);
  }

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

  const handleSave = useCallback((input: string) => {
    const n = parseInt(input.trim(), 10);
    if (isNaN(n) || n < 1 || n > savableProducts.length) {
      showSaveMsg(`No item #${input.trim()} — enter a number from 1 to ${savableProducts.length}`);
      return;
    }
    const product = savableProducts[n - 1]!;
    void (async () => {
      try {
        // Upsert to get/confirm the SQLite integer PK (T-06-07: validated range above)
        const productId = productRepo.upsert(product);
        // Check if already saved: look for a setup that includes this productId
        const existing = setupRepo.list().find(s =>
          s.boardId === productId || s.bindingId === productId || s.bootId === productId
        );
        if (existing) {
          showSaveMsg('Already saved — enable/update alert? [y/n]');
          setAlertOptIn({ setupId: existing.id, title: product.title });
          return;
        }
        // Save new setup — assign productId to the correct gear slot
        const saveInput = product.gear_category === 'board'
          ? { boardId: productId }
          : product.gear_category === 'binding'
          ? { bindingId: productId }
          : { bootId: productId };
        const setupId = setupRepo.save(saveInput);
        // Record initial price snapshot at save time (A1: immediate history)
        try {
          priceRepo.record(productId, product.price_cents);
        } catch {
          // FK violation if product not in DB — safe to ignore (upsert should have covered this)
        }
        onSetupSaved();
        showSaveMsg(`✓ Saved ${product.title}`);
        // Show alert opt-in after 2s confirmation clears — tracked to cancel on rapid saves
        if (alertOptInTimerRef.current) clearTimeout(alertOptInTimerRef.current);
        alertOptInTimerRef.current = setTimeout(() => {
          setAlertOptIn({ setupId, title: product.title });
          setSaveMsg('Enable price alert? [y/n]');
        }, 2000);
      } catch (err) {
        showSaveMsg(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [savableProducts, setupRepo, priceRepo, productRepo, onSetupSaved]);

  // Alert opt-in y/n handler — only active when alertOptIn is set
  useInput((input, key) => {
    if (!alertOptIn) return;
    if (input === 'y') {
      setupRepo.setAlert(alertOptIn.setupId, true);
      onSetupSaved();
      showSaveMsg(`✓ Price alert enabled for ${alertOptIn.title}`);
      setAlertOptIn(null);
    } else if (input === 'n' || key.escape || input === 'q') {
      // Dismiss without saving alert; q/Escape should not bubble to App.tsx quit handler
      setAlertOptIn(null);
      setSaveMsg(null);
    }
  }, { isActive: alertOptIn !== null });

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
              index={savableProducts.indexOf(group.product) + 1}
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
      {!isLoading && products.length > 0 && (
        <Box marginTop={1}>
          {saveMsg
            ? <Text color={saveMsg.startsWith('✓') ? 'green' : 'yellow'}>{saveMsg}</Text>
            : <TextInput placeholder="Save item #:" onSubmit={handleSave} />
          }
        </Box>
      )}
    </Box>
  );
}
