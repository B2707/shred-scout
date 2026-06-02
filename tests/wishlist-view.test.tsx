import { render } from 'ink-testing-library';
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SavedSetup } from '../src/data/repos/setupRepo.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeSavedSetup(overrides: Partial<SavedSetup> = {}): SavedSetup {
  return {
    id: 1,
    boardId: 10,
    bindingId: 20,
    bootId: 30,
    compatibility: null,
    savedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
    alertEnabled: false,
    ...overrides,
  };
}

describe('WishlistView', () => {
  it('renders empty state when no setups', async () => {
    const { WishlistView } = await import('../src/components/WishlistView.js');
    const { lastFrame } = render(
      React.createElement(WishlistView, {
        setups: [],
        resolveTitle: () => 'Unknown product',
        onDelete: vi.fn(),
        onToggleAlert: vi.fn(),
        onOpenHistory: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    expect(lastFrame()).toContain('Your wishlist is empty');
  });

  it('renders setup titles using resolveTitle', async () => {
    const { WishlistView } = await import('../src/components/WishlistView.js');
    const setup = makeSavedSetup({ alertEnabled: false });
    const resolveTitle = (id: number | null) => {
      if (id === 10) return 'Burton Custom';
      if (id === 20) return 'Union Force';
      if (id === 30) return 'Burton Ruler';
      return 'Unknown product';
    };
    const { lastFrame } = render(
      React.createElement(WishlistView, {
        setups: [setup],
        resolveTitle,
        onDelete: vi.fn(),
        onToggleAlert: vi.fn(),
        onOpenHistory: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    expect(lastFrame()).toContain('Burton Custom');
  });

  it('shows WATCHING badge when alertEnabled is true', async () => {
    const { WishlistView } = await import('../src/components/WishlistView.js');
    const setup = makeSavedSetup({ alertEnabled: true });
    const { lastFrame } = render(
      React.createElement(WishlistView, {
        setups: [setup],
        resolveTitle: () => 'Board Title',
        onDelete: vi.fn(),
        onToggleAlert: vi.fn(),
        onOpenHistory: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    expect(lastFrame()).toContain('[WATCHING]');
  });

  it('shows Wishlist count header', async () => {
    const { WishlistView } = await import('../src/components/WishlistView.js');
    const setup = makeSavedSetup();
    const { lastFrame } = render(
      React.createElement(WishlistView, {
        setups: [setup],
        resolveTitle: () => 'Board',
        onDelete: vi.fn(),
        onToggleAlert: vi.fn(),
        onOpenHistory: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    expect(lastFrame()).toContain('Wishlist');
    expect(lastFrame()).toContain('1 saved');
  });

  it('renders keybind hint bar', async () => {
    const { WishlistView } = await import('../src/components/WishlistView.js');
    const { lastFrame } = render(
      React.createElement(WishlistView, {
        setups: [makeSavedSetup()],
        resolveTitle: () => 'Board',
        onDelete: vi.fn(),
        onToggleAlert: vi.fn(),
        onOpenHistory: vi.fn(),
        onBack: vi.fn(),
      }),
    );
    expect(lastFrame()).toContain('d delete');
    expect(lastFrame()).toContain('h history');
    expect(lastFrame()).toContain('a toggle alert');
  });

  it('reports modal active while the delete-confirm prompt is open', async () => {
    const { WishlistView } = await import('../src/components/WishlistView.js');
    const onModalChange = vi.fn();
    const { stdin, lastFrame } = render(
      React.createElement(WishlistView, {
        setups: [makeSavedSetup()],
        resolveTitle: () => 'Board',
        onDelete: vi.fn(),
        onToggleAlert: vi.fn(),
        onOpenHistory: vi.fn(),
        onModalChange,
      }),
    );
    await act(async () => {
      stdin.write('d');
    });
    expect(lastFrame()).toContain('[y/n]');
    expect(onModalChange).toHaveBeenLastCalledWith(true);
  });

  it('reports modal inactive again when delete-confirm is cancelled', async () => {
    const { WishlistView } = await import('../src/components/WishlistView.js');
    const onModalChange = vi.fn();
    const { stdin } = render(
      React.createElement(WishlistView, {
        setups: [makeSavedSetup()],
        resolveTitle: () => 'Board',
        onDelete: vi.fn(),
        onToggleAlert: vi.fn(),
        onOpenHistory: vi.fn(),
        onModalChange,
      }),
    );
    await act(async () => {
      stdin.write('d');
    });
    await act(async () => {
      stdin.write('n');
    });
    expect(onModalChange).toHaveBeenLastCalledWith(false);
  });
});
