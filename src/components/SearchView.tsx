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
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import type Database from 'better-sqlite3';
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

// Filter chip types — category, flex, and price dimensions
type FilterKey =
  | 'board' | 'binding' | 'boot'
  | 'soft' | 'medium' | 'stiff'
  | 'u300' | 'u500' | 'u700';

const ALL_CHIPS: Array<{ key: FilterKey; label: string; shortcut: string }> = [
  { key: 'board',   label: 'Board',   shortcut: 'b' },
  { key: 'binding', label: 'Binding', shortcut: 'i' },
  { key: 'boot',    label: 'Boot',    shortcut: 'o' },
  { key: 'soft',    label: 'Soft',    shortcut: 's' },
  { key: 'medium',  label: 'Medium',  shortcut: 'm' },
  { key: 'stiff',   label: 'Stiff',   shortcut: 't' },
  { key: 'u300',    label: '<$300',   shortcut: '3' },
  { key: 'u500',    label: '<$500',   shortcut: '5' },
  { key: 'u700',    label: '<$700',   shortcut: '7' },
];

export interface SearchViewProps {
  profile: RiderProfile;
  supportsImages: boolean;
  /** App-owned DB connection — passed to runSearch to prevent double-open (CR-02). */
  db: Database.Database;
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

export function SearchView({ profile, supportsImages, db, setupRepo, priceRepo, productRepo, isDemoMode = false, onSetupSaved, onModalChange }: SearchViewProps): React.JSX.Element {
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

  // Filter chip state — toggled by single-letter shortcuts after opener completes.
  // Must be declared before filteredGroups useMemo to avoid temporal dead zone.
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());

  // filteredGroups: derived from groups + activeFilters — reactively narrows results.
  // When no filters are active, returns groups verbatim (same reference) to skip re-renders.
  const filteredGroups = React.useMemo<ProductGroup[]>(() => {
    if (activeFilters.size === 0) return groups;
    const catFilters = (['board', 'binding', 'boot'] as const).filter(c => activeFilters.has(c));
    const flexFilters = (['soft', 'medium', 'stiff'] as const).filter(f => activeFilters.has(f));
    const priceThresholds = [
      activeFilters.has('u300') ? 30000 : null,
      activeFilters.has('u500') ? 50000 : null,
      activeFilters.has('u700') ? 70000 : null,
    ].filter((v): v is number => v !== null);
    const maxPrice = priceThresholds.length > 0 ? Math.max(...priceThresholds) : null;
    return groups.filter(g => {
      const p = g.type === 'single' ? g.product : g.products[0]!;
      if (catFilters.length > 0 && !catFilters.includes(p.gear_category as 'board' | 'binding' | 'boot')) return false;
      if (flexFilters.length > 0 && p.flex_rating && !flexFilters.some(f => p.flex_rating!.toLowerCase().includes(f))) return false;
      if (maxPrice !== null && p.price_cents > maxPrice) return false;
      return true;
    });
  }, [groups, activeFilters]);

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
        const { products: found, errors } = await runSearch(query, profile, pipelineRef.current, { demo: isDemoMode, db });
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

  // Filter chip toggle handler — only active after opener completes and no modal is open.
  // Price chips (u300/u500/u700) are single-select: selecting one clears the others so
  // Math.max() in filteredGroups always reflects exactly one price ceiling (WR-02).
  const PRICE_CHIPS: FilterKey[] = ['u300', 'u500', 'u700'];
  useInput((input) => {
    const chip = ALL_CHIPS.find(c => c.shortcut === input);
    if (!chip) return;
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(chip.key)) {
        next.delete(chip.key);
      } else {
        if (PRICE_CHIPS.includes(chip.key)) {
          PRICE_CHIPS.forEach(p => next.delete(p)); // clear sibling price chips
        }
        next.add(chip.key);
      }
      return next;
    });
  }, { isActive: opener.step === 'done' && alertOptIn === null && !isLoading });

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
      <Box flexDirection="row" marginY={1}>
        {ALL_CHIPS.map(chip => {
          const active = activeFilters.has(chip.key);
          return (
            <Text key={chip.key} color={active ? 'green' : undefined} bold={active} dimColor={!active}>
              {`[${chip.label}:${chip.shortcut}] `}
            </Text>
          );
        })}
      </Box>
      <Box flexDirection="column">
        {filteredGroups.map((group) =>
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
        )}
      </Box>
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
