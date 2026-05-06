/**
 * App — Root Ink component with screen state routing and global quit handler.
 * Reads existing profile synchronously at render time to determine initial screen.
 *
 * Phase 8: api-key screen, AgentLoop construction, and apiKey state removed.
 * Screen flow: onboarding → search only. No LLM dependency.
 */
import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { RiderProfile } from '../types/profile.js';
import { readProfile } from '../lib/profile.js';
import { WizardScreen } from './wizard/WizardScreen.js';
import { Header } from './Header.js';
import { SearchView } from './SearchView.js';

type Screen = 'onboarding' | 'search';

export function App(): React.JSX.Element {
  // readProfile() is synchronous — safe to call at render time (no useEffect needed)
  const existingProfile = readProfile();

  // Detect image protocol support once at mount — cached boolean passed down as prop.
  // iTerm2: TERM_PROGRAM === 'iTerm.app'; Kitty: KITTY_WINDOW_ID is set.
  // Evaluated once (constant, not state) — no re-render triggered. Locked decision: CONTEXT.md.
  const supportsImages =
    process.env['TERM_PROGRAM'] === 'iTerm.app' ||
    process.env['KITTY_WINDOW_ID'] !== undefined;

  const [screen, setScreen] = useState<Screen>(() =>
    existingProfile ? 'search' : 'onboarding'
  );
  const [profile, setProfile] = useState<RiderProfile | null>(existingProfile);

  const { exit } = useApp();
  // Global quit handler — always active, no isActive toggling
  useInput((input: string) => {
    if (input === 'q') {
      exit();
    }
  });

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

  if (screen === 'search' && profile) {
    return (
      <>
        <Header profile={profile} />
        <SearchView profile={profile} supportsImages={supportsImages} />
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
