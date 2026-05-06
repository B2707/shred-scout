<!-- generated-by: gsd-doc-writer -->
# Shred Scout

Agentic terminal UI for finding compatible snowboard gear deals across multiple retailers.

Shred Scout scrapes Shopify-powered snowboard shops, normalizes product data into a local SQLite database, and presents an interactive search interface in your terminal — no browser required.

## Features

- **Interactive TUI** — Ink-powered terminal interface with keyboard navigation; press `q` to quit
- **Multi-retailer scraping** — Queries Stoked Board Shop, ThirtyTwo, and Nidecker concurrently via their public Shopify `products.json` endpoints (no API key required)
- **Cross-retailer price comparison** — Groups identical products from different retailers and highlights the best price in green
- **Sale detection** — Displays original vs. sale price when `compare_at_price` exceeds current price
- **Compatibility engine** — Evaluates board/binding/boot setups against three hard rules: boot-to-binding size fit, boot-to-board waist width, and binding disc-to-mount pattern compatibility
- **Rider profile wizard** — First-run onboarding captures boot size, height, weight, and riding style; stored locally via `conf`
- **Inline product images** — Renders product images inline in terminals that support iTerm2 or Kitty image protocols
- **Rate-limited HTTP pipeline** — `undici` + `p-queue` (2 concurrent requests per hostname) with exponential backoff retry (3 retries: 1s → 2s → 4s)

## Prerequisites

- **Node.js** `>=20.19.0` (ESM only — CommonJS not supported)
- **npm** (included with Node.js)

## Installation

Clone the repository and install dependencies:

```bash
git clone <repo-url> shred-scout
cd shred-scout
npm install
```

Build the project and link the `shred-scout` binary globally:

```bash
npm run setup
```

`npm run setup` runs `npm run build && npm link`, making `shred-scout` available as a system command.

## Usage

### After global setup

```bash
shred-scout
```

With no arguments, the CLI prints help. The default command is `search`:

```bash
shred-scout search
```

### Without global install

```bash
npm start
```

`npm start` runs `node bin/shred-scout search` — no `npm link` required.

### Development mode (live TypeScript)

```bash
npm run dev
```

Runs `tsx src/cli.ts` directly — no build step needed during development.

### CLI flags

| Flag | Description |
|------|-------------|
| `-v, --version` | Print version and exit |
| `-h, --help` | Show help |

### First run

On first launch, Shred Scout runs an onboarding wizard to capture your rider profile:

1. Boot size (US)
2. Height (converted and stored in cm)
3. Weight (converted and stored in kg)
4. Riding style — one of: `all-mountain`, `freestyle`, `freeride`, `backcountry`, `beginner`

After completing the wizard, you are taken to the search view. Type a query and press Enter to search. Press `q` at any time to quit.

## Architecture Overview

```
src/
├── cli.ts                  Entry point — Commander CLI, TTY guard, screen routing
├── components/             Ink (React) UI components
│   ├── App.tsx             Root component — onboarding → search screen routing
│   ├── Header.tsx          Profile header bar shown after wizard completion
│   ├── SearchView.tsx      Search input, loading state, and results rendering
│   ├── ResultCard.tsx      Single-product card with price, sale indicator, and image
│   ├── ComparisonGroup.tsx Cross-retailer price comparison grouped by product title
│   ├── CompatBadge.tsx     Colored verdict badge for compatibility rule results
│   ├── SaleDisplay.tsx     Original price vs. sale price display
│   └── wizard/             First-run onboarding wizard steps
├── agent/
│   ├── search-pipeline.ts  runSearch() — iterates all retailers, fetches and normalizes products
│   └── filter-spec.ts      FilterSpec type and applyFilterSpec() pure filter function
├── data/
│   ├── shopify.ts          fetchAllProducts() — paginates Shopify products.json (250/page)
│   ├── normalizer.ts       normalizeProduct() — maps raw Shopify JSON to NormalizedProduct
│   ├── pipeline.ts         RequestPipeline — undici + p-queue + p-retry HTTP layer
│   ├── db.ts               SQLite database setup via better-sqlite3
│   ├── retailers.ts        RETAILERS constant — configured Shopify store base URLs
│   └── repos/              SQLite repository layer (product upsert/query)
├── domain/
│   └── compatibility/      Compatibility engine — board/binding/boot rule evaluation
│       ├── engine.ts       runRules() — runs all three hard compatibility rules
│       ├── rules.ts        bootToBindingSize, bootToBoardWaist, discToMount
│       ├── types.ts        GearSetup, RuleResult, MountPattern, Verdict types
│       └── flex-advisory.ts flexPairing advisory (soft recommendation)
├── lib/
│   ├── profile.ts          readProfile() / writeProfile() via conf
│   └── tty.ts              assertTTY() / isTTY() — non-TTY stdin guard
└── types/
    ├── profile.ts          RiderProfile interface
    └── product-groups.ts   groupProducts() — groups products for comparison rendering
```

**Data flow:**

1. `shred-scout search` → `assertTTY()` gates non-interactive stdin
2. `App` reads saved profile → routes to wizard (first run) or search view
3. Search view calls `runSearch(query, profile, pipeline)`
4. `runSearch` iterates `RETAILERS`, calls `fetchAllProducts()` per retailer
5. `fetchAllProducts` paginates `/products.json?limit=250&page=N` until empty
6. Each product is passed through `normalizeProduct()` and upserted into SQLite
7. `groupProducts()` groups results by normalized title for cross-retailer comparison
8. Results render as `ResultCard` (single retailer) or `ComparisonGroup` (multiple retailers)

## Development

```bash
npm run build      # Compile TypeScript via tsup → dist/
npm run dev        # Run directly with tsx (no build needed)
npm run lint       # Check code with Biome
npm run format     # Format code with Biome
npm test           # Build then run Vitest test suite
npm run test:watch # Run Vitest in watch mode
```

## License

See LICENSE file for details.
