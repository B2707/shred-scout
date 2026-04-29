/**
 * App — Root Ink component with screen state routing and global quit handler.
 * Reads existing profile synchronously at render time to determine initial screen.
 */
import React, { useState } from 'react';
import { Text, useInput } from 'ink';
import type { RiderProfile } from '../types/profile.js';
import { readProfile } from '../lib/profile.js';
import { WizardScreen } from './wizard/WizardScreen.js';
import { Header } from './Header.js';

type Screen = 'onboarding' | 'search' | 'results';

export function App(): React.JSX.Element {
  // readProfile() is synchronous — safe to call at render time (no useEffect needed)
  const existingProfile = readProfile();
  const [screen, setScreen] = useState<Screen>(
    existingProfile ? 'search' : 'onboarding',
  );
  const [profile, setProfile] = useState<RiderProfile | null>(existingProfile);

  // Global quit handler — always active, no isActive toggling
  useInput((input: string) => {
    if (input === 'q') {
      process.exit(0);
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

  return (
    <>
      {profile && <Header profile={profile} />}
      <Text dimColor>Search coming in Phase 3...</Text>
    </>
  );
}
