import { render } from 'ink-testing-library';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Images are best-effort; mock the renderers so the step machine can be tested hermetically.
vi.mock('terminal-image', () => ({
  default: { buffer: vi.fn().mockResolvedValue('[img]') },
}));
vi.mock('execa', () => ({
  execa: vi.fn().mockRejectedValue(new Error('no chafa')),
}));

const DOWN = '[B';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => vi.clearAllMocks());

describe('GearWizard', () => {
  it('walks category → style → flex → budget → confirm and reports the answers', async () => {
    const { GearWizard } = await import(
      '../src/components/wizard/GearWizard.js'
    );
    const onComplete = vi.fn();
    const { stdin } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete,
        onQuit: vi.fn(),
      }),
    );
    const press = async (k: string) => {
      stdin.write(k);
      await sleep(40);
    };
    await sleep(40);
    await press(DOWN);
    await press(DOWN);
    await press('\r'); // category -> Boots
    await press('\r'); // style -> All-Mountain
    await press('\r'); // flex -> Soft
    await press('\r'); // budget -> Under $300
    await press('\r'); // confirm -> search

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0]).toMatchObject({
      category: 'boot',
      style: 'all-mountain',
      flex: 'soft',
      budget: 'u300',
    });
  });

  it('includes the board-profile step when a board is chosen', async () => {
    const { GearWizard } = await import(
      '../src/components/wizard/GearWizard.js'
    );
    const { stdin, lastFrame } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit: vi.fn(),
      }),
    );
    await sleep(30);
    stdin.write('\r'); // category -> Snowboard (index 0) -> profile step
    await sleep(30);
    expect(lastFrame()).toContain('board profile');
  });

  it('q quits the wizard', async () => {
    const { GearWizard } = await import(
      '../src/components/wizard/GearWizard.js'
    );
    const onQuit = vi.fn();
    const { stdin } = render(
      React.createElement(GearWizard, {
        supportsImages: false,
        onComplete: vi.fn(),
        onQuit,
      }),
    );
    await sleep(30);
    stdin.write('q');
    await sleep(20);
    expect(onQuit).toHaveBeenCalled();
  });
});
