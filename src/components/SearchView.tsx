/**
 * SearchView — NL search input + loading state + results area + save UX.
 *
 * Calls runSearch() directly via useState + async handleSubmit.
 * No AgentLoop, no useAgent, no EventEmitter — plain async await.
 * Phase 8: deterministic search pipeline wired directly into UI state.
 * Phase 6: save TextInput below results, alert opt-in flow, repo props from App.tsx.
 * Phase 10: the guided wizard always supplies initialQuery, so the search runs
 * immediately on mount — the old Phase 9 conversational opener was dead and is gone (UI-3).
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Spinner } from '@inkjs/ui';
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

// Result cards are tall (bordered, ~5 rows each), so a long list pushes earlier cards off
// the top of the terminal. Render one page at a time and let ←/→ move between pages (SC-04).
const PAGE_SIZE = 5;

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
  /**
   * The query the guided wizard produced — the search runs immediately for it on mount.
   * Always supplied in practice; if absent, the results screen simply starts empty.
   */
  initialQuery?: string;
  /** Chip filters to pre-apply, from the wizard answers (category/flex/price keys). */
  initialFilters?: string[];
  /** Cached results from a prior visit — when present, skip re-fetching on remount (B7). */
  initialProducts?: NormalizedProduct[];
  /** Reports the current results + active filters up so App can preserve the session (B7). */
  onSession?: (products: NormalizedProduct[], filters: string[]) => void;
}

export function SearchView({ profile, supportsImages, db, setupRepo, priceRepo, productRepo, isDemoMode = false, onSetupSaved, onModalChange, initialQuery, initialFilters, initialProducts, onSession }: SearchViewProps): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<NormalizedProduct[]>(() => initialProducts ?? []);
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
  // Pending alert opt-in: after a successful save, prompt [y/n]
  const [alertOptIn, setAlertOptIn] = useState<{ setupId: number; title: string } | null>(null);
  // Results-screen input mode — exactly ONE input is ever active, which removes the
  // chip-shortcut / text-box / quit-key collisions (B4/B5/B6/B8/B16).
  const [mode, setMode] = useState<'browse' | 'filter' | 'save'>('browse');

  // Filter chip state — pre-applied from the wizard answers, then toggled by shortcuts.
  // Must be declared before filteredGroups useMemo to avoid temporal dead zone.
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    () => new Set((initialFilters ?? []) as FilterKey[]),
  );

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

  // Result pagination (SC-04). page is reset to 0 on every new search and filter change;
  // safePage additionally clamps for the single render before that reset effect fires.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [products, activeFilters]);
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleGroups = filteredGroups.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function showSaveMsg(msg: string): void {
    if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
    setSaveMsg(msg);
    saveMsgTimerRef.current = setTimeout(() => setSaveMsg(null), 2000);
  }

  // Runs a search for the given query. Empty query is allowed here (used by the wizard's
  // "Full Setup" path, which wants every category); the user-facing box guards empty Enter.
  const runQuery = useCallback((query: string) => {
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
  }, [isLoading, profile, isDemoMode, db]);

  // Auto-run the wizard-driven search once on mount — but not when results were restored
  // from a cached session (returning from the wishlist), which would needlessly re-fetch (B7).
  const didInitRef = useRef(false);
  useEffect(() => {
    if (initialQuery !== undefined && initialProducts === undefined && !didInitRef.current) {
      didInitRef.current = true;
      runQuery(initialQuery);
    }
  }, [initialQuery, initialProducts, runQuery]);

  // Report results + active filters up so App can restore them after navigating away (B7).
  useEffect(() => {
    onSession?.(products, Array.from(activeFilters));
  }, [products, activeFilters, onSession]);

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
          // setSaveMsg directly (not showSaveMsg) so the prompt persists while the
          // alert opt-in modal is active; both clear together on y/n/Esc.
          setMode('browse');
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
        const setupId = setupRepo.saveSlot(saveInput);
        // Record initial price snapshot at save time (A1: immediate history)
        try {
          priceRepo.record(productId, product.price_cents);
        } catch {
          // FK violation if product not in DB — safe to ignore (upsert should have covered this)
        }
        onSetupSaved();
        // Immediately prompt for the price alert (no 2s timer — that swallowed rapid
        // follow-up keystrokes, B8). Leave save mode; the alert modal owns input now.
        setMode('browse');
        setSaveMsg(`✓ Saved ${product.title} — enable price alert? [y/n]`);
        setAlertOptIn({ setupId, title: product.title });
      } catch (err) {
        showSaveMsg(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [savableProducts, setupRepo, priceRepo, productRepo, onSetupSaved]);

  // Clear the save-message timer on unmount to avoid setting state after unmount.
  useEffect(() => {
    return () => {
      if (saveMsgTimerRef.current) clearTimeout(saveMsgTimerRef.current);
    };
  }, []);

  // Lock App.tsx's global keys (q/w/n) whenever this view owns input — an open filter/save
  // mode or the alert modal — so those keys don't quit/navigate while the user is typing or
  // filtering (B6/B15/B16). Ink useInput has no stop-propagation.
  const inputLocked = mode !== 'browse' || alertOptIn !== null;
  useEffect(() => {
    onModalChange(inputLocked);
  }, [inputLocked, onModalChange]);

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

  // Filter chips toggle ONLY in filter mode (entered with '/'), so chip letters never
  // collide with typing in the save box or with the global quit key (B5).
  // Price chips (u300/u500/u700) are single-select.
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
  }, { isActive: mode === 'filter' });

  // Browse mode — open the filter panel ('/') or the save input ('s'), page with ←/→.
  // q/w/n go to App.
  useInput((input, key) => {
    if (input === '/') setMode('filter');
    else if (input === 's' && products.length > 0) setMode('save');
    else if (key.rightArrow) setPage(Math.min(pageCount - 1, safePage + 1));
    else if (key.leftArrow) setPage(Math.max(0, safePage - 1));
  }, { isActive: mode === 'browse' && alertOptIn === null && !isLoading });

  // Filter mode — leave the panel with '/', Esc, or Enter.
  useInput((input, key) => {
    if (input === '/' || key.escape || key.return) setMode('browse');
  }, { isActive: mode === 'filter' });

  // Save mode — Esc cancels (Enter is handled by the save TextInput).
  useInput((_input, key) => {
    if (key.escape) setMode('browse');
  }, { isActive: mode === 'save' && alertOptIn === null });

  // Number of products actually shown (after filters) — used in the footer so the count
  // never claims "7 results" while filters hide them all.
  const shownCount = filteredGroups.reduce((n, g) => n + (g.type === 'single' ? 1 : g.products.length), 0);

  // Discoverable, mode-aware footer hint (C3).
  const footerHint =
    isLoading ? 'Searching…'
    : mode === 'filter' ? 'Filter panel — press a chip letter to toggle · [/ or Esc] done'
    : mode === 'save' ? 'Type the item number, then Enter · [Esc] cancel'
    : alertOptIn ? 'Respond to the price-alert prompt above · [y/n]'
    : `${shownCount} result${shownCount === 1 ? '' : 's'}${shownCount < products.length ? ` of ${products.length}` : ''}   [/] filters   [s] save${pageCount > 1 ? '   [←/→] page' : ''}   [n] new setup   [w] wishlist   [q] quit`;

  // Results UI: the wizard supplies the query, so this renders immediately on mount.
  const resultsUI = (
    <>
      {/* Filter chips — active green; cyan while the filter panel is open */}
      <Box flexDirection="row" marginY={1}>
        {ALL_CHIPS.map(chip => {
          const active = activeFilters.has(chip.key);
          return (
            <Text
              key={chip.key}
              color={active ? 'green' : (mode === 'filter' ? 'cyan' : undefined)}
              bold={active}
              dimColor={!active && mode !== 'filter'}
            >
              {`[${chip.label}:${chip.shortcut}] `}
            </Text>
          );
        })}
      </Box>

      {isLoading && (
        <Box marginTop={1}>
          <Spinner label="Searching deals across retailers…" />
        </Box>
      )}

      <Box flexDirection="column">
        {visibleGroups.map((group) =>
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
              rider={profile}
            />
          )
        )}
      </Box>

      {/* Pagination indicator — only when results span more than one page (SC-04). */}
      {pageCount > 1 && !isLoading && (
        <Box>
          <Text dimColor>Page {safePage + 1} of {pageCount} — [←/→] to page through {shownCount} results</Text>
        </Box>
      )}

      {shownCount === 0 && !isLoading && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          {products.length > 0 ? (
            <>
              <Text bold>All {products.length} results are hidden by your filters</Text>
              <Text dimColor>Press [/] to adjust filters, or [n] to start a new guided setup.</Text>
            </>
          ) : (
            <>
              <Text bold>No compatible gear found</Text>
              <Text dimColor>Press [n] to start a new guided setup, or [/] to widen your filters.</Text>
            </>
          )}
        </Box>
      )}

      {searchErrors.length > 0 && (
        <Box flexDirection="column">
          {searchErrors.map((err, i) => (
            <Text key={i} color="yellow">{err}</Text>
          ))}
        </Box>
      )}

      {/* Save input — only in save mode and only while no alert modal is up */}
      {mode === 'save' && !alertOptIn && (
        <Box marginTop={1}>
          <Text>Save item #: </Text>
          <TextInput placeholder="number, then Enter" onSubmit={(v) => { setMode('browse'); handleSave(v); }} />
        </Box>
      )}

      {saveMsg && (
        <Box marginTop={1}>
          <Text color={saveMsg.startsWith('✓') ? 'green' : 'yellow'}>{saveMsg}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>{footerHint}</Text>
      </Box>
    </>
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {resultsUI}
    </Box>
  );
}
