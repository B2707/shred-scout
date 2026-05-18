/**
 * SearchView — NL search input + loading state + results area + save UX.
 *
 * Calls runSearch() directly via useState + async handleSubmit.
 * No AgentLoop, no useAgent, no EventEmitter — plain async await.
 * Phase 8: deterministic search pipeline wired directly into UI state.
 * Phase 6: save TextInput below results, alert opt-in flow, repo props from App.tsx.
 * Phase 9: conversational opener (boot size + riding style confirm) before search.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
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

// Conversational opener state machine — runs once per component lifetime (once per launch).
type OpenerState =
  | { step: 'q1' }
  | { step: 'q1-edit' }
  | { step: 'q2' }
  | { step: 'q2-edit' }
  | { step: 'done' };

export interface SearchViewProps {
  profile: RiderProfile;
  supportsImages: boolean;
  setupRepo: ReturnType<typeof makeSetupRepo>;
  priceRepo: ReturnType<typeof makePriceRepo>;
  productRepo: ReturnType<typeof makeProductRepo>;
  /** When true, runSearch uses fixture data (no HTTP calls, no real DB). */
  isDemoMode?: boolean;
  /** Called after a setup is saved so App.tsx can refresh wishlist state. */
  onSetupSaved: () => void;
  /**
   * Called with true when an input-blocking modal (alert opt-in) is active so
   * App.tsx can gate its global 'q' quit handler. Called with false when dismissed.
   * Uses a ref internally (not state) to avoid triggering re-renders on the parent.
   */
  onModalChange: (active: boolean) => void;
}

export function SearchView({ profile, supportsImages, setupRepo, priceRepo, productRepo, isDemoMode = false, onSetupSaved, onModalChange }: SearchViewProps): React.JSX.Element {
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

  // Conversational opener state — once per process launch
  const [opener, setOpener] = useState<OpenerState>({ step: 'q1' });
  const [openerBootSize, setOpenerBootSize] = useState<number>(profile.bootSize);
  const [openerStyle, setOpenerStyle] = useState<string>(profile.ridingStyle);

  // Display form of the opener riding style: 'all-mountain' → 'All-Mountain'
  const displayOpenerStyle = openerStyle
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');

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
        const { products: found, errors } = await runSearch(query, profile, pipelineRef.current, { demo: isDemoMode });
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
      // Cancel any pending alert opt-in timer before processing a new save attempt.
      // Without this, a stale timer from a prior new-save could fire during the
      // "already saved" modal and overwrite alertOptIn with a stale setupId.
      if (alertOptInTimerRef.current) {
        clearTimeout(alertOptInTimerRef.current);
        alertOptInTimerRef.current = null;
      }
      try {
        // Upsert to get/confirm the SQLite integer PK (T-06-07: validated range above)
        const productId = productRepo.upsert(product);
        // Check if already saved: look for a setup that includes this productId
        const existing = setupRepo.list().find(s =>
          s.boardId === productId || s.bindingId === productId || s.bootId === productId
        );
        if (existing) {
          // Use setSaveMsg directly (not showSaveMsg) so the message does NOT
          // auto-clear via a timer — it must persist as long as alertOptIn is active.
          // Both are cleared together when the user responds with y/n/Escape.
          setSaveMsg('Already saved — enable/update alert? [y/n]');
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
        // Show alert opt-in prompt after 2s confirmation message clears
        alertOptInTimerRef.current = setTimeout(() => {
          setAlertOptIn({ setupId, title: product.title });
          setSaveMsg('Enable price alert? [y/n]');
        }, 2000);
      } catch (err) {
        showSaveMsg(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [savableProducts, setupRepo, priceRepo, productRepo, onSetupSaved]);

  // Clear pending timers on unmount to prevent state updates on an unmounted component.
  useEffect(() => {
    return () => {
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
      if (alertOptInTimerRef.current) clearTimeout(alertOptInTimerRef.current);
    };
  }, []);

  // Notify App.tsx when the alert opt-in modal becomes active or inactive.
  // App.tsx gates its global 'q' quit handler behind this flag so 'q' dismisses
  // the modal rather than exiting the app (Ink useInput has no stop-propagation).
  useEffect(() => {
    onModalChange(alertOptIn !== null);
  }, [alertOptIn, onModalChange]);

  // Conversational opener y/n handler — only active during q1 and q2 steps.
  // Must be gated with alertOptIn === null so it does not collide with the alert modal handler.
  useInput((input, key) => {
    if (opener.step === 'q1') {
      if (input === 'y' || key.return) { setOpener({ step: 'q2' }); return; }
      if (input === 'n') { setOpener({ step: 'q1-edit' }); return; }
    } else if (opener.step === 'q2') {
      if (input === 'y' || key.return) { setOpener({ step: 'done' }); return; }
      if (input === 'n') { setOpener({ step: 'q2-edit' }); return; }
    }
  }, { isActive: (opener.step === 'q1' || opener.step === 'q2') && alertOptIn === null });

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

  // Opener UI: shown before the search box appears
  const openerUI = (
    <Box flexDirection="column" paddingX={1}>
      {opener.step === 'q1' && (
        <Text>Your boot size is <Text bold>{openerBootSize}</Text> — still right? [y/n]</Text>
      )}
      {opener.step === 'q1-edit' && (
        <TextInput
          placeholder="Enter boot size (US):"
          onSubmit={(v) => {
            const parsed = parseFloat(v);
            if (!isNaN(parsed) && parsed > 0) {
              setOpenerBootSize(parsed);
            }
            setOpener({ step: 'q2' });
          }}
        />
      )}
      {opener.step === 'q2' && (
        <Text>Riding style: <Text bold>{displayOpenerStyle}</Text> — change anything? [y/n]</Text>
      )}
      {opener.step === 'q2-edit' && (
        <TextInput
          placeholder="Enter riding style (e.g. all-mountain, freeride, freestyle):"
          onSubmit={(v) => {
            const trimmed = v.trim().toLowerCase();
            if (trimmed.length > 0) {
              setOpenerStyle(trimmed);
            }
            setOpener({ step: 'done' });
          }}
        />
      )}
    </Box>
  );

  // Search UI: shown after opener completes
  const searchUI = (
    <>
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
    </>
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {opener.step !== 'done' ? openerUI : searchUI}
    </Box>
  );
}
