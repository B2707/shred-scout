/**
 * App — Root Ink component with screen state routing and global quit handler.
 * Reads existing profile synchronously at render time to determine initial screen.
 *
 * Phase 8: api-key screen, AgentLoop construction, and apiKey state removed.
 * Screen flow: onboarding → search → wishlist → history.
 */
import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { RiderProfile } from '../types/profile.js';
import { readProfile } from '../lib/profile.js';
import { WizardScreen } from './wizard/WizardScreen.js';
import { Header } from './Header.js';
import { SearchView } from './SearchView.js';
import { WishlistView } from './WishlistView.js';
import { HistoryView } from './HistoryView.js';
import { openDatabase } from '../data/db.js';
import { makeSetupRepo } from '../data/repos/setupRepo.js';
import { makePriceRepo } from '../data/repos/priceRepo.js';
import { makeProductRepo } from '../data/repos/productRepo.js';
import type { SavedSetup } from '../data/repos/setupRepo.js';
import type { PriceObservation } from '../data/repos/priceRepo.js';

type Screen = 'onboarding' | 'search' | 'wishlist' | 'history';

export function App(): React.JSX.Element {
  // Detect image protocol support once at mount — cached boolean passed down as prop.
  // iTerm2: TERM_PROGRAM === 'iTerm.app'; Kitty: KITTY_WINDOW_ID is set.
  // Evaluated once (constant, not state) — no re-render triggered. Locked decision: CONTEXT.md.
  const supportsImages =
    process.env['TERM_PROGRAM'] === 'iTerm.app' ||
    process.env['KITTY_WINDOW_ID'] !== undefined;

  // readProfile() is called inside lazy useState initializers so it runs exactly
  // once at mount — not on every re-render.
  const [screen, setScreen] = useState<Screen>(() => {
    const p = readProfile();
    return p ? 'search' : 'onboarding';
  });
  const [profile, setProfile] = useState<RiderProfile | null>(() => readProfile());

  // Open DB once per app lifetime — repos share this connection
  const db = useMemo(() => openDatabase(), []);
  const setupRepo = useMemo(() => makeSetupRepo(db), [db]);
  const priceRepo = useMemo(() => makePriceRepo(db), [db]);
  const productRepo = useMemo(() => makeProductRepo(db), [db]);

  // Wishlist state — refreshed by calling setupRepo.list()
  const [setups, setSetups] = useState<SavedSetup[]>(() => setupRepo.list());
  // Track which product's history to show in HistoryView
  const [historyObservations, setHistoryObservations] = useState<PriceObservation[]>([]);
  const [historyProductTitle, setHistoryProductTitle] = useState<string>('');

  const { exit } = useApp();

  // Global quit handler — screen-aware to allow child screens to handle q/Escape
  useInput((input: string) => {
    if (screen === 'search' && input === 'q') {
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
          onBack={() => setScreen('search')}
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

  if (screen === 'search' && profile) {
    return (
      <>
        <Header profile={profile} />
        <SearchView
          profile={profile}
          supportsImages={supportsImages}
          setupRepo={setupRepo}
          priceRepo={priceRepo}
          productRepo={productRepo}
          onSetupSaved={() => setSetups(setupRepo.list())}
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
