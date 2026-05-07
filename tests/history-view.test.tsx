import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import type { PriceObservation } from '../src/data/repos/priceRepo.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeObs(priceCents: number, id: number): PriceObservation {
  return { id, productId: 1, priceCents, observedAt: Date.now() - id * 60_000 };
}

describe('HistoryView', () => {
  it('renders empty state when no observations', async () => {
    const { HistoryView } = await import('../src/components/HistoryView.js');
    const { lastFrame } = render(
      React.createElement(HistoryView, {
        observations: [],
        productTitle: 'Burton Custom',
        onBack: vi.fn(),
      })
    );
    expect(lastFrame()).toContain('No price history yet');
  });

  it('renders product title in header', async () => {
    const { HistoryView } = await import('../src/components/HistoryView.js');
    const { lastFrame } = render(
      React.createElement(HistoryView, {
        observations: [makeObs(54999, 1), makeObs(59999, 2)],
        productTitle: 'Burton Custom Flying V',
        onBack: vi.fn(),
      })
    );
    expect(lastFrame()).toContain('Price History');
    expect(lastFrame()).toContain('Burton Custom Flying V');
  });

  it('renders price formatted as $X.XX', async () => {
    const { HistoryView } = await import('../src/components/HistoryView.js');
    const { lastFrame } = render(
      React.createElement(HistoryView, {
        observations: [makeObs(54999, 1), makeObs(59999, 2)],
        productTitle: 'Board',
        onBack: vi.fn(),
      })
    );
    expect(lastFrame()).toContain('$549.99');
  });

  it('renders table header with When/Price/Chg columns', async () => {
    const { HistoryView } = await import('../src/components/HistoryView.js');
    const { lastFrame } = render(
      React.createElement(HistoryView, {
        observations: [makeObs(50000, 1)],
        productTitle: 'Board',
        onBack: vi.fn(),
      })
    );
    expect(lastFrame()).toContain('When');
    expect(lastFrame()).toContain('Price');
    expect(lastFrame()).toContain('Chg');
  });

  it('renders q back hint', async () => {
    const { HistoryView } = await import('../src/components/HistoryView.js');
    const { lastFrame } = render(
      React.createElement(HistoryView, {
        observations: [makeObs(50000, 1)],
        productTitle: 'Board',
        onBack: vi.fn(),
      })
    );
    expect(lastFrame()).toContain('q back');
  });
});
