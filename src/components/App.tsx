/**
 * App — Root Ink component with screen state routing and global quit handler.
 * Reads existing profile synchronously at render time to determine initial screen.
 */
import React, { useState, useMemo } from 'react';
import { Text, useInput } from 'ink';
import type { RiderProfile } from '../types/profile.js';
import { readProfile } from '../lib/profile.js';
import { WizardScreen } from './wizard/WizardScreen.js';
import { Header } from './Header.js';
import { SearchView } from './SearchView.js';
import { AgentLoop } from '../agent/agent-loop.js';
import { openDatabase } from '../data/index.js';

type Screen = 'onboarding' | 'search' | 'results';

export function App(): React.JSX.Element {
  // readProfile() is synchronous — safe to call at render time (no useEffect needed)
  const existingProfile = readProfile();
  const [screen, setScreen] = useState<Screen>(
    existingProfile ? 'search' : 'onboarding',
  );
  const [profile, setProfile] = useState<RiderProfile | null>(existingProfile);

  // Lazy-construct AgentLoop once when profile is available.
  // useMemo with [profile] dep ensures a fresh AgentLoop if profile changes.
  const agentLoop = useMemo(() => {
    if (!profile) return null;
    try {
      const db = openDatabase();
      return new AgentLoop(profile, db);
    } catch {
      return null;
    }
  }, [profile]);

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

  if (screen === 'search' && profile && agentLoop) {
    return (
      <>
        <Header profile={profile} />
        <SearchView agentLoop={agentLoop} profile={profile} />
      </>
    );
  }

  return (
    <>
      {profile && <Header profile={profile} />}
      <Text dimColor>Loading...</Text>
    </>
  );
}
