import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock profile module to prevent real conf writes during tests.
// vi.mock is hoisted to the top of the file by vitest.
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

// Import components after vi.mock registration (vi.mock is hoisted so this is safe)
import { WizardScreen } from '../src/components/wizard/WizardScreen.js';

beforeEach(() => {
  // Mock process.exit to prevent test suite from exiting when 'q' is pressed
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to submit a text value by typing it and pressing Enter.
// Uses act() to flush React state updates between the type and Enter keypresses.
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

// Helper to create a fresh WizardScreen render
function renderWizard(onComplete = vi.fn()) {
  return render(React.createElement(WizardScreen, { onComplete }));
}

describe('WizardScreen — step 1 (boot size)', () => {
  it('renders "Profile Setup (1/4)" on first render', () => {
    const { lastFrame } = renderWizard();
    expect(lastFrame()).toContain('Profile Setup (1/4)');
  });

  it('renders "What is your boot size?" prompt', () => {
    const { lastFrame } = renderWizard();
    expect(lastFrame()).toContain('What is your boot size?');
  });

  it('advances to step 2 on valid boot size submit', async () => {
    const { lastFrame, stdin } = renderWizard();
    await submitText(stdin, '10.5');
    expect(lastFrame()).toContain('Profile Setup (2/4)');
    expect(lastFrame()).toContain('How tall are you?');
  });

  it('stays on step 1 with error on invalid input (e.g. "3.9")', async () => {
    const { lastFrame, stdin } = renderWizard();
    await submitText(stdin, '3.9');
    expect(lastFrame()).toContain('Profile Setup (1/4)');
    expect(lastFrame()).toContain(
      'Boot size must be a number between 4.0 and 18.0',
    );
  });

  it('error message reads: Boot size must be a number between 4.0 and 18.0', async () => {
    const { lastFrame, stdin } = renderWizard();
    await submitText(stdin, '0');
    expect(lastFrame()).toContain(
      'Boot size must be a number between 4.0 and 18.0',
    );
  });
});

describe('WizardScreen — step 2 (height)', () => {
  // Helper: advance to step 2
  async function renderAtStep2(onComplete = vi.fn()) {
    const result = render(React.createElement(WizardScreen, { onComplete }));
    await submitText(result.stdin, '10.5');
    return result;
  }

  it('renders "Profile Setup (2/4)" after step 1 advance', async () => {
    const { lastFrame } = await renderAtStep2();
    expect(lastFrame()).toContain('Profile Setup (2/4)');
  });

  it('renders "How tall are you?" prompt', async () => {
    const { lastFrame } = await renderAtStep2();
    expect(lastFrame()).toContain('How tall are you?');
  });

  it('advances to step 3 on valid feet/inches input (5\'10")', async () => {
    const { lastFrame, stdin } = await renderAtStep2();
    await submitText(stdin, '5\'10"');
    expect(lastFrame()).toContain('Profile Setup (3/4)');
    expect(lastFrame()).toContain('How much do you weigh?');
  });

  it('advances to step 3 on valid bare cm input (178)', async () => {
    const { lastFrame, stdin } = await renderAtStep2();
    await submitText(stdin, '178');
    expect(lastFrame()).toContain('Profile Setup (3/4)');
  });

  it('stays on step 2 with error on unparseable input', async () => {
    const { lastFrame, stdin } = await renderAtStep2();
    await submitText(stdin, 'abc');
    expect(lastFrame()).toContain('Profile Setup (2/4)');
    expect(lastFrame()).toContain('Enter height as');
  });
});

describe('WizardScreen — step 3 (weight)', () => {
  // Helper: advance to step 3
  async function renderAtStep3(onComplete = vi.fn()) {
    const result = render(React.createElement(WizardScreen, { onComplete }));
    await submitText(result.stdin, '10.5');
    await submitText(result.stdin, '178');
    return result;
  }

  it('renders "Profile Setup (3/4)" after step 2 advance', async () => {
    const { lastFrame } = await renderAtStep3();
    expect(lastFrame()).toContain('Profile Setup (3/4)');
  });

  it('renders "How much do you weigh?" prompt', async () => {
    const { lastFrame } = await renderAtStep3();
    expect(lastFrame()).toContain('How much do you weigh?');
  });

  it('advances to step 4 on valid weight input (165)', async () => {
    const { lastFrame, stdin } = await renderAtStep3();
    await submitText(stdin, '165');
    expect(lastFrame()).toContain('Profile Setup (4/4)');
    expect(lastFrame()).toContain('What is your riding style?');
  });

  it('stays on step 3 with error on out-of-range input', async () => {
    const { lastFrame, stdin } = await renderAtStep3();
    // 10 lbs = ~4.5 kg — below 30 kg minimum
    await submitText(stdin, '10');
    expect(lastFrame()).toContain('Profile Setup (3/4)');
    expect(lastFrame()).toContain('Enter weight in lbs between 66 and 440');
  });
});

describe('WizardScreen — step 4 (riding style)', () => {
  // Helper: advance to step 4
  async function renderAtStep4(onComplete = vi.fn()) {
    const result = render(React.createElement(WizardScreen, { onComplete }));
    await submitText(result.stdin, '10.5');
    await submitText(result.stdin, '178');
    await submitText(result.stdin, '165');
    return result;
  }

  it('renders "Profile Setup (4/4)" after step 3 advance', async () => {
    const { lastFrame } = await renderAtStep4();
    expect(lastFrame()).toContain('Profile Setup (4/4)');
  });

  it('renders riding style Select with all 5 options', async () => {
    const { lastFrame } = await renderAtStep4();
    expect(lastFrame()).toContain('All-Mountain');
    expect(lastFrame()).toContain('Freestyle');
    expect(lastFrame()).toContain('Freeride');
    expect(lastFrame()).toContain('Backcountry');
    expect(lastFrame()).toContain('Beginner');
  });

  it('calls onComplete with correct RiderProfile on selection', async () => {
    const onComplete = vi.fn();
    const { stdin } = await renderAtStep4(onComplete);
    // Press Enter to select the first (currently focused) option: All-Mountain.
    // Select's onChange fires via useEffect — use act to flush all pending state updates
    // including the asynchronous useEffect triggered by selectFocusedOption.
    await act(async () => {
      stdin.write('\r');
      // Wait for React's useEffect scheduler to fire Select's onChange callback
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const profile = onComplete.mock.calls[0]?.[0];
    expect(profile).toBeDefined();
    expect(profile.bootSize).toBe(10.5);
    // 178cm was entered as bare cm — parseHeight('178') = 178
    expect(profile.heightCm).toBe(178);
    // 165 lbs → Math.round(165 * 0.453592) = 75 kg
    expect(profile.weightKg).toBe(75);
    expect(profile.ridingStyle).toBe('all-mountain');
  });
});
