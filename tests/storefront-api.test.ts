import { describe, expect, it } from 'vitest';
import { normalizeProduct } from '../src/data/normalizer.js';
import { adaptStorefrontProduct } from '../src/data/storefront-api.js';

function variant(amount: string, available: boolean, size: string) {
  return {
    node: {
      id: `gid://shopify/ProductVariant/${size}`,
      title: size,
      price: { amount, currencyCode: 'USD' },
      compareAtPrice: null,
      availableForSale: available,
      sku: `sku-${size}`,
      selectedOptions: [{ name: 'Size', value: size }],
    },
  };
}

const soldOutCheapestNode = {
  id: 'gid://shopify/Product/1',
  title: 'Demo Boots',
  handle: 'demo-boots',
  productType: 'Snowboard Boots',
  vendor: 'Demo',
  tags: ['boots'],
  description: '',
  featuredImage: null,
  variants: {
    edges: [variant('199.00', false, '8'), variant('499.00', true, '10')],
  },
};

describe('adaptStorefrontProduct (DD-1)', () => {
  it('carries variant availability through so the in-stock price wins after normalization', () => {
    const input = adaptStorefrontProduct(soldOutCheapestNode);
    expect(input.variants.map((v) => v.available)).toEqual([false, true]);

    const normalized = normalizeProduct(input, 'storefront-store');
    // The $199 variant is sold out — the $499 in-stock variant must be the displayed price.
    expect(normalized.price_cents).toBe(49900);
  });
});
