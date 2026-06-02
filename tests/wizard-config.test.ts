import { describe, expect, it } from 'vitest';
import {
  visibleSteps,
  wizardToSearch,
} from '../src/components/wizard/wizard-config.js';

describe('visibleSteps', () => {
  it('includes the board-profile step for board and full setup', () => {
    expect(visibleSteps({ category: 'board' })).toContain('profile');
    expect(visibleSteps({ category: 'setup' })).toContain('profile');
  });

  it('omits the board-profile step for bindings and boots', () => {
    expect(visibleSteps({ category: 'binding' })).not.toContain('profile');
    expect(visibleSteps({ category: 'boot' })).not.toContain('profile');
  });

  it('starts at category and ends at confirm', () => {
    const steps = visibleSteps({ category: 'boot' });
    expect(steps[0]).toBe('category');
    expect(steps[steps.length - 1]).toBe('confirm');
  });
});

describe('wizardToSearch', () => {
  it('maps a board answer to a boards query and pre-applied chips', () => {
    const { query, filters } = wizardToSearch({
      category: 'board',
      flex: 'stiff',
      budget: 'u500',
    });
    expect(query).toBe('boards');
    expect(filters).toEqual(expect.arrayContaining(['board', 'stiff', 'u500']));
  });

  it('uses an empty query and no category chip for a full setup', () => {
    const { query, filters } = wizardToSearch({
      category: 'setup',
      flex: 'medium',
      budget: 'any',
    });
    expect(query).toBe('');
    expect(filters).not.toContain('board');
    expect(filters).toContain('medium');
  });

  it('adds no price chip for the "No limit" budget', () => {
    const { filters } = wizardToSearch({ category: 'boot', budget: 'any' });
    expect(filters.some((f) => f.startsWith('u'))).toBe(false);
  });

  it('maps boots and bindings to their own queries', () => {
    expect(wizardToSearch({ category: 'boot' }).query).toBe('boots');
    expect(wizardToSearch({ category: 'binding' }).query).toBe('bindings');
  });
});
