import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Images are best-effort; mock the renderers so the step machine can be tested hermetically.
vi.mock('terminal-image', () => ({
  default: { buffer: vi.fn().mockResolvedValue('[img]') },
}));
vi.mock('execa', () => ({
  execa: vi.fn().mockRejectedValue(new Error('no chafa')),
}));
// Mock profile validators so importing the wizard doesn't touch the real conf store.
vi.mock('../src/lib/profile.js', () => ({
  readProfile: vi.fn().mockReturnValue(null),
  writeProfile: vi.fn(),
  validateBootSize: (v: number) => !Number.isNaN(v) && v >= 4.0 && v <= 18.0,
  validateHeightCm: (cm: number) => !Number.isNaN(cm) && cm >= 120 && cm <= 250,
  validateWeightKg: (kg: number) => !Number.isNaN(kg) && kg >= 30 && kg <= 200,
}));

const DOWN = '\x1B[B';

/**
 * Advances time inside React's `act()` so pending async state updates flush within an
 * act-scope. Each step renders ImageOptions that mount a TerminalImage; its useEffect kicks
 * off an async chafa render (mocked to reject), which later calls setState. Outside `act()`
 * those updates trip React 19's "not wrapped in act()" warning and, under a full parallel
 * vitest run, race with the poll below and surface as a "waitUntil timed out" flake. Wrapping
 * the wait in `act()` makes those updates settle deterministically.
 */
const sleep = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

/** Polls until `predicate` is true (or times out) - robust to step-advance timing under load. */
async function waitUntil(
  predicate: () => boolean,
  // Generous under a full parallel run: the step machine plus the async TerminalImage renders
  // can take noticeably longer when every CPU is busy. 11/11 in isolation needs far less; the
  // headroom only matters when the suite runs hot, where the old 2s tripped intermittently.
  timeout = 8000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error('waitUntil timed out');
}

/** Waits until the rendered frame contains `needle` (a step title), then returns. */
function waitForFrame(
  lastFrame: () => string | undefined,
  needle: string,
): Promise<void> {
  return waitUntil(() => (lastFrame() ?? '').includes(needle));
}

afterEach(() => vi.clearAllMocks());

async function importWizard() {
  const mod = await import('../src/components/wizard/GearWizard.js');
  return mod.GearWizard;
}

describe('GearWizard (merged setup flow)', () => {
  it('walks boot → height → weight → skill → style → category → confirm and reports the answers', async () => {
    const GearWizard = await importWizard();
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete,
        onQuit: vi.fn(),
      }),
    );
    // Type into the current numeric step, submit, then wait for the next step to render -
    // polling on the frame removes the fixed-sleep race that made this walk flaky under load.
    const typeInto = async (value: string, nextTitle: string) => {
      stdin.write(value);
      await sleep(15);
      stdin.write('\r');
      await waitForFrame(lastFrame, nextTitle);
    };
    const advance = async (key: string, nextTitle: string) => {
      stdin.write(key);
      await waitForFrame(lastFrame, nextTitle);
    };

    await waitForFrame(lastFrame, 'What is your boot size?');
    await typeInto('10.5', 'How tall are you?'); // boot → height
    await typeInto('178', 'How much do you weigh?'); // height → weight
    await typeInto('165', "What's your skill level?"); // weight (75kg) → skill
    await advance('\r', 'How do you like to ride?'); // skill Beginner → style
    await advance('\r', 'What are you shopping for?'); // style All-Mountain → category
    stdin.write(DOWN);
    await sleep(20);
    stdin.write(DOWN);
    await sleep(20);
    await advance('\r', 'Ready to search?'); // category Boots → confirm (no profile step for boots)
    stdin.write('\r'); // confirm → search
    await waitUntil(() => onComplete.mock.calls.length > 0);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      bootSize: 10.5,
      heightCm: 178,
      weightKg: 75,
      skill: 'beginner',
      style: 'all-mountain',
      category: 'boot',
    });
  });

  it('rejects an invalid boot size and stays on the boot step', async () => {
    const GearWizard = await importWizard();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
      }),
    );
    await sleep(35);
    stdin.write('3.9');
    await sleep(20);
    stdin.write('\r');
    await sleep(35);
    expect(lastFrame()).toContain(
      'Boot size must be a number between 4.0 and 18.0',
    );
    expect(lastFrame()).toContain('What is your boot size?');
  });

  it('pre-fills rider facts from a saved profile (returning rider)', async () => {
    const GearWizard = await importWizard();
    const { lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
        initialProfile: {
          bootSize: 11,
          heightCm: 180,
          weightKg: 80,
          ridingStyle: 'freeride',
          skillLevel: 'advanced',
        },
      }),
    );
    await sleep(35);
    expect(lastFrame()).toContain('current: 11');
    expect(lastFrame()).toContain('press Enter to keep');
  });

  it('displays a pre-filled weight in lbs (the prompt unit), not the stored kg', async () => {
    const GearWizard = await importWizard();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75, // 75kg === 165 lbs
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    const press = async (k: string) => {
      stdin.write(k);
      await sleep(35);
    };
    await sleep(35);
    await press('\r'); // boot kept
    await press('\r'); // height kept → now on weight
    // Wait until the weight step is showing.
    for (
      let i = 0;
      i < 20 && !lastFrame()?.includes('How much do you weigh?');
      i++
    ) {
      await sleep(15);
    }
    const frame = lastFrame() ?? '';
    expect(frame).toContain('How much do you weigh?');
    // The pre-fill must be shown in lbs so re-typing it can't corrupt the stored kg.
    expect(frame).toContain('165 lbs');
    expect(frame).not.toContain('current: 75');
  });

  it('shows the board-profile step when a board is chosen', async () => {
    const GearWizard = await importWizard();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
        // Pre-filled so we can reach the category step with Enter-throughs.
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75,
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    const press = async (k: string) => {
      stdin.write(k);
      await sleep(35);
    };
    await sleep(35);
    await press('\r'); // boot (kept)
    await press('\r'); // height (kept)
    await press('\r'); // weight (kept)
    await press('\r'); // skill
    await press('\r'); // style
    await press('\r'); // category → Snowboard (index 0) → profile step appears
    expect(lastFrame()).toContain('Pick a board profile');
  });

  it('takes a returning rider to the category step (not confirm) when Tab is pressed with no category chosen', async () => {
    const GearWizard = await importWizard();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75,
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    await sleep(35);
    expect(lastFrame()).toContain('What is your boot size?');
    stdin.write('\t'); // ⇥ - fast path stops at category while category is still unset
    await waitForFrame(lastFrame, 'What are you shopping for?');
    expect(lastFrame()).toContain('What are you shopping for?');
    // It must NOT have skipped straight to confirm (which would drop the category).
    expect(lastFrame()).not.toContain('Ready to search?');
  });

  it('a returning rider who Tabs, then picks "Full Setup", completes with category==="setup"', async () => {
    const GearWizard = await importWizard();
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete,
        onQuit: vi.fn(),
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75,
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    await sleep(35);
    stdin.write('\t'); // ⇥ - fast path lands on the category step
    await waitForFrame(lastFrame, 'What are you shopping for?');
    // CATEGORY_OPTIONS order: board, binding, boot, setup - move down to "Full Setup".
    stdin.write(DOWN);
    await sleep(20);
    stdin.write(DOWN);
    await sleep(20);
    stdin.write(DOWN);
    await sleep(20);
    // Full Setup includes a board, so a profile step follows before confirm.
    stdin.write('\r'); // select Full Setup
    await waitForFrame(lastFrame, 'Pick a board profile');
    stdin.write('\r'); // pick the highlighted profile → confirm
    await waitForFrame(lastFrame, 'Ready to search?');
    expect(lastFrame()).toContain('Full Setup'); // "Looking for" row is present
    stdin.write('\r'); // confirm → complete
    await waitUntil(() => onComplete.mock.calls.length > 0);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ category: 'setup' });
  });

  it('lets a returning rider skip straight to the search step with Tab once a category is chosen', async () => {
    const GearWizard = await importWizard();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75,
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    await sleep(35);
    expect(lastFrame()).toContain('What is your boot size?');
    stdin.write('\t'); // ⇥ - lands on category (unset)
    await waitForFrame(lastFrame, 'What are you shopping for?');
    stdin.write('\r'); // pick Snowboard (index 0) → category now set
    await waitForFrame(lastFrame, 'Pick a board profile');
    stdin.write('\t'); // ⇥ - now category is set, so the fast path reaches confirm
    await waitForFrame(lastFrame, 'Ready to search?');
    expect(lastFrame()).toContain('Ready to search?');
  });

  it('does not let a brand-new rider skip ahead with Tab (no saved profile)', async () => {
    const GearWizard = await importWizard();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
      }),
    );
    await sleep(35);
    stdin.write('\t');
    await sleep(35);
    expect(lastFrame()).toContain('What is your boot size?'); // still on the first step
  });

  it('windows a tall option list so it scrolls instead of overflowing the terminal', async () => {
    const GearWizard = await importWizard();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75,
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    const press = async (k: string) => {
      stdin.write(k);
      await sleep(35);
    };
    await sleep(35);
    await press('\r'); // boot
    await press('\r'); // height
    await press('\r'); // weight
    await press('\r'); // skill → now on the 6-option style step
    expect(lastFrame()).toContain('How do you like to ride?');
    // Six 4-row options can't all fit a default terminal - a scroll indicator must appear.
    expect(lastFrame()).toMatch(/more/);
  });

  it('q quits once past the text-input steps', async () => {
    const GearWizard = await importWizard();
    const onQuit = vi.fn();
    const { stdin } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit,
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75,
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    const press = async (k: string) => {
      stdin.write(k);
      await sleep(35);
    };
    await sleep(35);
    await press('\r'); // boot
    await press('\r'); // height
    await press('\r'); // weight → now on skill (a select step)
    await press('q');
    expect(onQuit).toHaveBeenCalled();
  });

  it('Esc on the first input step quits the wizard', async () => {
    const GearWizard = await importWizard();
    const onQuit = vi.fn();
    const { stdin } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit,
      }),
    );
    await sleep(35);
    stdin.write('\x1B'); // Esc on boot (step 0) → leaves the wizard
    await sleep(35);
    expect(onQuit).toHaveBeenCalled();
  });

  it('Esc on a later input step goes back one step (without exiting)', async () => {
    const GearWizard = await importWizard();
    const onQuit = vi.fn();
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit,
        initialProfile: {
          bootSize: 10,
          heightCm: 178,
          weightKg: 75,
          ridingStyle: 'all-mountain',
          skillLevel: 'intermediate',
        },
      }),
    );
    const press = async (k: string) => {
      stdin.write(k);
      await sleep(35);
    };
    await sleep(35);
    await press('\r'); // boot kept → now on height
    expect(lastFrame()).toContain('How tall are you?');
    // The input-step hint must advertise the back affordance.
    expect(lastFrame()).toContain('Esc back');
    await press('\x1B'); // Esc → back to the boot step
    expect(lastFrame()).toContain('What is your boot size?');
    expect(onQuit).not.toHaveBeenCalled();
  });
});
