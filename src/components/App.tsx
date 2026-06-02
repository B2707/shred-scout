/**
 * App — Root Ink component with screen state routing and global quit handler.
 * Reads existing profile synchronously at render time to determine initial screen.
 *
 * Phase 8: api-key screen, AgentLoop construction, and apiKey state removed.
 * Screen flow: onboarding → search → wishlist → history.
 */
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { RiderProfile } from '../types/profile.js';
import { readProfile } from '../lib/profile.js';
import { WizardScreen } from './wizard/WizardScreen.js';
import { Header } from './Header.js';
import { SearchView } from './SearchView.js';
import { WishlistView } from './WishlistView.js';
import { HistoryView } from './HistoryView.js';
import { SetupSummaryView } from './SetupSummaryView.js';
import { openDatabase } from '../data/db.js';
import { evaluateCompatibility } from '../domain/compatibility/engine.js';
import { toBoard, toBinding, toBoot } from '../domain/compatibility/product-adapter.js';
import { makeSetupRepo } from '../data/repos/setupRepo.js';
import { makePriceRepo } from '../data/repos/priceRepo.js';
import { makeProductRepo } from '../data/repos/productRepo.js';
import type { SavedSetup } from '../data/repos/setupRepo.js';
import type { PriceObservation } from '../data/repos/priceRepo.js';

type Screen = 'onboarding' | 'search' | 'wishlist' | 'history' | 'summary';

/** Hardcoded demo rider profile — skips wizard and uses in-memory DB */
const DEMO_PROFILE: RiderProfile = {
  bootSize: 10,
  heightCm: 180,
  weightKg: 80,
  ridingStyle: 'all-mountain',
};

export function App({ isDemoMode = false }: { isDemoMode?: boolean }): React.JSX.Element {
  // Detect image protocol support once at mount — cached boolean passed down as prop.
  // iTerm2: TERM_PROGRAM === 'iTerm.app'; Kitty: KITTY_WINDOW_ID is set.
  // Evaluated once (constant, not state) — no re-render triggered. Locked decision: CONTEXT.md.
  const supportsImages =
    process.env['TERM_PROGRAM'] === 'iTerm.app' ||
    process.env['KITTY_WINDOW_ID'] !== undefined;

  // readProfile() is called inside lazy useState initializers so it runs exactly
  // once at mount — not on every re-render.
  // Demo mode: always start on 'search' screen with hardcoded profile (no wizard).
  const [screen, setScreen] = useState<Screen>(() => {
    if (isDemoMode) return 'search';
    const p = readProfile();
    return p ? 'search' : 'onboarding';
  });
  const [profile, setProfile] = useState<RiderProfile | null>(() => {
    if (isDemoMode) return DEMO_PROFILE;
    return readProfile();
  });

  // Open DB once per app lifetime — repos share this connection.
  // Demo mode uses ':memory:' SQLite so no production data is touched.
  const db = useMemo(() => openDatabase(isDemoMode ? ':memory:' : undefined), [isDemoMode]);
  const setupRepo = useMemo(() => makeSetupRepo(db), [db]);
  const priceRepo = useMemo(() => makePriceRepo(db), [db]);
  const productRepo = useMemo(() => makeProductRepo(db), [db]);

  // Wishlist state — refreshed by calling setupRepo.list()
  const [setups, setSetups] = useState<SavedSetup[]>(() => setupRepo.list());
  // Summary screen: snapshot of the complete setup that triggered the transition
  const [summarySetup, setSummarySetup] = useState<SavedSetup | null>(null);
  // Track which product's history to show in HistoryView
  const [historyObservations, setHistoryObservations] = useState<PriceObservation[]>([]);
  const [historyProductTitle, setHistoryProductTitle] = useState<string>('');

  const { exit } = useApp();

  // blockQuit is set to true by SearchView when an alert opt-in modal is active.
  // A ref (not state) is used so the useInput closure always reads the current value
  // without requiring the useInput hook to re-register on every toggle.
  const blockQuitRef = useRef(false);

  // Global quit handler — screen-aware to allow child screens to handle q/Escape.
  // Gate search-screen quit behind blockQuitRef so SearchView's modal can own 'q'.
  useInput((input: string) => {
    if (screen === 'search' && input === 'q' && !blockQuitRef.current) {
      exit();
    }
    if (screen === 'wishlist' && input === 'q') {
      setScreen('search');
    }
    if (screen === 'history' && input === 'q') {
      setScreen('wishlist');
    }
    if (screen === 'search' && input === 'w') {
      setSetups(setupRepo.list()); // refresh before showing
      setScreen('wishlist');
    }
  });

  // Handler functions — defined before conditional returns so hooks are always called first
  const resolveTitle = (id: number | null): string => {
    if (id === null) return 'Unknown product';
    const product = productRepo.findById(id);
    return product?.title ?? 'Unknown product';
  };

  const handleDelete = (id: number): void => {
    setupRepo.delete(id);
    setSetups(setupRepo.list());
  };

  const handleToggleAlert = (id: number, enabled: boolean): void => {
    setupRepo.setAlert(id, enabled);
    setSetups(setupRepo.list()); // refresh badge
  };

  const handleSetupSaved = useCallback(() => {
    setSetups(setupRepo.list());
    const complete = setupRepo.findCompleteSetup();
    if (complete) {
      // Compute + persist the compatibility snapshot once the setup is complete (B19)
      // so the wishlist CompatBadge renders. Skip if already stored.
      if (!complete.compatibility && profile) {
        const board = complete.boardId !== null ? productRepo.findById(complete.boardId) : null;
        const binding = complete.bindingId !== null ? productRepo.findById(complete.bindingId) : null;
        const boot = complete.bootId !== null ? productRepo.findById(complete.bootId) : null;
        if (board && binding && boot) {
          const results = evaluateCompatibility(
            { board: toBoard(board), binding: toBinding(binding), boot: toBoot(profile.bootSize) },
            profile,
          );
          setupRepo.setCompatibility(complete.id, results);
          complete.compatibility = results;
        }
      }
      setSummarySetup(complete);
      setScreen('summary');
    }
  }, [setupRepo, productRepo, profile]);
  const handleModalChange = useCallback((active: boolean) => { blockQuitRef.current = active; }, []);

  const handleOpenHistory = (productId: number): void => {
    const observations = priceRepo.history(productId);
    setHistoryObservations(observations);
    const product = productRepo.findById(productId);
    setHistoryProductTitle(product?.title ?? 'Unknown product');
    setScreen('history');
  };

  if (screen === 'onboarding') {
    return (
      <WizardScreen
        onComplete={(p: RiderProfile) => {
          setProfile(p);
          setScreen('search');
        }}
      />
    );
  }

  if (screen === 'wishlist') {
    return (
      <>
        {profile && <Header profile={profile} />}
        <WishlistView
          setups={setups}
          resolveTitle={resolveTitle}
          onDelete={handleDelete}
          onToggleAlert={handleToggleAlert}
          onOpenHistory={handleOpenHistory}
        />
      </>
    );
  }

  if (screen === 'history') {
    return (
      <>
        {profile && <Header profile={profile} />}
        <HistoryView
          observations={historyObservations}
          productTitle={historyProductTitle}
          onBack={() => {
            setSetups(setupRepo.list()); // refresh wishlist on return
            setScreen('wishlist');
          }}
        />
      </>
    );
  }

  if (screen === 'summary' && profile && summarySetup) {
    return (
      <>
        <Header profile={profile} />
        <SetupSummaryView
          setup={summarySetup}
          productRepo={productRepo}
          rider={profile}
          onWishlist={() => { setSummarySetup(null); setScreen('wishlist'); }}
          onNewSearch={() => { setSummarySetup(null); setScreen('search'); }}
        />
      </>
    );
  }

  if (screen === 'search' && profile) {
    return (
      <>
        <Header profile={profile} />
        <SearchView
          profile={profile}
          supportsImages={supportsImages}
          db={db}
          setupRepo={setupRepo}
          priceRepo={priceRepo}
          productRepo={productRepo}
          isDemoMode={isDemoMode}
          onSetupSaved={handleSetupSaved}
          onModalChange={handleModalChange}
        />
      </>
    );
  }

  // Fallback — should not be reached in normal flow
  return (
    <>
      {profile && <Header profile={profile} />}
      <Text dimColor>Loading...</Text>
    </>
  );
}
