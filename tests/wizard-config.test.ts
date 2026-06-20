import { describe, expect, it } from 'vitest';
import {
  answersToProfile,
  visibleSteps,
  wizardToSearch,
} from '../src/components/wizard/wizard-config.js';

describe('visibleSteps', () => {
  it('starts at boot and ends at confirm (one linear flow)', () => {
    const steps = visibleSteps({ category: 'boot' });
    expect(steps[0]).toBe('boot');
    expect(steps[steps.length - 1]).toBe('confirm');
  });

  it('always collects rider facts + skill + style before gear prefs', () => {
    const steps = visibleSteps({});
    expect(steps).toEqual(
      expect.arrayContaining([
        'boot',
        'height',
        'weight',
        'skill',
        'style',
        'category',
      ]),
    );
  });

  it('slims the flow: no flex or budget steps', () => {
    expect(visibleSteps({ category: 'board' })).not.toContain('flex');
    expect(visibleSteps({ category: 'board' })).not.toContain('budget');
    expect(visibleSteps({ category: 'boot' })).not.toContain('flex');
    expect(visibleSteps({ category: 'boot' })).not.toContain('budget');
  });

  it('includes the board-profile step for board and full setup', () => {
    expect(visibleSteps({ category: 'board' })).toContain('profile');
    expect(visibleSteps({ category: 'setup' })).toContain('profile');
  });

  it('omits the board-profile step for bindings and boots', () => {
    expect(visibleSteps({ category: 'binding' })).not.toContain('profile');
    expect(visibleSteps({ category: 'boot' })).not.toContain('profile');
  });
});

describe('answersToProfile', () => {
  it('maps a complete answer set to a RiderProfile', () => {
    const profile = answersToProfile({
      bootSize: 10.5,
      heightCm: 178,
      weightKg: 75,
      skill: 'advanced',
      style: 'freeride',
      category: 'board',
      flex: 'stiff',
      budget: 'u700',
    });
    expect(profile).toMatchObject({
      bootSize: 10.5,
      heightCm: 178,
      weightKg: 75,
      skillLevel: 'advanced',
      ridingStyle: 'freeride',
    });
  });

  it('falls back to sane defaults for unanswered fields (no NaN/undefined)', () => {
    const profile = answersToProfile({});
    expect(Number.isNaN(profile.bootSize)).toBe(false);
    expect(typeof profile.bootSize).toBe('number');
    expect(profile.ridingStyle).toBeTruthy();
    expect(profile.skillLevel).toBeTruthy();
  });
});

describe('wizardToSearch', () => {
  it('maps a board answer to a boards query and the category chip', () => {
    const { query, filters } = wizardToSearch({ category: 'board' });
    expect(query).toBe('boards');
    expect(filters).toEqual(expect.arrayContaining(['board']));
  });

  it('uses an empty query and no category chip for a full setup', () => {
    const { query, filters } = wizardToSearch({ category: 'setup' });
    expect(query).toBe('');
    expect(filters).not.toContain('board');
    expect(filters).not.toContain('setup');
  });

  it('maps boots and bindings to their own queries', () => {
    expect(wizardToSearch({ category: 'boot' }).query).toBe('boots');
    expect(wizardToSearch({ category: 'binding' }).query).toBe('bindings');
  });
});
