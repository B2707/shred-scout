import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { render } from 'ink-testing-library';

// Mock profile module to control readProfile return value and prevent real conf writes.
// vi.mock is hoisted to the top of the file by vitest.
vi.mock('../src/lib/profile.js', () => ({
  readProfile: vi.fn().mockReturnValue(null),
  writeProfile: vi.fn(),
  validateBootSize: vi.fn().mockImplementation((v: number) => !isNaN(v) && v >= 4.0 && v <= 18.0),
  validateHeightCm: vi.fn().mockImplementation((cm: number) => !isNaN(cm) && cm >= 120 && cm <= 250),
  validateWeightKg: vi.fn().mockImplementation((kg: number) => !isNaN(kg) && kg >= 30 && kg <= 200),
}));

// Import after vi.mock (vi.mock is hoisted so mocks are applied before these imports)
import { App } from '../src/components/App.js';
import { readProfile } from '../src/lib/profile.js';

beforeEach(() => {
  // Mock process.exit to prevent test from exiting when 'q' is pressed
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  // Reset readProfile mock to return null by default
  (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to submit text value using act to flush React state updates
async function submitText(stdin: { write: (s: string) => void }, value: string): Promise<void> {
  await act(async () => {
    stdin.write(value);
  });
  await act(async () => {
    stdin.write('\r');
  });
}

describe('App — screen routing', () => {
  it('renders WizardScreen (onboarding) when no profile exists', () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { lastFrame } = render(React.createElement(App));
    expect(lastFrame()).toContain('Profile Setup');
  });

  it('renders Header (not wizard) when profile exists', () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      bootSize: 10.5,
      heightCm: 178,
      weightKg: 75,
      ridingStyle: 'all-mountain',
    });
    const { lastFrame } = render(React.createElement(App));
    expect(lastFrame()).toContain('Boot: 10.5');
    expect(lastFrame()).not.toContain('Profile Setup');
  });

  it('transitions from onboarding to search screen after wizard completes', async () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { lastFrame, stdin } = render(React.createElement(App));

    // Verify wizard is shown first
    expect(lastFrame()).toContain('Profile Setup (1/4)');

    // Advance through all wizard steps
    await submitText(stdin, '10.5');  // Step 1: boot size
    await submitText(stdin, '178');   // Step 2: height (bare cm)
    await submitText(stdin, '165');   // Step 3: weight

    // Step 4: riding style — press Enter to select first option (All-Mountain).
    // Select's onChange fires via useEffect — wrap with act + wait for scheduler.
    await act(async () => {
      stdin.write('\r');
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });

    expect(lastFrame()).not.toContain('Profile Setup');
    expect(lastFrame()).toContain('Boot: 10.5');
  });
});

describe('App — global quit handler', () => {
  it('calls process.exit(0) when q is pressed', async () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { stdin } = render(React.createElement(App));
    await act(async () => {
      stdin.write('q');
    });
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
