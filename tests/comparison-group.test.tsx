/**
 * ComparisonGroup component tests — covers PRES-02.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

afterEach(() => {
  vi.restoreAllMocks();
});

const makeProduct = (retailer: string, priceCents: number, id: string) => ({
  shopify_id: id,
  retailer,
  title: 'Never Summer Proto Synthesis',
  handle: 'proto-synthesis',
  vendor: 'Never Summer',
  product_type: 'Snowboard',
  gear_category: 'board' as const,
  waist_width_mm: null,
  mount_pattern: '4x4' as const,
  mount_pattern_raw: '4x4',
  image_url: null,
  price_cents: priceCents,
  variants_json: JSON.stringify([{ price: (priceCents / 100).toFixed(2), compare_at_price: null, option1: 'L' }]),
  fetched_at: Date.now(),
});

describe('ComparisonGroup', () => {
  it('renders the normalized title as a bold group header', async () => {
    const { ComparisonGroup } = await import('../src/components/ComparisonGroup.js');
    const products = [makeProduct('evo', 64999, '1'), makeProduct('tactics', 62999, '2')];
    const { lastFrame } = render(
      React.createElement(ComparisonGroup, { normalizedTitle: 'never summer proto synthesis', products }),
    );
    expect(lastFrame()).toContain('never summer proto synthesis');
  });

  it('renders each retailer name and price as a sub-row', async () => {
    const { ComparisonGroup } = await import('../src/components/ComparisonGroup.js');
    const products = [makeProduct('evo', 64999, '1'), makeProduct('tactics', 62999, '2')];
    const { lastFrame } = render(
      React.createElement(ComparisonGroup, { normalizedTitle: 'never summer proto synthesis', products }),
    );
    expect(lastFrame()).toContain('evo');
    expect(lastFrame()).toContain('tactics');
    expect(lastFrame()).toContain('629.99');
    expect(lastFrame()).toContain('649.99');
  });

  it('shows [Best Price] label on the cheapest retailer row', async () => {
    const { ComparisonGroup } = await import('../src/components/ComparisonGroup.js');
    const products = [makeProduct('evo', 64999, '1'), makeProduct('tactics', 62999, '2')];
    const { lastFrame } = render(
      React.createElement(ComparisonGroup, { normalizedTitle: 'never summer proto synthesis', products }),
    );
    expect(lastFrame()).toContain('[Best Price]');
  });

  it('does NOT show [Best Price] on the more expensive retailer row', async () => {
    const { ComparisonGroup } = await import('../src/components/ComparisonGroup.js');
    const products = [makeProduct('evo', 64999, '1'), makeProduct('tactics', 62999, '2')];
    const { lastFrame } = render(
      React.createElement(ComparisonGroup, { normalizedTitle: 'never summer proto synthesis', products }),
    );
    // tactics is cheapest; evo should NOT have [Best Price]
    const frame = lastFrame() ?? '';
    const evoLine = frame.split('\n').find((l) => l.includes('evo'));
    expect(evoLine).toBeDefined();
    expect(evoLine).not.toContain('[Best Price]');
  });
});
