/**
 * App — Root Ink component with screen state routing and global quit handler.
 * Reads existing profile synchronously at render time to determine initial screen.
 */
import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { RiderProfile } from '../types/profile.js';
import { readProfile, loadApiKeyToEnv, writeApiKey } from '../lib/profile.js';
import { WizardScreen } from './wizard/WizardScreen.js';
import { ApiKeyStep } from './wizard/ApiKeyStep.js';
import { Header } from './Header.js';
import { SearchView } from './SearchView.js';
import { AgentLoop } from '../agent/agent-loop.js';
import { openDatabase } from '../data/index.js';

type Screen = 'onboarding' | 'api-key' | 'search' | 'results';

export function App(): React.JSX.Element {
  // Load saved API key into env before any state initialization.
  // No-ops if ANTHROPIC_API_KEY is already set in the environment.
  loadApiKeyToEnv();

  // readProfile() is synchronous — safe to call at render time (no useEffect needed)
  const existingProfile = readProfile();
  const hasApiKey = Boolean(process.env['ANTHROPIC_API_KEY']);

  // Detect image protocol support once at mount — cached boolean passed down as prop.
  // iTerm2: TERM_PROGRAM === 'iTerm.app'; Kitty: KITTY_WINDOW_ID is set.
  // Evaluated once (constant, not state) — no re-render triggered. Locked decision: CONTEXT.md.
  const supportsImages =
    process.env['TERM_PROGRAM'] === 'iTerm.app' ||
    process.env['KITTY_WINDOW_ID'] !== undefined;

  const [screen, setScreen] = useState<Screen>(() => {
    if (!existingProfile) return 'onboarding';
    if (!hasApiKey) return 'api-key';
    return 'search';
  });
  const [profile, setProfile] = useState<RiderProfile | null>(existingProfile);

  // Lazy-construct AgentLoop once when profile is available.
  // useMemo with [profile] dep ensures a fresh AgentLoop if profile changes.
  // Returns both the loop and any construction error so the UI can display failures.
  const [agentLoop, initError] = useMemo<[import('../agent/agent-loop.js').AgentLoop | null, string | null]>(() => {
    if (!profile) return [null, null];
    try {
      const db = openDatabase();
      return [new AgentLoop(profile, db), null];
    } catch (err) {
      return [null, err instanceof Error ? err.message : 'Failed to initialize'];
    }
  }, [profile]);

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
          setScreen(process.env['ANTHROPIC_API_KEY'] ? 'search' : 'api-key');
        }}
      />
    );
  }

  if (screen === 'api-key') {
    return (
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        gap={1}
        width={60}
      >
        <Text>
          <Text bold color="cyanBright">Shred Scout</Text>
          <Text dimColor> — API Key Setup</Text>
        </Text>
        <ApiKeyStep
          onSubmit={(key: string) => {
            writeApiKey(key);
            process.env['ANTHROPIC_API_KEY'] = key;
            setScreen('search');
          }}
        />
      </Box>
    );
  }

  if (screen === 'search' && profile && agentLoop) {
    return (
      <>
        <Header profile={profile} />
        <SearchView agentLoop={agentLoop} profile={profile} supportsImages={supportsImages} />
      </>
    );
  }

  if (initError) {
    return <Text color="red">Initialization error: {initError}</Text>;
  }

  return (
    <>
      {profile && <Header profile={profile} />}
      <Text dimColor>Loading...</Text>
    </>
  );
}
