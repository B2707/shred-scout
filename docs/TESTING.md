# Testing

## Framework and Setup

Shred Scout uses **Vitest 4** as its test runner with **ink-testing-library 4** for Ink component rendering. Tests are written in TypeScript and run as ESM modules.

**Configuration:** `vitest.config.ts` at the project root.

Key settings:
- `pool: 'forks'` - each test file runs in an isolated worker process, preventing module state from leaking between files
- `globals: false` - `describe`, `it`, `expect`, and `vi` must be imported explicitly from `vitest`
- `testTimeout: 15000` - 15-second default per test (network-adjacent tests need headroom)
- `setupFiles: ['./tests/setup.ts']` - runs before every worker; sets `IS_REACT_ACT_ENVIRONMENT = true` to suppress React 19 act() warnings in Ink component tests
- `typecheck.tsconfig: './tsconfig.test.json'` - extends the root tsconfig so both `src/` and `tests/` are in scope

## Suite Status

The suite currently has **461 passing and 2 skipped tests** across 37 test files. The 2 skipped tests both live in `tests/e2e-pagination.test.ts`, which is guarded by `E2E=1` (live network, opt-in only).

To reproduce the count locally:

```bash
npm test
```

## Running Tests

**Standard run** (builds first, then runs the full suite):
```bash
npm test
```

The `test` script in `package.json` runs `npm run build && vitest run`. The build step is required because `tests/cli.test.ts` imports from `dist/cli.js` directly and tests the compiled CLI binary.

**Watch mode** (no build step - for development):
```bash
npm run test:watch
```

Runs `vitest` in interactive watch mode. Suitable for all tests except `cli.test.ts`, which requires a prior build.

**Single file:**
```bash
npx vitest run tests/normalizer.test.ts
```

**End-to-end pagination test** (requires live network, opt-in only):
```bash
E2E=1 npx vitest run tests/e2e-pagination.test.ts
```

This test is guarded by `process.env.E2E === '1'` (`describe.skipIf`) and is skipped in all other runs. It makes real HTTP requests to `evo.com`.

## Test File Naming Convention

All test files live in `tests/` at the project root. The naming convention is:

- TypeScript logic tests: `*.test.ts`
- Ink component tests (JSX): `*.test.tsx`

Files match the source module or component they exercise, not a directory structure. For example, `tests/normalizer.test.ts` tests `src/data/normalizer.ts`.

## Test Coverage Map

Rather than hand-maintain a per-test description that drifts, the table below groups the suite by area. To list the live files at any time:

```bash
ls tests/*.test.ts tests/*.test.tsx
```

| Area | Test files | Exercises |
| --- | --- | --- |
| Compatibility engine | `compatibility.test.ts`, `flex-advisory.test.ts`, `product-adapter.test.ts`, `board-sizing.test.ts`, `setup-badges.test.ts` | The deterministic compatibility rules and engine (boot-to-binding size, boot-to-board waist, disc-to-mount), the advisory flex check, the `NormalizedProduct` to domain adapters, board-length recommendation and size-variant parsing, and the per-row setup badges (`badgeFor`/`sortedCandidates`/`trayVerdict`/`annotateCandidates`). |
| Ranking | `rank.test.ts` | `rankProducts`/`scoreProduct` - board length/flex/waist weighting (0.6/0.2/0.2), boot in-size scoring, neutral fallbacks for missing data, and stable, lossless ordering. |
| Data layer | `db.test.ts`, `repos.test.ts`, `normalizer.test.ts`, `scraper.test.ts`, `pipeline.test.ts`, `smart-source.test.ts`, `storefront-api.test.ts`, `stores.test.ts` | SQLite schema/migrations and the price/rider/setup repos; raw-listing normalization; the Shopify REST scraper and the GraphQL Storefront path; the request pipeline (retry/concurrency/UA); the `SmartShopifySource` token-probe decision and per-item normalization resilience; multi-store config. |
| Search and filtering | `search-pipeline.test.ts`, `filter-spec.test.ts`, `diff.test.ts` | The `runSearch()` orchestrator (mocked deps), in-results filtering, and price-diff computation. |
| Ink components | `app.test.ts`, `gear-wizard.test.tsx`, `search-view.test.tsx`, `result-card.test.tsx`, `comparison-group.test.tsx`, `sale-display.test.tsx`, `setup-builder-view.test.tsx`, `setup-summary-view.test.tsx`, `product-detail.test.tsx`, `history-view.test.tsx`, `wishlist-view.test.tsx` | The top-level `App`, the merged onboarding wizard, search/results rendering and comparison grouping, sale badges, the full-setup builder with live per-row badges and save flow, the render-once `ProductDetail` photo view, and the history/wishlist screens. |
| Wizard config and layout | `wizard-config.test.ts`, `wizard-layout.test.ts` | `visibleSteps`/`answersToProfile`/`wizardToSearch` step routing and answer mapping, plus pure layout helpers (`optionWindow`, `truncateAtWord`, `isReturningRider`). |
| Images and terminal | `terminal-image.test.ts`, `html-scraper.test.ts` | The `TerminalImage` source/byte budgets per image kind (`art`/`photo`/`photo-detail`), Shopify CDN thumbnail-URL rewriting, and the cheerio HTML scraper. |
| Conversions and platform | `conversions.test.ts`, `profile.test.ts`, `tty.test.ts` | lbs/kg and height parsing (with round-trip guards against the pre-fill corruption bug), profile read/write/validation, and the `isTTY()` detector. |
| CLI and E2E | `cli.test.ts`, `e2e-pagination.test.ts` | The compiled `dist/cli.js` binary (`--version`/`--help`/non-TTY exit) and the live pagination loop (opt-in via `E2E=1`). |

`tests/setup.ts` is not a test file - it runs in every worker before tests and sets `globalThis.IS_REACT_ACT_ENVIRONMENT = true` so React 19 does not warn when `act()` is called from ink-testing-library.

## Notes on Tricky Tests

- **`gear-wizard.test.tsx`** drives the full step machine through stdin and polls `lastFrame()` for each step title. Every step mounts an `ImageOption` whose `TerminalImage` kicks off an async chafa render (mocked to reject), which later calls `setState`. Those updates are wrapped in `act()` - the `sleep` helper advances time inside an `act()` scope - so they settle deterministically. Without that wrapping, the late state updates trip React 19's "not wrapped in act()" warning and, under a full parallel run, race with the frame poll and surface as an intermittent "waitUntil timed out" flake. The poll timeout is set generously (8s) for the same reason: the step machine plus async image renders run slower when every CPU is busy.
- **`result-card.test.tsx`** and other async-image components flush the fetch effect with `await act(async () => { await new Promise(r => setTimeout(r, 50)); })` before asserting on `lastFrame()`.
- **`product-detail.test.tsx`** mocks `TerminalImage` to capture props (rather than render) and asserts the detail view requests the full-res `kind: 'photo-detail'` context, not the paged-list thumbnail budget.

## Testing Ink Components

Ink components are tested with **ink-testing-library**. The pattern is:

```typescript
import React, { act } from 'react';
import { render } from 'ink-testing-library';
import { MyComponent } from '../src/components/MyComponent.js';

const { lastFrame, stdin } = render(React.createElement(MyComponent, { prop: 'value' }));

// Assert on rendered terminal output
expect(lastFrame()).toContain('expected text');

// Simulate keyboard input
await act(async () => { stdin.write('some text'); });
await act(async () => { stdin.write('\r'); }); // Enter key
```

`lastFrame()` returns the current terminal output as a plain string. Use `toContain()` for text assertions - exact frame matching is fragile.

For components with async state updates (e.g., image fetching in `ResultCard`, or the per-step image renders in `GearWizard`), flush the effect inside an `act()` scope:

```typescript
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
```

The `IS_REACT_ACT_ENVIRONMENT` global set in `tests/setup.ts` is required for `act()` to work without warnings in React 19.

## SQLite in Tests

All database tests use **in-memory databases** - no files are written to disk. The pattern is:

```typescript
import { openDatabase } from '../src/data/db.js';

const db = openDatabase(':memory:');
// use db directly - tables are created by openDatabase()
```

`openDatabase(':memory:')` runs the full migration (creates all tables, records the initial migration in `schema_versions`, enables WAL pragma and foreign keys). Each test that needs database state creates its own `':memory:'` instance - there is no shared database between tests.

When testing code that depends on a database (e.g., `repos.test.ts`), import `openDatabase` directly and pass the in-memory instance to the repo factory. When testing higher-level code that calls `openDatabase` internally (e.g., `search-pipeline.test.ts`), mock `src/data/db.js` with `vi.mock()`.

## Mocking the Scraper

The scraper is tested two ways depending on the level:

**Unit/integration tests** (`scraper.test.ts`, `pipeline.test.ts`, `storefront-api.test.ts`): use **undici `MockAgent`** to intercept HTTP at the transport layer without any module mocking. `MockAgent.disableNetConnect()` ensures no accidental live requests.

```typescript
import { MockAgent, setGlobalDispatcher } from 'undici';

const mockAgent = new MockAgent();
mockAgent.disableNetConnect();
setGlobalDispatcher(mockAgent);

const pool = mockAgent.get('https://www.evo.com');
pool
  .intercept({ path: '/products.json?limit=250&page=1', method: 'GET' })
  .reply(200, JSON.stringify({ products: [/* ... */] }), {
    headers: { 'content-type': 'application/json' },
  });

// page 2 must return an empty array to stop the pagination loop
pool
  .intercept({ path: '/products.json?limit=250&page=2', method: 'GET' })
  .reply(200, JSON.stringify({ products: [] }), {
    headers: { 'content-type': 'application/json' },
  });

await mockAgent.close(); // afterEach
```

**Component/orchestrator tests** (`search-pipeline.test.ts`, `search-view.test.tsx`, `app` tests, `smart-source.test.ts`): use `vi.mock()` to replace the data modules entirely:

```typescript
vi.mock('../src/data/shopify.js', () => ({
  fetchAllProducts: vi.fn().mockResolvedValue([/* product fixtures */]),
}));
```

## Writing a New Test

1. Create `tests/{module-name}.test.ts` (or `.tsx` for Ink components).
2. Import only from `vitest` - do not use Jest globals. `globals: false` is set in `vitest.config.ts`, so `describe`, `it`, `expect`, `vi` must all be imported explicitly.
3. Use `vi.resetModules()` in `afterEach` when the test uses `await import()` to load the module under test - this forces a fresh module instance for each test and prevents state leakage.
4. For database tests, call `openDatabase(':memory:')` per test - never share a database instance between tests.
5. For HTTP tests, set up `MockAgent` in `beforeEach` and call `mockAgent.close()` in `afterEach`.
6. For Ink component tests with async effects (image loading, search completion, the per-step wizard images), flush pending state updates inside an `act()` scope before asserting on `lastFrame()`.

Example skeleton for a pure logic module:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('myFunction()', () => {
  it('does the expected thing', async () => {
    const { myFunction } = await import('../src/path/to/module.js');
    expect(myFunction('input')).toBe('expected output');
  });
});
```

Example skeleton for an Ink component:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyComponent', () => {
  it('renders expected text', async () => {
    const { MyComponent } = await import('../src/components/MyComponent.js');
    const { lastFrame } = render(
      React.createElement(MyComponent, { someProp: 'value' }),
    );
    expect(lastFrame()).toContain('expected text');
  });
});
```

## Coverage

No coverage thresholds are configured in `vitest.config.ts`, and coverage collection is not enabled by default.

## CI Integration

No CI pipeline is configured in this repository (no `.github/workflows/` directory exists). Tests are run locally with `npm test`.
</content>
</invoke>
