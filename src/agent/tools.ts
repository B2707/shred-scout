/**
 * tools.ts — Anthropic.Tool definitions for the Phase 4 agent loop.
 *
 * Two tools:
 *  - search_products: invoked on first user turn to fetch + normalize products from RETAILERS.
 *  - refine_results: invoked on subsequent NL refinement turns; takes a FilterSpec.
 *
 * Per RESEARCH.md Pattern 2: cache_control is placed ONLY on the LAST tool in the
 * tools array. The SDK then caches BOTH tools as a prefix. Placing cache_control
 * on any other tool is an anti-pattern that breaks caching.
 */
import type Anthropic from '@anthropic-ai/sdk';

export const SEARCH_PRODUCTS_TOOL: Anthropic.Tool = {
  name: 'search_products',
  description:
    'Search for snowboard products across all configured Shopify retailers. ' +
    'Call this on the first user turn to populate the working result set. ' +
    'Returns an array of {id, title, price, summary} — use these to ground subsequent recommendations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search intent in natural language, e.g. "stiff freeride boards" or "all-mountain bindings under $400".',
      },
      filters: {
        type: 'object',
        description: 'Optional initial FilterSpec to narrow the search before returning results.',
        properties: {
          priceMax: { type: 'number', description: 'Maximum price in USD' },
          flex: { type: 'string', enum: ['soft', 'medium', 'stiff'], description: 'Best-effort title keyword match for flex' },
          color: { type: 'string', description: 'Case-insensitive title substring match' },
          gearType: { type: 'string', enum: ['board', 'binding', 'boot'] },
          retailer: { type: 'string', description: 'Retailer slug, e.g. "evo"' },
        },
      },
    },
    required: ['query'],
  },
  // No cache_control here — only the LAST tool in CACHED_TOOLS gets it.
};

export const REFINE_RESULTS_TOOL: Anthropic.Tool = {
  name: 'refine_results',
  description:
    'Narrow the current working result set by applying a structured FilterSpec. ' +
    'Note: flex filtering is best-effort title keyword match in v1 — exact spec data arrives in a future release.',
  input_schema: {
    type: 'object' as const,
    properties: {
      priceMax: { type: 'number', description: 'Maximum price in USD' },
      flex: { type: 'string', enum: ['soft', 'medium', 'stiff'], description: 'Best-effort title keyword match' },
      color: { type: 'string', description: 'Case-insensitive title substring' },
      gearType: { type: 'string', enum: ['board', 'binding', 'boot'] },
      retailer: { type: 'string', description: 'Retailer slug, e.g. "evo"' },
    },
  },
  cache_control: { type: 'ephemeral' },
};

/** Tools array passed to client.messages.stream(); cache_control on the LAST tool caches both as a prefix. */
export const CACHED_TOOLS: Anthropic.Tool[] = [SEARCH_PRODUCTS_TOOL, REFINE_RESULTS_TOOL];
