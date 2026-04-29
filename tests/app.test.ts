import { describe, it, vi, afterEach } from 'vitest';

// Stubs — implementations added in Plan 02 after App component is created.

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('App — screen routing', () => {
  it.todo('renders WizardScreen (onboarding) when no profile exists');
  it.todo('renders Header (not wizard) when profile exists');
  it.todo('transitions from onboarding to search screen after wizard completes');
});

describe('App — global quit handler', () => {
  it.todo('calls process.exit(0) when q is pressed');
});
