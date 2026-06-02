# Testing

## Framework and Setup

Shred Scout uses **Vitest 4** as its test runner with **ink-testing-library 4** for Ink component rendering. Tests are written in TypeScript and run as ESM modules.

**Configuration:** `vitest.config.ts` at the project root.

Key settings:
- `pool: 'forks'` — each test file runs in an isolated worker process, preventing module state from leaking between files
- `testTimeout: 15000` — 15-second default per test (network-adjacent tests need headroom)
- `setupFiles: ['./tests/setup.ts']` — runs before every worker; sets `IS_REACT_ACT_ENVIRONMENT = true` to suppress React 19 act() warnings in Ink component tests
- `typecheck.tsconfig: './tsconfig.test.json'` — extends the root tsconfig with `rootDir: '.'` so both `src/` and `tests/` are in scope

## Running Tests

**Standard run** (builds first, then runs the full suite):
```bash
npm test
```

The `test` script in `package.json` runs `npm run build && vitest run`. The build step is required because `tests/cli.test.ts` imports from `dist/cli.js` directly and tests the compiled CLI binary.

**Watch mode** (no build step — for development):
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

This test is guarded by `process.env.E2E === '1'` and is skipped in all other runs. It makes real HTTP requests to `evo.com`.

## Test File Naming Convention

All test files live in `tests/` at the project root. The naming convention is:

- TypeScript logic tests: `*.test.ts`
- Ink component tests (JSX): `*.test.tsx`

Files match the source module or component they exercise, not a directory structure. For example, `tests/normalizer.test.ts` tests `src/data/normalizer.ts`.

## Test File Inventory

### `tests/setup.ts`
Global setup file, not a test file. Executes in every worker before tests run. Sets `globalThis.IS_REACT_ACT_ENVIRONMENT = true` so React 19 does not log warnings when `act()` is called from ink-testing-library.

### `tests/db.test.ts`
Tests `src/data/db.ts` — the SQLite database initialization function `openDatabase()`.

Covers:
- Opens without throwing when given `':memory:'`
- All required tables are created: `products`, `price_observations`, `saved_setups`, `schema_versions`
- The `UNIQUE(shopify_id, retailer)` constraint allows `INSERT OR REPLACE` upserts
- The `001_initial` migration is recorded in `schema_versions`
- WAL mode pragma is accepted without throwing
- Foreign keys pragma is enabled (`foreign_keys = 1`)
- Multiple calls with separate `:memory:` instances are idempotent

All tests use `:memory:` databases — no files are written to disk.

### `tests/repos.test.ts`
Tests the three data repository factories in `src/data/repos/`: `makePriceRepo`, `makeRiderRepo`, and `makeSetupRepo`.

Each test creates a fresh `openDatabase(':memory:')` instance directly (no mocking). Covers:
- **priceRepo**: records and retrieves price observations; orders by `observed_at DESC`; enforces foreign key constraint (throws on invalid `productId`)
- **riderRepo**: returns `null` with no data; `upsert()` + `get()` round-trip; second upsert updates in place (no duplicate rows)
- **setupRepo**: returns empty array with no data; `save()` + `list()` round-trip; compatibility JSON is serialized and deserialized correctly; `list()` returns newest first

### `tests/normalizer.test.ts`
Tests `src/data/normalizer.ts` — the three exported functions used to transform raw Shopify API responses into `NormalizedProduct` records.

Covers:
- **`parsePriceCents()`**: converts price strings like `"449.95"` to integer cents (`44995`); returns `0` for empty string, `null`, or non-numeric input
- **`detectGearCategory()`**: classifies products as `'board'`, `'binding'`, `'boot'`, or `null` using `product_type`, tags array, and title keyword fallbacks
- **`inferMountPattern()`**: returns `'channel'` only for Burton-vendor products with channel/EST keywords; maps all others to `'4x4'` or `'2x4'`; stores the raw matched keyword in `mountPatternRaw`
- **`normalizeProduct()`**: integration tests covering cheapest-variant price selection, `image_url` from `images[0].src`, `variants_json` serialization, `fetched_at` timestamp, `shopify_id` string coercion, `retailer` field, and comma-separated tags string handling

Uses `vi.resetModules()` in `afterEach` so each test imports a fresh module instance (required because the module is loaded with `await import()`).

### `tests/compatibility.test.ts`
Tests the compatibility rules in `src/domain/compatibility/rules.ts` and the engine in `src/domain/compatibility/engine.ts`.

Covers:
- **`bootToBindingSize()`**: full pass/warn/fail/boundary matrix — 27 cases covering five size ranges at exact boundary values (the warn zone is ±0.25 US sizes from the binding's min/max)
- **`bootToBoardWaist()`**: pass/warn/fail at computed thresholds for US 7, 9, and 10 boots (formula: `bootLengthMm = size * 8.1 + 209`; warn below `bootLengthMm - 15`; fail below `bootLengthMm - 25`)
- **`discToMount()`**: all nine mount-pattern × disc-pattern combinations (4x4, 2x4, channel)
- **`runRules()`**: returns exactly 3 `RuleResult` objects with stable `ruleId` values; all-pass and mixed-verdict setups; `reason` is always a non-empty string

### `tests/flex-advisory.test.ts`
Tests `src/domain/compatibility/flex-advisory.ts` — the advisory (non-blocking) flex rating check.

Covers: all three riding styles (beginner, all-mountain, freeride) at in-range and out-of-range flex ratings; `undefined` flex rating produces `verdict: 'unknown'`; `ruleId` is always `'flex-pairing'`; `advisory: true` is always set.

### `tests/filter-spec.test.ts`
Tests `src/agent/filter-spec.ts` — the `applyFilterSpec()` function that filters a `NormalizedProduct[]` by search criteria.

Covers: empty spec returns all products; does not mutate the input array; `priceMax` filter (USD to cents conversion); `gearType` filter for board/binding/boot; `retailer` slug filter; `color` case-insensitive title substring match; `flex` stiff/soft keyword match; AND combination of multiple fields; returns empty array when nothing matches.

### `tests/scraper.test.ts`
Tests `src/data/shopify.ts` — the `fetchAllProducts()` Shopify scraper. Uses **undici `MockAgent`** to intercept HTTP at the dispatcher level with no real network calls.

Covers:
- Single-page store: two products returned, pagination stops after empty page 2
- Multi-page store: 350 products across two pages (250 + 100), proving the pagination loop works past the 250-item hard cap
- Zero-product store: empty `products[]` on page 1 stops immediately
- Tags as both string (`'snowboard, freeride, channel'`) and array form
- URL format: requests use `{storeUrl}/products.json?limit=250&page={N}`

Setup pattern: `beforeEach` creates a new `MockAgent`, calls `mockAgent.disableNetConnect()`, and installs it as the global dispatcher via `setGlobalDispatcher(mockAgent)`. `afterEach` calls `mockAgent.close()`.

### `tests/pipeline.test.ts`
Tests `src/data/pipeline.ts` — the `RequestPipeline` class that wraps undici with retry logic and concurrency control. Also uses `MockAgent`.

Covers:
- Default values: `concurrency=2`, `timeout=15000`, user-agent string `'shred-scout/1.0.0 (https://github.com/user/shred-scout)'` (must not contain `'Mozilla'` or `'Chrome'`)
- Sends the correct `User-Agent` header on every request
- Retries on HTTP 429, succeeds on subsequent 200
- Throws immediately on HTTP 404 (`Permanent HTTP 404` message, no retry)
- Throws after retries exhausted on HTTP 500 (4 attempts: 1 original + 3 retries)
- Three concurrent requests all complete when `concurrency=2`

### `tests/search-pipeline.test.ts`
Tests `src/agent/search-pipeline.ts` — the `runSearch()` orchestrator function. All dependencies are mocked with `vi.mock()`.

Mocked modules:
- `src/data/shopify.js` — `fetchAllProducts` returns a single test product
- `src/data/db.js` — `openDatabase` returns a stub with a `close()` method
- `src/data/repos/productRepo.js` — `makeProductRepo` returns a stub `{ upsert: vi.fn() }`
- `src/data/normalizer.js` — `normalizeProduct` returns a fixed object
- `src/data/retailers.js` — `RETAILERS` is a single-entry array `[{ name: 'TestRetailer', baseUrl: 'https://test-retailer.com' }]`
- `src/data/pipeline.js` — `RequestPipeline` is an empty class

Covers: `runSearch()` returns `{ products, errors }` shape; `products` is a non-empty array when fetch succeeds; `errors` is populated (not thrown) when `fetchAllProducts` rejects; error string contains the retailer name.

### `tests/result-card.test.tsx`
Tests the `ResultCard` Ink component in `src/components/ResultCard.tsx` using `ink-testing-library`.

Mocks:
- `terminal-image` — `buffer()` returns the fixed string `'[mock-image]'`
- `globalThis.fetch` — returns an `ArrayBuffer(0)` to prevent real HTTP

Covers: renders product title, price, and retailer name in text-only mode (`supportsImages=false`); does not render image when `supportsImages=false`; renders the `[mock-image]` ANSI string after async state update when `supportsImages=true` and `image_url` is set; handles `null` `image_url` gracefully; renders `SaleDisplay` with `% OFF` badge when `compare_at_price > price`.

Uses `act(async () => { await new Promise(r => setTimeout(r, 50)) })` to flush async state updates from the image fetch effect.

### `tests/comparison-group.test.tsx`
Tests the `ComparisonGroup` Ink component in `src/components/ComparisonGroup.tsx`.

Covers: renders the `normalizedTitle` as a group header; renders each retailer's name and price as a sub-row; shows `[Best Price]` label on the cheapest retailer row; does not show `[Best Price]` on the more expensive retailer row.

### `tests/sale-display.test.tsx`
Tests the `SaleDisplay` Ink component in `src/components/SaleDisplay.tsx`.

Covers: renders `(N% OFF)` badge; renders `(was $X.XX)` for the original price; renders the current sale price; calculates discount percentage using `Math.round((1 - current/original) * 100)` (e.g., 51999 / 64999 = 20% OFF).

### `tests/search-view.test.tsx`
Tests the `SearchView` Ink component in `src/components/SearchView.tsx`. Mocks `runSearch` from `src/agent/search-pipeline.ts` and `RequestPipeline` from `src/data/pipeline.ts`.

Covers: renders `ComparisonGroup` (with `[Best Price]`) when two products share the same normalized title; renders a plain `ResultCard` for a single-retailer product; renders `'No results yet'` empty state before any search is submitted.

Uses a `submitSearch()` helper that writes text to stdin, writes `\r` (Enter), and flushes with `act()`.

### `tests/wizard.test.tsx`
Tests the `WizardScreen` Ink component in `src/components/wizard/WizardScreen.tsx` through all four onboarding steps. Mocks `src/lib/profile.js` to prevent real `conf` writes.

Covers (step by step):
- **Step 1 (boot size)**: renders `'Profile Setup (1/4)'` and the boot size prompt; advances on valid input (`10.5`); stays on step 1 with the exact error message `'Boot size must be a number between 4.0 and 18.0'` on invalid input
- **Step 2 (height)**: accepts feet/inches format (`5'10"`) and bare centimeters (`178`); stays with error on unparseable input
- **Step 3 (weight)**: advances on valid lbs input; stays with `'Enter weight in lbs between 66 and 440'` on out-of-range value
- **Step 4 (riding style)**: renders all five style options (All-Mountain, Freestyle, Freeride, Backcountry, Beginner); calls `onComplete` with correct `RiderProfile` values after Enter — including `165 lbs → 75 kg` conversion and `"5'10"` → `178 cm` conversion

### `tests/app.test.ts`
Tests the top-level `App` Ink component in `src/components/App.tsx`. Mocks profile, database, search pipeline, and request pipeline.

Covers:
- Renders `WizardScreen` (shows `'Profile Setup'`) when no profile exists
- Renders the search header (shows `'Boot: 10.5'`, not `'Profile Setup'`) when a profile exists
- Transitions from onboarding to search screen after all four wizard steps complete
- Pressing `q` does not call `process.exit` directly (quit is handled via ink's `useApp().exit()`)

### `tests/tty.test.ts`
Tests `src/lib/tty.ts` — the `isTTY()` helper that detects whether the process is running in an interactive terminal. Uses `vi.spyOn` on `process.stdin.isTTY` and `process.stdout.isTTY` getters.

Covers: returns `true` when both stdin and stdout are TTYs; returns `false` when stdin is not a TTY; returns `false` when stdout is not a TTY; returns `false` when neither is a TTY.

Uses `vi.resetModules()` in `afterEach` to force a fresh ESM module import per test (the module reads `process.stdin.isTTY` at call time, so no module reset would be needed, but the pattern is applied defensively).

### `tests/cli.test.ts`
End-to-end CLI tests that spawn the **compiled binary** at `dist/cli.js` using `execa`'s `execaNode()`. Requires `npm run build` to have run first (satisfied by `npm test`).

Covers:
- `--version` prints `'shred-scout X.Y.Z'` to stdout and exits 0
- `--help` prints output containing `'shred-scout'` and exits 0
- Piped stdin (non-TTY) exits with code 1 and writes `'requires an interactive terminal'` to stderr

### `tests/e2e-pagination.test.ts`
Live network test for the Shopify pagination loop. Skipped unless `E2E=1` is set in the environment.

Covers: `fetchAllProducts()` returns more than 250 products from `evo.com` (proving the pagination loop runs past the 250-item-per-page hard cap); each product has required fields (`id`, `title`, `variants`).

Run with: `E2E=1 npx vitest run tests/e2e-pagination.test.ts`

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

`lastFrame()` returns the current terminal output as a plain string including ANSI escape codes stripped to text. Use `toContain()` for text assertions — exact frame matching is fragile.

For components with async state updates (e.g., image fetching in `ResultCard`), flush the effect with:
```typescript
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
```

The `IS_REACT_ACT_ENVIRONMENT` global set in `tests/setup.ts` is required for `act()` to work without warnings in React 19.

## SQLite in Tests

All database tests use **in-memory databases** — no files are written to disk. The pattern is:

```typescript
import { openDatabase } from '../src/data/db.js';

const db = openDatabase(':memory:');
// use db directly — tables are created by openDatabase()
```

`openDatabase(':memory:')` runs the full migration (creates all tables, records `001_initial` in `schema_versions`, enables WAL pragma and foreign keys). Each test that needs database state creates its own `':memory:'` instance — there is no shared database between tests.

When testing code that depends on a database (e.g., `repos.test.ts`), import `openDatabase` directly and pass the in-memory instance to the repo factory. When testing higher-level code that calls `openDatabase` internally (e.g., `search-pipeline.test.ts`), mock `src/data/db.js` with `vi.mock()`.

## Mocking the Scraper

The scraper (`fetchAllProducts` in `src/data/shopify.ts`) is tested two ways depending on the level:

**Unit/integration tests** (`scraper.test.ts`, `pipeline.test.ts`): use **undici `MockAgent`** to intercept HTTP at the transport layer without any module mocking. `MockAgent.disableNetConnect()` ensures no accidental live requests.

```typescript
import { MockAgent, setGlobalDispatcher } from 'undici';

const mockAgent = new MockAgent();
mockAgent.disableNetConnect();
setGlobalDispatcher(mockAgent);

const pool = mockAgent.get('https://www.evo.com');
pool
  .intercept({ path: '/products.json?limit=250&page=1', method: 'GET' })
  .reply(200, JSON.stringify({ products: [...] }), {
    headers: { 'content-type': 'application/json' },
  });

// page 2 must return empty array to stop the pagination loop
pool
  .intercept({ path: '/products.json?limit=250&page=2', method: 'GET' })
  .reply(200, JSON.stringify({ products: [] }), {
    headers: { 'content-type': 'application/json' },
  });

await mockAgent.close(); // afterEach
```

**Component/orchestrator tests** (`search-pipeline.test.ts`, `search-view.test.tsx`, `app.test.ts`): use `vi.mock()` to replace `src/data/shopify.js` entirely:

```typescript
vi.mock('../src/data/shopify.js', () => ({
  fetchAllProducts: vi.fn().mockResolvedValue([/* product fixtures */]),
}));
```

## Writing a New Test

1. Create `tests/{module-name}.test.ts` (or `.tsx` for Ink components).
2. Import only from `vitest` — do not use Jest globals. `globals: false` is set in `vitest.config.ts`, so `describe`, `it`, `expect`, `vi` must all be imported explicitly.
3. Use `vi.resetModules()` in `afterEach` when the test uses `await import()` to load the module under test — this forces a fresh module instance for each test and prevents state leakage between tests in the same file.
4. For database tests, call `openDatabase(':memory:')` per test — never share a database instance between tests.
5. For HTTP tests, set up `MockAgent` in `beforeEach` and call `mockAgent.close()` in `afterEach`.
6. For Ink component tests with async effects (image loading, search completion), use `act(async () => { await new Promise(r => setTimeout(r, 50)); })` to flush pending state updates before asserting on `lastFrame()`.

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

No coverage thresholds are configured in `vitest.config.ts`. Coverage collection is not enabled by default — there is no `coverage` section in the Vitest config.

## CI Integration

No CI pipeline is configured in this repository (no `.github/workflows/` directory exists). Tests are run locally with `npm test`.
