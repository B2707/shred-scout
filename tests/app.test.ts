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

// The merged wizard renders image-select steps; mock the image renderers so no real
// chafa subprocess is spawned during routing tests.
vi.mock('terminal-image', () => ({
  default: { buffer: vi.fn().mockResolvedValue('[img]') },
}));
vi.mock('execa', () => ({
  execa: vi.fn().mockRejectedValue(new Error('no chafa')),
}));

import {
  App,
  nextScreenOnWizardQuit,
  shouldOpenSummary,
} from '../src/components/App.js';
import { readProfile, writeProfile } from '../src/lib/profile.js';

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
    await new Promise<void>((resolve) => setTimeout(resolve, 15));
  });
  await act(async () => {
    stdin.write('\r');
    await new Promise<void>((resolve) => setTimeout(resolve, 15));
  });
}

/** Polls the rendered frame until `predicate` holds - robust to step-advance timing under load. */
async function waitUntilFrame(
  lastFrame: () => string | undefined,
  predicate: (frame: string) => boolean,
  timeout = 2000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (predicate(lastFrame() ?? '')) return;
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 15));
    });
  }
}

/** Presses Enter (advancing one wizard step) until `done` holds or a bounded cap is hit. */
async function pressEnterUntil(
  stdin: { write: (s: string) => void },
  done: () => boolean,
  max = 14,
): Promise<void> {
  for (let i = 0; i < max && !done(); i++) {
    await act(async () => {
      stdin.write('\r');
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
    });
  }
}

/** Presses Enter once and lets the next step mount. */
async function pressEnter(stdin: {
  write: (s: string) => void;
}): Promise<void> {
  await act(async () => {
    stdin.write('\r');
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
  });
}

/** Presses the down arrow once (moves the option highlight). */
async function pressDown(stdin: { write: (s: string) => void }): Promise<void> {
  await act(async () => {
    stdin.write('\x1B[B');
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
  });
}

describe('App - wizard category routing', () => {
  it("routes to the setup builder when the wizard's category is 'Full Setup'", async () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { lastFrame, stdin } = render(React.createElement(App));
    expect(lastFrame()).toContain('What is your boot size?');
    await submitText(stdin, '10.5'); // boot
    await waitUntilFrame(lastFrame, (f) => f.includes('How tall are you?'));
    await submitText(stdin, '178'); // height
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('How much do you weigh?'),
    );
    await submitText(stdin, '165'); // weight
    await waitUntilFrame(lastFrame, (f) =>
      f.includes("What's your skill level?"),
    );
    await pressEnter(stdin); // skill -> style
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('How do you like to ride?'),
    );
    await pressEnter(stdin); // style -> category
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('What are you shopping for?'),
    );
    // Move the highlight to "Full Setup" (4th option, index 3) and select it.
    await pressDown(stdin);
    await pressDown(stdin);
    await pressDown(stdin);
    await pressEnter(stdin); // category=setup -> profile (setup shows the board-profile step)
    await waitUntilFrame(lastFrame, (f) => f.includes('Pick a board profile'));
    await pressEnter(stdin); // profile -> flex
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('How stiff do you want it?'),
    );
    await pressEnter(stdin); // flex -> budget
    await waitUntilFrame(lastFrame, (f) => f.includes("What's your budget?"));
    await pressEnter(stdin); // budget -> confirm
    await waitUntilFrame(lastFrame, (f) => f.includes('Ready to search?'));
    await pressEnter(stdin); // confirm -> complete

    await waitUntilFrame(lastFrame, (f) => f.includes('YOUR SETUP'));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('YOUR SETUP'); // the builder screen, not search results
    expect(frame).toContain('CHOOSE A BOARD');
    expect(frame).not.toContain('[/] filters'); // not the search-results footer
  });

  it("routes to the search results when the wizard's category is a single category", async () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { lastFrame, stdin } = render(React.createElement(App));
    expect(lastFrame()).toContain('What is your boot size?');
    await submitText(stdin, '10.5'); // boot
    await waitUntilFrame(lastFrame, (f) => f.includes('How tall are you?'));
    await submitText(stdin, '178'); // height
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('How much do you weigh?'),
    );
    await submitText(stdin, '165'); // weight
    await waitUntilFrame(lastFrame, (f) =>
      f.includes("What's your skill level?"),
    );
    await pressEnter(stdin); // skill -> style
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('How do you like to ride?'),
    );
    await pressEnter(stdin); // style -> category
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('What are you shopping for?'),
    );
    // Leave the highlight on the first option ("Snowboard" - a single category) and select it.
    await pressEnter(stdin); // category=board -> profile
    await waitUntilFrame(lastFrame, (f) => f.includes('Pick a board profile'));
    await pressEnter(stdin); // profile -> flex
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('How stiff do you want it?'),
    );
    await pressEnter(stdin); // flex -> budget
    await waitUntilFrame(lastFrame, (f) => f.includes("What's your budget?"));
    await pressEnter(stdin); // budget -> confirm
    await waitUntilFrame(lastFrame, (f) => f.includes('Ready to search?'));
    await pressEnter(stdin); // confirm -> complete

    await waitUntilFrame(lastFrame, (f) => f.includes('[/] filters'));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[/] filters'); // the search-results footer
    expect(frame).not.toContain('YOUR SETUP'); // not the builder screen
  });
});

describe('App - screen routing', () => {
  it('starts on the merged wizard at the boot step when no profile exists', () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { lastFrame } = render(React.createElement(App));
    expect(lastFrame()).toContain('What is your boot size?');
  });

  it('pre-fills the wizard from a saved profile (no Header on the wizard screen)', () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      bootSize: 10.5,
      heightCm: 178,
      weightKg: 75,
      ridingStyle: 'all-mountain',
      skillLevel: 'advanced',
    });
    const { lastFrame } = render(React.createElement(App));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Guided Setup'); // wizard's own framed chrome
    expect(frame).toContain('current: 10.5'); // boot step pre-filled from the saved profile
  });

  it('transitions to the search screen after the wizard completes', async () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { lastFrame, stdin } = render(React.createElement(App));
    expect(lastFrame()).toContain('What is your boot size?');
    // Wait for each numeric step to mount before typing, then press through the choice steps.
    await submitText(stdin, '10.5'); // boot
    await waitUntilFrame(lastFrame, (f) => f.includes('How tall are you?'));
    await submitText(stdin, '178'); // height
    await waitUntilFrame(lastFrame, (f) =>
      f.includes('How much do you weigh?'),
    );
    await submitText(stdin, '165'); // weight
    await waitUntilFrame(lastFrame, (f) =>
      f.includes("What's your skill level?"),
    );
    // skill → style → category(Snowboard) → profile → flex → budget → confirm → search
    await pressEnterUntil(stdin, () =>
      (lastFrame() ?? '').includes('Boot: 10.5'),
    );
    expect(lastFrame()).not.toContain('What is your boot size?');
    expect(lastFrame()).toContain('Boot: 10.5');
  });
});

describe('App - summary screen routing', () => {
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

describe('nextScreenOnWizardQuit', () => {
  it('returns to the live results session when the wizard was opened from results', () => {
    expect(nextScreenOnWizardQuit(true, true)).toBe('search');
  });
  it('exits when not opened from results, or when no session is preserved', () => {
    expect(nextScreenOnWizardQuit(false, true)).toBe('exit');
    expect(nextScreenOnWizardQuit(true, false)).toBe('exit');
    expect(nextScreenOnWizardQuit(false, false)).toBe('exit');
  });
});

describe('shouldOpenSummary (a second setup must not be hijacked to the old summary)', () => {
  it('opens the summary only when the save that just happened completed THAT setup', () => {
    expect(shouldOpenSummary(5, 5)).toBe(true);
  });
  it('does not open the old setup summary on an unrelated save, or on an alert refresh', () => {
    expect(shouldOpenSummary(3, 5)).toBe(false); // old complete #3 exists, this save was #5
    expect(shouldOpenSummary(null, 5)).toBe(false); // nothing complete yet
    expect(shouldOpenSummary(5, undefined)).toBe(false); // alert refresh - no save id
  });
});

describe('App - demo isolation', () => {
  it('does not write the rider profile to the real store in demo mode', async () => {
    (writeProfile as ReturnType<typeof vi.fn>).mockClear();
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { stdin, lastFrame } = render(
      React.createElement(App, { isDemoMode: true }),
    );
    // Demo pre-fills every rider fact, so Enter-throughs complete the whole wizard. Press until
    // the wizard chrome is gone (we've reached the results screen) rather than a fixed count.
    await pressEnterUntil(
      stdin,
      () => !(lastFrame() ?? '').includes('Guided Setup'),
    );
    // Whatever screen we land on, a demo run must never persist to the real conf store.
    expect(writeProfile).not.toHaveBeenCalled();
    expect(lastFrame()).not.toContain('What is your boot size?');
  });
});

describe('App - global quit handler', () => {
  it('exits via ink useApp().exit() when q is pressed - does not call process.exit directly', async () => {
    (readProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { stdin } = render(React.createElement(App));
    await act(async () => {
      stdin.write('q');
    });
    expect(process.exit).not.toHaveBeenCalled();
  });
});
