/**
 * SetupBuilderView - the interactive "build a full setup" screen.
 *
 * Promoted from the throwaway SetupBuilderPrototype. Renders a pinned setup tray (board /
 * binding / boot) above a dense, compatible-first candidate list for the active slot. Every
 * candidate carries a LIVE fit badge (sized for the rider + checked against what's already
 * chosen), and the tray shows a whole-setup verdict once all three slots are filled.
 *
 * This is a real routed screen, so it NEVER calls process.exit and NEVER uses useApp().exit:
 * it leaves only via the onBack() callback (Esc). Saving upserts the three chosen products,
 * records a price snapshot for each, and writes ONE fresh saved_setups row via
 * setupRepo.saveComplete (never merging into an unrelated incomplete row).
 */

import type Database from 'better-sqlite3';
import { Box, Text, useInput, useStdout } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rankProducts } from '../agent/rank.js';
import { runSearch } from '../agent/search-pipeline.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import { RequestPipeline } from '../data/pipeline.js';
import type { makePriceRepo } from '../data/repos/priceRepo.js';
import type { makeProductRepo } from '../data/repos/productRepo.js';
import type { makeSetupRepo } from '../data/repos/setupRepo.js';
import {
  annotateCandidates,
  badgeFor,
  type Cat,
  COLOR,
  type Setup,
  SYM,
  trayVerdict,
} from '../domain/compatibility/setup-badges.js';
import type { RiderProfile } from '../types/profile.js';
import { ProductDetail } from './ProductDetail.js';

const CATS: Cat[] = ['board', 'binding', 'boot'];
const CAT_LABEL: Record<Cat, string> = {
  board: 'Board',
  binding: 'Binding',
  boot: 'Boot',
};
const CAT_COLOR: Record<Cat, string> = {
  board: 'cyan',
  binding: 'magenta',
  boot: 'yellow',
};

const price = (p: NormalizedProduct): string =>
  `$${(p.price_cents / 100).toFixed(0)}`;

// Render one window of candidates around the cursor so a long list never overflows the terminal.
const WINDOW = 7;

export interface SetupBuilderViewProps {
  /**
   * Pre-sourced candidate products. When provided (tests / a preserved search session), they are
   * used directly. When omitted, the screen runs an empty-query runSearch on mount to source them.
   */
  products?: NormalizedProduct[];
  rider: RiderProfile;
  setupRepo: ReturnType<typeof makeSetupRepo>;
  productRepo: ReturnType<typeof makeProductRepo>;
  priceRepo: ReturnType<typeof makePriceRepo>;
  /** Called with the saved setup's id once a complete board+binding+boot setup is saved. */
  onSetupSaved: (id: number) => void;
  /** Called when the user backs out (Esc) - the screen NEVER terminates the process itself. */
  onBack: () => void;
  supportsImages: boolean;
  /** App-owned DB connection - passed to runSearch to prevent a double-open. Required to source. */
  db?: Database.Database;
  /** When true, runSearch uses fixture data (no HTTP). Mirrors SearchView. */
  isDemoMode?: boolean;
}

export function SetupBuilderView({
  products,
  rider,
  setupRepo,
  productRepo,
  priceRepo,
  onSetupSaved,
  onBack,
  supportsImages,
  db,
  isDemoMode = false,
}: SetupBuilderViewProps): React.JSX.Element {
  const { stdout } = useStdout();
  const [candidates, setCandidates] = useState<NormalizedProduct[]>(
    () => products ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [setup, setSetup] = useState<Setup>({});
  const [active, setActive] = useState<Cat>('board');
  const [cursor, setCursor] = useState(0);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // The product whose full-screen photo view is open; null = browsing the list.
  const [detailProduct, setDetailProduct] = useState<NormalizedProduct | null>(
    null,
  );
  const pipelineRef = useRef<RequestPipeline>(new RequestPipeline());

  // Source candidates with an empty-query runSearch when none were provided (mirrors SearchView).
  // Empty query is allowed here (the "Full Setup" path wants every category).
  const didSourceRef = useRef(false);
  useEffect(() => {
    if (products !== undefined || didSourceRef.current) return;
    didSourceRef.current = true;
    void (async () => {
      setIsLoading(true);
      try {
        const { products: found } = await runSearch(
          '',
          rider,
          pipelineRef.current,
          { demo: isDemoMode, db },
        );
        setCandidates(rankProducts(found, rider));
      } catch {
        setCandidates([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [products, rider, isDemoMode, db]);

  // Single badge pass: annotate the active category's candidates once, then derive both the
  // rendered list and the compatible-count from it. Memoized so list/badge work is not redone
  // on every keypress (cursor moves, save messages) when active/candidates/setup/rider are stable.
  const annotated = useMemo(
    () =>
      annotateCandidates(
        active,
        candidates.filter((p) => p.gear_category === active),
        setup,
        rider,
      ),
    [active, candidates, setup, rider],
  );
  const list = useMemo(() => annotated.map((a) => a.product), [annotated]);
  const compatCount = annotated.filter(
    (a) => a.badge.verdict !== 'fail',
  ).length;
  const tray = trayVerdict(setup, rider);
  const complete = Boolean(setup.board && setup.binding && setup.boot);

  // Save the chosen board/binding/boot: upsert each product (capturing its integer PK), record a
  // price snapshot per product (a failed snapshot must NOT abort the save), then INSERT ONE fresh
  // saved_setups row via saveComplete and report the id up. Mirrors SearchView's save flow.
  const handleSave = useCallback(() => {
    const board = setup.board;
    const binding = setup.binding;
    const boot = setup.boot;
    if (!board || !binding || !boot) return;
    try {
      const boardId = productRepo.upsert(board);
      const bindingId = productRepo.upsert(binding);
      const bootId = productRepo.upsert(boot);
      for (const [id, product] of [
        [boardId, board],
        [bindingId, binding],
        [bootId, boot],
      ] as const) {
        try {
          priceRepo.record(id, product.price_cents);
        } catch {
          // FK violation only if the product is not in the DB - upsert above should cover it.
          // A price-snapshot failure must never abort the setup save.
        }
      }
      // Always INSERT a fresh complete row - saveSlot would COALESCE-merge into a stale
      // incomplete row (e.g. a board-only row left by SearchView) and hijack its board.
      const setupId = setupRepo.saveComplete({ boardId, bindingId, bootId });
      setSaveMsg('Saved your setup');
      onSetupSaved(setupId);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    }
  }, [setup, productRepo, priceRepo, setupRepo, onSetupSaved]);

  // This screen OWNS its input. It exits only via onBack (Esc) - never process.exit / useApp.exit.
  useInput((input, key) => {
    if (detailProduct !== null) {
      setDetailProduct(null);
      return;
    }
    if (key.escape) {
      onBack();
    } else if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow || input === 'j') {
      setCursor((c) =>
        list.length === 0 ? 0 : Math.min(list.length - 1, c + 1),
      );
    } else if (key.return) {
      const chosen = list[cursor];
      if (!chosen) return;
      const next = { ...setup, [active]: chosen };
      setSetup(next);
      const nextEmpty = CATS.find((c) => !next[c]);
      setActive(nextEmpty ?? active);
      setCursor(0);
      setSaveMsg(null);
    } else if (key.tab) {
      const i = CATS.indexOf(active);
      setActive(CATS[(i + 1) % CATS.length]);
      setCursor(0);
    } else if (input === 'r') {
      setSetup({});
      setActive('board');
      setCursor(0);
      setSaveMsg(null);
    } else if (input === '#' || input === 'p') {
      const chosen = list[cursor];
      if (chosen) setDetailProduct(chosen);
    } else if (input === 'S') {
      if (complete) handleSave();
    }
  });

  // Render-once full-screen photo view of the cursor product. Any key returns (handled above).
  if (detailProduct !== null) {
    return (
      <ProductDetail product={detailProduct} supportsImages={supportsImages} />
    );
  }

  const cols = stdout.columns ?? 80;
  const width = Math.min(cols - 2, 78);
  // Narrow mode: drop the secondary price/badge columns below ~60 cols so rows do not overflow.
  const narrow = cols < 60;
  // Window the list around the cursor so it never overflows the terminal.
  const start = Math.max(0, Math.min(cursor - 3, list.length - WINDOW));
  const visible = annotated.slice(start, start + WINDOW);

  return (
    <Box flexDirection="column" width={width}>
      {/* Header */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color="cyan">
          Build a setup
        </Text>
        <Text dimColor>
          {[`US${rider.bootSize}`, rider.skillLevel, rider.ridingStyle]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Box>

      {/* Setup tray */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text bold>YOUR SETUP</Text>
          {tray ? (
            <Text color={COLOR[tray.verdict]} bold>
              {SYM[tray.verdict]}{' '}
              {tray.verdict === 'pass' ? 'compatible' : tray.verdict}
            </Text>
          ) : (
            <Text dimColor>building…</Text>
          )}
        </Box>
        {tray ? (
          // Completed-setup verdict reason - only renders once board+binding+boot are all chosen.
          <Box>
            <Text color={COLOR[tray.verdict]} wrap="truncate">
              {SYM[tray.verdict]} {tray.text}
            </Text>
          </Box>
        ) : null}
        {CATS.map((cat) => {
          const p = setup[cat];
          const isActive = cat === active;
          const b = p ? badgeFor(cat, p, setup, rider) : null;
          return (
            <Box key={cat}>
              <Box width={2} flexShrink={0}>
                <Text color={isActive ? 'cyan' : undefined}>
                  {isActive ? '❯' : ' '}
                </Text>
              </Box>
              <Box width={2} flexShrink={0}>
                <Text color={p ? 'green' : 'gray'}>{p ? '▣' : '▢'}</Text>
              </Box>
              <Box width={9} flexShrink={0}>
                <Text color={CAT_COLOR[cat]}>{CAT_LABEL[cat]}</Text>
              </Box>
              <Box width={24} flexShrink={0}>
                <Text wrap="truncate" dimColor={!p}>
                  {p ? p.title : isActive ? 'choosing…' : '- choose -'}
                </Text>
              </Box>
              <Box width={7} flexShrink={0} justifyContent="flex-end">
                <Text color="green">{p ? price(p) : ''}</Text>
              </Box>
              <Box marginLeft={2} flexGrow={1} flexShrink={1} minWidth={0}>
                {b ? (
                  <Text color={COLOR[b.verdict]} wrap="truncate">
                    {SYM[b.verdict]} {b.text}
                  </Text>
                ) : null}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Active category list */}
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color={CAT_COLOR[active]}>
            CHOOSE A {CAT_LABEL[active].toUpperCase()}
          </Text>
          <Text dimColor>{compatCount} compatible · sorted: best fit ▾</Text>
        </Box>
        {isLoading && list.length === 0 ? (
          <Text dimColor>Finding compatible gear…</Text>
        ) : null}
        {visible.map((entry, i) => {
          const p = entry.product;
          const idx = start + i;
          const isCursor = idx === cursor;
          const inSetup = setup[active]?.shopify_id === p.shopify_id;
          const b = entry.badge;
          return (
            <Box key={p.shopify_id}>
              <Box width={2} flexShrink={0}>
                <Text color="cyan" bold>
                  {isCursor ? '❯' : ' '}
                </Text>
              </Box>
              <Box width={3} flexShrink={0}>
                <Text dimColor>{idx + 1}</Text>
              </Box>
              <Box
                width={narrow ? 24 : 28}
                flexShrink={1}
                flexGrow={1}
                minWidth={0}
              >
                <Text bold={isCursor} wrap="truncate">
                  {inSetup ? '▣ ' : ''}
                  {p.title}
                </Text>
              </Box>
              {narrow ? (
                // Narrow terminals: drop the price column and the verbose badge text,
                // keep just the fit symbol so rows never overflow.
                <Box marginLeft={1} flexShrink={0}>
                  <Text color={COLOR[b.verdict]}>{SYM[b.verdict]}</Text>
                </Box>
              ) : (
                <>
                  <Box width={8} flexShrink={0} justifyContent="flex-end">
                    <Text color="green">{price(p)}</Text>
                  </Box>
                  <Box marginLeft={2} flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text color={COLOR[b.verdict]} wrap="truncate">
                      {SYM[b.verdict]} {b.text}
                    </Text>
                  </Box>
                </>
              )}
            </Box>
          );
        })}
        {list.length > WINDOW ? (
          <Text dimColor>
            {'  '}
            {start + WINDOW < list.length
              ? `▼ ${list.length - (start + WINDOW)} more`
              : ''}
            {start > 0 ? `  ▲ ${start} above` : ''}
          </Text>
        ) : null}
      </Box>

      {saveMsg ? (
        <Box paddingX={1}>
          <Text color="green">{saveMsg}</Text>
        </Box>
      ) : null}

      {/* Legend */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          ↑↓ move · ⏎ pick · ⇥ swap slot · # photo · r restart ·{' '}
          {complete ? 'S save · ' : ''}Esc back
        </Text>
      </Box>
    </Box>
  );
}
