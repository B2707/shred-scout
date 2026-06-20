/**
 * SaleDisplay component tests - covers PRES-03.
 */

import { render } from 'ink-testing-library';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SaleDisplay', () => {
  it('renders "(N% OFF)" badge when compare_at_price > price', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    const { lastFrame } = render(
      React.createElement(SaleDisplay, {
        priceCents: 51999,
        compareAtCents: 64999,
      }),
    );
    expect(lastFrame()).toContain('% OFF');
  });

  it('renders "(was $X.XX)" in dimColor format (not strikethrough)', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    const { lastFrame } = render(
      React.createElement(SaleDisplay, {
        priceCents: 51999,
        compareAtCents: 64999,
      }),
    );
    expect(lastFrame()).toContain('was $649.99');
  });

  it('renders current price in the sale line', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    const { lastFrame } = render(
      React.createElement(SaleDisplay, {
        priceCents: 51999,
        compareAtCents: 64999,
      }),
    );
    expect(lastFrame()).toContain('519.99');
  });

  it('calculates pctOff using Math.round((1 - current/original) * 100)', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    // 51999 / 64999 = 0.8000..., 1 - 0.8 = 0.2, Math.round(0.2 * 100) = 20
    const { lastFrame } = render(
      React.createElement(SaleDisplay, {
        priceCents: 51999,
        compareAtCents: 64999,
      }),
    );
    expect(lastFrame()).toContain('20% OFF');
  });

  it('renders the "(18% OFF)" badge with format intact when prices match demo-004 fixture', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    // priceCents=44900 ($449.00), compareAtCents=54900 ($549.00) → 18% OFF
    // Math.round((1 - 44900/54900) * 100) = Math.round(0.1821) = 18
    const { lastFrame } = render(
      React.createElement(SaleDisplay, {
        priceCents: 44900,
        compareAtCents: 54900,
      }),
    );
    expect(lastFrame()).toContain('was $549.00');
    expect(lastFrame()).toContain('$449.00');
    expect(lastFrame()).toContain('18% OFF');
  });

  it('returns empty fragment when compareAtCents is 0', async () => {
    const { SaleDisplay } = await import('../src/components/SaleDisplay.js');
    const { lastFrame } = render(
      React.createElement(SaleDisplay, {
        priceCents: 44900,
        compareAtCents: 0,
      }),
    );
    // When compareAtCents=0 the component returns <></> - output should be empty or blank
    expect(lastFrame() ?? '').not.toContain('% OFF');
  });
});
