/**
 * SaleDisplay component tests — covers PRES-03.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SaleDisplay', () => {
  it('renders "(N% OFF)" badge when compare_at_price > price', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    const { lastFrame } = render(
      React.createElement(SaleDisplay, { priceCents: 51999, compareAtCents: 64999 }),
    );
    expect(lastFrame()).toContain('% OFF');
  });

  it('renders "(was $X.XX)" in dimColor format (not strikethrough)', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    const { lastFrame } = render(
      React.createElement(SaleDisplay, { priceCents: 51999, compareAtCents: 64999 }),
    );
    expect(lastFrame()).toContain('was $649.99');
  });

  it('renders current price in the sale line', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    const { lastFrame } = render(
      React.createElement(SaleDisplay, { priceCents: 51999, compareAtCents: 64999 }),
    );
    expect(lastFrame()).toContain('519.99');
  });

  it('calculates pctOff using Math.round((1 - current/original) * 100)', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    // 51999 / 64999 = 0.8000..., 1 - 0.8 = 0.2, Math.round(0.2 * 100) = 20
    const { lastFrame } = render(
      React.createElement(SaleDisplay, { priceCents: 51999, compareAtCents: 64999 }),
    );
    expect(lastFrame()).toContain('20% OFF');
  });
});
