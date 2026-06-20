/**
 * App - Root Ink component with screen state routing and global quit handler.
 * Reads any saved profile synchronously at mount to pre-fill the guided wizard.
 *
 * Screen flow: wizard → search → (wishlist | history | summary).
 */

import { Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { openDatabase } from '../data/db.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import type { PriceObservation } from '../data/repos/priceRepo.js';
import { makePriceRepo } from '../data/repos/priceRepo.js';
import { makeProductRepo } from '../data/repos/productRepo.js';
import type { SavedSetup } from '../data/repos/setupRepo.js';
import { makeSetupRepo } from '../data/repos/setupRepo.js';
import { evaluateCompatibility } from '../domain/compatibility/engine.js';
import {
  toBinding,
  toBoard,
  toBoot,
} from '../domain/compatibility/product-adapter.js';
import { readProfile, writeProfile } from '../lib/profile.js';
import type { RiderProfile } from '../types/profile.js';
import { Header } from './Header.js';
import { HistoryView } from './HistoryView.js';
import { SearchView } from './SearchView.js';
import { SetupBuilderView } from './SetupBuilderView.js';
import { SetupSummaryView } from './SetupSummaryView.js';
import { WishlistView } from './WishlistView.js';
import { GearWizard } from './wizard/GearWizard.js';
import {
  answersToProfile,
  type WizardAnswers,
  wizardToSearch,
} from './wizard/wizard-config.js';

type Screen =
  | 'wizard'
  | 'search'
  | 'builder'
  | 'wishlist'
  | 'history'
  | 'summary';

/**
 * Decides where the wizard's quit action leads. When the wizard was opened from a live results
 * screen (via 'n') AND a search session is still preserved, quitting cancels back to those
 * results instead of terminating the app; otherwise (initial launch / no session) it exits.
 */
export function nextScreenOnWizardQuit(
  openedFromResults: boolean,
  hasSession: boolean,
): 'search' | 'exit' {
  return openedFromResults && hasSession ? 'search' : 'exit';
}

/**
 * Whether a save should jump to the setup-complete summary. Only true when the save that just
 * happened is the one that COMPLETED the setup - i.e. the newly-complete setup's id matches the
 * id this save touched. Without this, any save made while an older complete setup exists in the
 * DB hijacks the user to that old summary (and eats the alert prompt), making a 2nd setup
 * impossible. `undefined` justSavedSetupId means a plain refresh (e.g. enabling an alert).
 */
export function shouldOpenSummary(
  completeSetupId: number | null | undefined,
  justSavedSetupId: number | undefined,
): boolean {
  return (
    justSavedSetupId !== undefined &&
    completeSetupId !== null &&
    completeSetupId !== undefined &&
    completeSetupId === justSavedSetupId
  );
}

/** Hardcoded demo rider profile - pre-fills the wizard and uses an in-memory DB */
const DEMO_PROFILE: RiderProfile = {
  bootSize: 10,
  heightCm: 180,
  weightKg: 80,
  ridingStyle: 'all-mountain',
  skillLevel: 'advanced',
};

export function App({
  isDemoMode = false,
}: {
  isDemoMode?: boolean;
}): React.JSX.Element {
  // Detect image protocol support once at mount - cached boolean passed down as prop.
  // iTerm2: TERM_PROGRAM === 'iTerm.app'; Kitty: KITTY_WINDOW_ID is set.
  // Evaluated once (constant, not state) - no re-render triggered.
  const supportsImages =
    process.env.TERM_PROGRAM === 'iTerm.app' ||
    process.env.KITTY_WINDOW_ID !== undefined;

  // Always start on the single guided wizard. A saved profile (read once at mount via the
  // lazy useState initializer below) pre-fills the rider-fact steps rather than skipping them.
  const [screen, setScreen] = useState<Screen>('wizard');
  // True only while the wizard was opened from a live results screen (via 'n'), so quitting it
  // returns to those preserved results instead of exiting the whole app.
  const [wizardReturnable, setWizardReturnable] = useState(false);
  const [profile, setProfile] = useState<RiderProfile | null>(() => {
    if (isDemoMode) return DEMO_PROFILE;
    return readProfile();
  });

  // Open DB once per app lifetime - repos share this connection.
  // Demo mode uses ':memory:' SQLite so no production data is touched.
  const db = useMemo(
    () => openDatabase(isDemoMode ? ':memory:' : undefined),
    [isDemoMode],
  );
  const setupRepo = useMemo(() => makeSetupRepo(db), [db]);
  const priceRepo = useMemo(() => makePriceRepo(db), [db]);
  const productRepo = useMemo(() => makeProductRepo(db), [db]);

  // Wishlist state - refreshed by calling setupRepo.list()
  const [setups, setSetups] = useState<SavedSetup[]>(() => setupRepo.list());
  // Summary screen: snapshot of the complete setup that triggered the transition
  const [summarySetup, setSummarySetup] = useState<SavedSetup | null>(null);
  // The query + pre-applied filters produced by the guided wizard (drives the results screen).
  const [wizardSearch, setWizardSearch] = useState<{
    query: string;
    filters: string[];
  } | null>(null);
  // Cached results + filters from the current search, preserved across wishlist/history
  // navigation so returning doesn't re-fetch or reset. A ref so writes don't re-render.
  const sessionRef = useRef<{
    products: NormalizedProduct[];
    filters: string[];
  } | null>(null);
  // Track which product's history to show in HistoryView
  const [historyObservations, setHistoryObservations] = useState<
    PriceObservation[]
  >([]);
  const [historyProductTitle, setHistoryProductTitle] = useState<string>('');

  const { exit } = useApp();

  // blockQuit is set to true by SearchView when an alert opt-in modal is active.
  // A ref (not state) is used so the useInput closure always reads the current value
  // without requiring the useInput hook to re-register on every toggle.
  const blockQuitRef = useRef(false);

  // Global quit handler - screen-aware to allow child screens to handle q/Escape.
  // Gate search-screen quit behind blockQuitRef so SearchView's modal can own 'q'.
  useInput((input: string) => {
    // On the results screen, suppress all global keys while a SearchView mode/modal owns
    // input (filter panel, save box, or the alert prompt) - blockQuitRef is set via
    // onModalChange - so q/w/n never fire mid-typing.
    if (screen === 'search') {
      if (blockQuitRef.current) return;
      if (input === 'q') {
        exit();
        return;
      }
      if (input === 'w') {
        setSetups(setupRepo.list());
        setScreen('wishlist');
        return;
      }
      if (input === 'n') {
        // Opened from results - preserve the session so quitting the wizard returns here.
        setWizardReturnable(true);
        setScreen('wizard');
        return;
      }
    }
    if (screen === 'wishlist') {
      // Gate 'q' while WishlistView's delete-confirm prompt owns input - same
      // blockQuitRef mechanism the search screen uses, fed by WishlistView.onModalChange.
      if (blockQuitRef.current) return;
      if (input === 'q') setScreen('search');
    }
    if (screen === 'history' && input === 'q') {
      setScreen('wishlist');
    }
  });

  // Handler functions - defined before conditional returns so hooks are always called first
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

  const handleSetupSaved = useCallback(
    (justSavedSetupId?: number) => {
      const complete = setupRepo.findCompleteSetup();
      if (complete && shouldOpenSummary(complete.id, justSavedSetupId)) {
        // Compute + persist the compatibility snapshot once the setup is complete
        // so the wishlist CompatBadge renders. Skip if already stored.
        if (!complete.compatibility && profile) {
          const board =
            complete.boardId !== null
              ? productRepo.findById(complete.boardId)
              : null;
          const binding =
            complete.bindingId !== null
              ? productRepo.findById(complete.bindingId)
              : null;
          const boot =
            complete.bootId !== null
              ? productRepo.findById(complete.bootId)
              : null;
          if (board && binding && boot) {
            const results = evaluateCompatibility(
              {
                board: toBoard(board),
                binding: toBinding(binding),
                boot: toBoot(profile.bootSize),
              },
              profile,
            );
            setupRepo.setCompatibility(complete.id, results);
            complete.compatibility = results;
          }
        }
        setSummarySetup(complete);
        setScreen('summary');
      }
      // Refresh AFTER persisting compatibility so the cached wishlist rows carry the snapshot
      // (badge shows on the summary → wishlist path without a manual refresh).
      setSetups(setupRepo.list());
    },
    [setupRepo, productRepo, profile],
  );
  const handleModalChange = useCallback((active: boolean) => {
    blockQuitRef.current = active;
  }, []);

  // Guided wizard finished - persist the rider profile, turn the answers into a search, and
  // show the results. Clear any cached session so the new wizard query actually runs.
  const handleWizardComplete = useCallback(
    (answers: WizardAnswers) => {
      const completedProfile = answersToProfile(answers);
      // Never persist to the real conf store in demo mode (the DB is already in-memory).
      if (!isDemoMode) writeProfile(completedProfile);
      setProfile(completedProfile);
      setWizardReturnable(false);
      sessionRef.current = null;
      // A "Full Setup" answer routes to the interactive builder; any single category keeps the
      // existing search-results path.
      if (answers.category === 'setup') {
        setWizardSearch(null);
        setScreen('builder');
      } else {
        setWizardSearch(wizardToSearch(answers));
        setScreen('search');
      }
    },
    [isDemoMode],
  );

  // Quitting the wizard: cancel back to live results if we came from there, else exit the app.
  const handleWizardQuit = useCallback(() => {
    if (
      nextScreenOnWizardQuit(wizardReturnable, sessionRef.current !== null) ===
      'search'
    ) {
      setWizardReturnable(false);
      setScreen('search');
    } else {
      exit();
    }
  }, [wizardReturnable, exit]);

  const handleSession = useCallback(
    (products: NormalizedProduct[], filters: string[]) => {
      sessionRef.current = { products, filters };
    },
    [],
  );

  const handleOpenHistory = (productId: number): void => {
    const observations = priceRepo.history(productId);
    setHistoryObservations(observations);
    const product = productRepo.findById(productId);
    setHistoryProductTitle(product?.title ?? 'Unknown product');
    setScreen('history');
  };

  if (screen === 'wizard') {
    // No profile Header here - the wizard owns its own framed chrome (and you're setting the
    // profile, so the bar would be redundant). The Header returns on the search screen.
    return (
      <GearWizard
        supportsImages={supportsImages}
        onComplete={handleWizardComplete}
        onQuit={handleWizardQuit}
        initialProfile={profile}
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
          onModalChange={handleModalChange}
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
          onWishlist={() => {
            setSummarySetup(null);
            setScreen('wishlist');
          }}
          onNewSearch={() => {
            setSummarySetup(null);
            setScreen('wizard');
          }}
          onToggleAlert={handleToggleAlert}
        />
      </>
    );
  }

  if (screen === 'builder' && profile) {
    return (
      <>
        <Header profile={profile} />
        <SetupBuilderView
          rider={profile}
          setupRepo={setupRepo}
          priceRepo={priceRepo}
          productRepo={productRepo}
          supportsImages={supportsImages}
          db={db}
          isDemoMode={isDemoMode}
          products={sessionRef.current?.products}
          onSetupSaved={handleSetupSaved}
          onBack={() => {
            // Back out to the preserved search results if a session exists, else the wizard.
            if (sessionRef.current !== null) setScreen('search');
            else setScreen('wizard');
          }}
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
          initialQuery={wizardSearch?.query}
          initialFilters={sessionRef.current?.filters ?? wizardSearch?.filters}
          initialProducts={sessionRef.current?.products}
          onSession={handleSession}
        />
      </>
    );
  }

  // Fallback - should not be reached in normal flow
  return (
    <>
      {profile && <Header profile={profile} />}
      <Text dimColor>Loading...</Text>
    </>
  );
}
