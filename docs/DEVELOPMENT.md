# Development Guide

This guide covers everything needed to work on Shred Scout locally - from initial setup through the build pipeline, code style rules, and extending the scraping and compatibility systems.

## Local Setup

```bash
git clone <your-fork-url>
cd idk
npm install
```

Before the dev server or tests will work, you need a successful build because the `bin/shred-scout` shim and several tests import from `dist/`. Run the build once after cloning:

```bash
npm run build
```

To install the `shred-scout` command globally on your machine (optional, for interactive testing):

```bash
npm run setup   # runs npm run build && npm link
```

## Build Commands

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript with tsup (`tsup`) - outputs ESM bundle to `dist/` |
| `npm run dev` | Run `src/cli.ts` directly via tsx (`tsx src/cli.ts`) - no build step, faster iteration |
| `npm start` | Run the built CLI via the `bin/shred-scout` shim (`node bin/shred-scout search`) |
| `npm run demo` | Build, then run the offline-fixtures demo (`node dist/cli.js --demo`) |
| `npm run setup` | Build, rebuild the `better-sqlite3` native binding, then `npm link` to install `shred-scout` globally |
| `npm test` | Build first, then run Vitest in single-pass mode (`npm run build && vitest run`) |
| `npm run test:watch` | Run Vitest in watch mode (`vitest`) - no build step, uses tsx transforms |
| `npm run lint` | Run Biome across the whole project (`biome check .`) |
| `npm run format` | Auto-format all files with Biome (`biome format --write .`) |
| `npm run postinstall` | Install the bundled `chafa` binary (`node scripts/install-chafa.mjs`) - runs automatically after `npm install` |
| `npm run prepublishOnly` | Build before publish (`npm run build`) - lifecycle hook, not for manual use |

### Build output structure

tsup compiles two entry points into `dist/`:

```
dist/
  cli.js          # CLI entry point (compiled from src/cli.ts)
  cli.js.map      # Source map
  index.js        # Public library entry point (compiled from src/index.ts)
  index.js.map    # Source map
  index.d.ts      # Type declarations (generated from src/index.ts only)
```

The `bin/shred-scout` shim does a dynamic `import('../dist/cli.js')` and exits with a clear error message if the build is missing. The shim itself is plain Node.js with a `#!/usr/bin/env node` shebang - no compilation required.

## Code Style

Shred Scout uses [Biome](https://biomejs.dev/) for both linting and formatting. Configuration lives in `biome.json` at the project root.

**Style rules in effect:**
- Indent: 2 spaces
- Quotes: single quotes for JavaScript/TypeScript
- Semicolons: always
- Import organization: enabled (Biome auto-sorts imports)
- Ignored paths: `dist/`, `node_modules/`

Run the linter:

```bash
npm run lint
```

Auto-fix formatting:

```bash
npm run format
```

Biome is not currently enforced in CI - but all PRs should pass `npm run lint` locally before submission.

## ESM Import Requirements

The project is pure ESM (`"type": "module"` in `package.json`) and uses `"moduleResolution": "NodeNext"` in `tsconfig.json`. This means:

- **All relative imports must include the `.js` extension**, even when importing `.ts` source files.
- TypeScript resolves `.ts` at compile time; Node.js sees `.js` at runtime after the build.

```typescript
// Correct
import { runRules } from './compatibility/engine.js';
import type { GearSetup } from './types.js';

// Wrong - will fail at runtime
import { runRules } from './compatibility/engine';
```

There is no `__dirname` in ESM scope. Use the pattern from `src/cli.ts` when you need the current file's directory:

```typescript
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
```

## Adding a New Retailer

All scraped retailers are declared in `src/data/retailers.ts`. The `RETAILERS` constant is the single source of truth - the scraper, normalizer, and SQLite persistence all iterate over it.

To add a new Shopify retailer:

1. Open `src/data/retailers.ts`.
2. Add an entry to the `RETAILERS` array:

```typescript
export const RETAILERS: readonly Retailer[] = [
  { name: 'stoked', baseUrl: 'https://stokedboardshop.com' },
  { name: 'thirtytwo', baseUrl: 'https://www.thirtytwo.com' },
  { name: 'nidecker', baseUrl: 'https://www.nidecker.com' },
  { name: 'mynewstore', baseUrl: 'https://www.mynewstore.com' }, // add here
] as const;
```

The `name` field becomes the `retailer` column value in SQLite. The `baseUrl` must not have a trailing slash - the scraper appends `/products.json?limit=250&page=N` automatically.

**Before adding a retailer**, verify the store's endpoint is accessible:

```bash
curl -s 'https://www.mynewstore.com/products.json?limit=1&page=1' | head -c 200
```

A valid response starts with `{"products":[`. Stores returning 403, a redirect to a login page, or an empty non-JSON response will cause `runSearch()` to log a per-retailer error and continue - they will not crash the app.

### Shopify pagination

The scraper in `src/data/shopify.ts` uses `?limit=250&page=N` and loops until the response array is empty. The Shopify public `products.json` endpoint hard-caps at 250 items per page. Do not change `limit=250` - values above 250 are silently capped by Shopify and result in incomplete pagination.

## Adding Compatibility Rules

Compatibility logic lives in `src/domain/compatibility/`. Every rule, advisory, and sizing helper is a pure function - no I/O, no side effects, never throws.

### Directory layout

```
src/domain/compatibility/
  types.ts             # GearSetup, RuleResult, MountPattern, Verdict - no runtime code
  rules.ts             # bootToBindingSize, bootToBoardWaist, discToMount (the 3 hard rules)
  flex-advisory.ts     # flexAdvisory - riding-style flex pairing, the only source of verdict 'unknown'
  engine.ts            # runRules() (3 hard rules) and evaluateCompatibility() (hard rules + flex advisory)
  board-sizing.ts      # recommendBoardLength() + parseBoardLengthsCm() - weight/height/skill/style -> length window, used to RANK not filter
  setup-badges.ts      # badgeFor / sortedCandidates / annotateCandidates / trayVerdict - fit badges for the setup builder
  product-adapter.ts   # toBoard / toBinding / toBoot / bootFit - maps NormalizedProduct into rule inputs
  sizing-tables.ts     # Boot sizing lookup tables
```

`engine.ts` exposes two entry points. `runRules()` returns the three hard verdicts; `evaluateCompatibility()` returns those three plus the riding-style flex advisory and is the entry point the UI consumes.

`board-sizing.ts` recommends a board-length window from the rider's weight (primary), height, skill, and style; it feeds the candidate ranking so well-sized boards surface first. `setup-badges.ts` builds on the rules, the board-sizing model, and `rank.ts` to produce the per-candidate fit badges, the compatible-first candidate ordering, and the whole-setup tray verdict rendered in the setup builder.

### Adding a new hard rule

1. Add the rule function to `src/domain/compatibility/rules.ts`. Follow the existing signature:

```typescript
export function myNewRule(setup: GearSetup): RuleResult {
  // pure - no I/O, no throws, every code path returns RuleResult
  return {
    ruleId: 'my-new-rule',   // stable kebab-case identifier
    verdict: 'pass',          // 'pass' | 'warn' | 'fail'
    reason: 'Human-readable explanation rendered in the UI',
  };
}
```

2. Import and call the new rule in `src/domain/compatibility/engine.ts`:

```typescript
import { bootToBindingSize, bootToBoardWaist, discToMount, myNewRule } from './rules.js';

export function runRules(setup: GearSetup, _rider: RiderProfile): RuleResult[] {
  return [
    bootToBindingSize(setup),
    bootToBoardWaist(setup),
    discToMount(setup),
    myNewRule(setup),     // add here
  ];
}
```

3. Add tests in `tests/compatibility.test.ts` covering pass, warn, and fail branches.

**Hard rule contract:**
- Never emit verdict `'unknown'` (that is reserved for `flexPairing` advisory only).
- Never set `advisory: true`.
- Never throw - every code path must return a `RuleResult`.

### Mounting pattern note

`'channel'` in the type system refers exclusively to **Burton Channel** (EST/Re:Flex). Non-Burton channel-like systems (e.g., Nitro 3D, Sparks track) must be mapped to `'4x4'` or `'2x4'` during product normalization to avoid false-pass verdicts in `discToMount()`.

## Ink Component Constraints

These constraints are non-negotiable - violating them causes silent breakage or demo-killing crashes.

### TTY detection

Ink requires an interactive TTY for raw mode input. The entry point `src/cli.ts` calls `assertTTY()` before rendering anything. If stdin is not a TTY (e.g., piped input in CI), the process exits with a clear error message rather than crashing mid-render.

When writing tests that invoke the CLI, use the test utilities in `tests/` that mock TTY state rather than piping stdin directly.

### No direct stdout writes inside components

Never call `process.stdout.write()` or `console.log()` inside a React component or during the Ink render cycle. Ink owns stdout entirely while rendering. Any direct writes corrupt the terminal output.

Instead, accumulate output into React state (via `useReducer` or `useState`) and let Ink render it on the next tick.

```typescript
// Wrong - corrupts Ink output
useEffect(() => {
  console.log('search complete');
}, [results]);

// Correct - drives state, Ink renders it
useEffect(() => {
  dispatch({ type: 'SEARCH_COMPLETE', payload: results });
}, [results]);
```

### React version pinning

Ink 6.8.0 requires React >=19, and this project pins React 19.1.0. The `package.json` `overrides` field pins `react` to `19.1.0` and `@types/react` to `^19.1.5` to prevent dual-React drift when adding dependencies. After any `npm install`, verify with:

```bash
npm ls react
```

There must be exactly one version in the tree. The expected output is `react@19.1.0` deduped across Ink and `react-reconciler`, with the root entry marked `overridden`:

```
└── react@19.1.0 overridden
```

If a second version appears, the new dependency has pulled in a conflicting React - check its `peerDependencies` and use `overrides` to enforce the pinned version.

## Testing

Tests live in `tests/` and use Vitest. The naming convention is `tests/*.test.{ts,tsx}`.

```bash
npm test          # build + vitest run (full suite, single pass)
npm run test:watch  # vitest watch mode (no build step)
```

A shared setup file at `tests/setup.ts` runs in each worker before tests. It sets `IS_REACT_ACT_ENVIRONMENT` to suppress React 19 act() warnings from the ink-testing-library.

Test timeout is 15 seconds per test (`testTimeout: 15000` in `vitest.config.ts`). Tests run in isolated forks (`pool: 'forks'`).

For component tests, use `ink-testing-library` - see existing files like `tests/result-card.test.tsx` for the pattern.

## Next Steps

- See `docs/ARCHITECTURE.md` for the component diagram and data flow.
- See `docs/CONFIGURATION.md` for environment variables and runtime configuration.
