import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/profile.js', () => ({
  readProfile: vi.fn().mockReturnValue(null),
  writeProfile: vi.fn(),
  validateBootSize: vi
    .fn()
    .mockImplementation(
      (v: number) => !Number.isNaN(v) && v >= 4.0 && v <= 18.0,
    ),
  validateHeightCm: vi
    .fn()
    .mockImplementation(
      (cm: number) => !Number.isNaN(cm) && cm >= 120 && cm <= 250,
    ),
  validateWeightKg: vi
    .fn()
    .mockImplementation(
      (kg: number) => !Number.isNaN(kg) && kg >= 30 && kg <= 200,
    ),
}));

vi.mock('../src/data/index.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/data/index.js')>();
  return { ...mod, openDatabase: vi.fn().mockReturnValue({}) };
});

// Mock runSearch so SearchView doesn't make real HTTP calls during App tests
vi.mock('../src/agent/search-pipeline.js', () => ({
  runSearch: vi.fn().mockResolvedValue({ products: [], errors: [] }),
}));

vi.mock('../src/data/pipeline.js', () => ({
  RequestPipeline: class MockRequestPipeline {},
}));

import { App } from '../src/components/App.js';
import { readProfile } from '../src/lib/profile.js';

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function submitText(
  stdin: { write: (s: string) => void },
  value: string,
): Promise<void> {
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
    expect(lastFrame()).toContain('Profile Setup (1/4)');
    await submitText(stdin, '10.5');
    await submitText(stdin, '178');
    await submitText(stdin, '165');
    await act(async () => {
      stdin.write('\r');
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });
    expect(lastFrame()).not.toContain('Profile Setup');
    expect(lastFrame()).toContain('Boot: 10.5');
  });
});

describe('App — summary screen routing', () => {
  it('App renders without crashing when isDemoMode is true (smoke test for summary screen plumbing)', () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      bootSize: 10,
      heightCm: 178,
      weightKg: 75,
      ridingStyle: 'all-mountain',
    });
    const { lastFrame } = render(
      React.createElement(App, { isDemoMode: true }),
    );
    // Should render search screen in demo mode (no summary yet)
    expect(lastFrame()).not.toBeNull();
  });
});

describe('App — global quit handler', () => {
  it('exits via ink useApp().exit() when q is pressed — does not call process.exit directly', async () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { stdin } = render(React.createElement(App));
    await act(async () => {
      stdin.write('q');
    });
    expect(process.exit).not.toHaveBeenCalled();
  });
});
