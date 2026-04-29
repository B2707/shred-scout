import { describe, it, vi, afterEach } from 'vitest';

// Stubs — implementations added in Plan 02 after WizardScreen components are created.
// These placeholders keep the test file valid so vitest can scan it without errors.

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('WizardScreen — step 1 (boot size)', () => {
  it.todo('renders "Profile Setup (1/4)" on first render');
  it.todo('renders "What is your boot size?" prompt');
  it.todo('advances to step 2 on valid boot size submit');
  it.todo('stays on step 1 with error on invalid input (e.g. "3.9")');
  it.todo('error message reads: Boot size must be a number between 4.0 and 18.0');
});

describe('WizardScreen — step 2 (height)', () => {
  it.todo('renders "Profile Setup (2/4)" after step 1 advance');
  it.todo('renders "How tall are you?" prompt');
  it.todo('advances to step 3 on valid feet/inches input (5\'10\")');
  it.todo('advances to step 3 on valid bare cm input (178)');
  it.todo('stays on step 2 with error on unparseable input');
});

describe('WizardScreen — step 3 (weight)', () => {
  it.todo('renders "Profile Setup (3/4)" after step 2 advance');
  it.todo('renders "How much do you weigh?" prompt');
  it.todo('advances to step 4 on valid weight input (165)');
  it.todo('stays on step 3 with error on out-of-range input');
});

describe('WizardScreen — step 4 (riding style)', () => {
  it.todo('renders "Profile Setup (4/4)" after step 3 advance');
  it.todo('renders riding style Select with all 5 options');
  it.todo('calls onComplete with correct RiderProfile on selection');
});
