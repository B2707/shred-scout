# Architecture

Shred Scout is a terminal UI application (TUI) that scrapes snowboard gear from multiple
retailers, normalizes and persists the products locally, and renders them in an interactive
React/Ink interface. There is no backend server and no LLM. All processing happens locally and
deterministically: scrape, normalize, score, and check compatibility with plain TypeScript.

## Directory structure

```
src/
├── cli.ts                  # CLI entry point - Commander setup, TTY gate, commands (search/watch/add-store)
├── index.ts                # Package public-API barrel exports
├── agent/
│   ├── search-pipeline.ts  # runSearch() orchestrator - load stores -> fetch -> normalize -> persist -> return
│   ├── rank.ts             # rankProducts()/scoreProduct() - soft, rider-aware result ordering
│   └── filter-spec.ts      # FilterSpec type + applyFilterSpec() pure predicate builder
├── components/
│   ├── App.tsx             # Root Ink component - screen router + global key handling
│   ├── Header.tsx          # Gradient title bar + rider profile summary
│   ├── SearchView.tsx      # Search input + result list + save/alert UX (single-category results)
│   ├── ResultCard.tsx      # Single product card (text-only; opens ProductDetail via number key)
│   ├── ProductDetail.tsx   # Render-once full-screen view with the real product photo (iTerm2/Kitty)
│   ├── ComparisonGroup.tsx # Multi-retailer price comparison for same-title products
│   ├── SetupBuilderView.tsx# "Build a full setup" screen - tray + compatible-first candidate list
│   ├── SetupSummaryView.tsx# Completed-setup summary shown after all three slots are saved
│   ├── WishlistView.tsx    # Saved setups list with delete / history / alert toggle
│   ├── HistoryView.tsx     # Price-history table for a single product
│   ├── CompatBadge.tsx     # Colored verdict badge for a single RuleResult
│   ├── SaleDisplay.tsx     # Sale price display
│   ├── TerminalImage.tsx   # Image renderer - iTerm2/Kitty graphics protocol, chafa fallback
│   └── wizard/             # The single guided setup wizard
│       ├── GearWizard.tsx  # The one linear wizard flow (steps + chrome)
│       ├── ImageOption.tsx # One image-bearing option row in a select step
│       └── wizard-config.ts# Step sequencing + option data + answer->profile/answer->search mapping
├── data/
│   ├── index.ts            # Barrel re-export for the data layer
│   ├── pipeline.ts         # RequestPipeline - undici + p-queue + p-retry, global pacing, 429-abort
│   ├── sources.ts          # ProductSource interface + ShopifySource
│   ├── smart-source.ts     # SmartShopifySource - Storefront GraphQL when a token exists, else products.json
│   ├── shopify.ts          # fetchAllProducts() - public /products.json fetcher with pagination
│   ├── storefront-api.ts   # Shopify Storefront GraphQL client + token auto-detection
│   ├── normalizer.ts       # Raw listing -> NormalizedProduct mapping (pure functions)
│   ├── stores.ts           # loadStores()/syncStoreToJson() - stores.json loader, embedded defaults
│   ├── db.ts               # SQLite open + inline migrations via better-sqlite3
│   ├── scrapers/
│   │   └── evo.ts          # EvoHtmlScrapeSource - evo.com HTML scraper (cheerio)
│   └── repos/              # Repository pattern, one factory per table
│       ├── productRepo.ts
│       ├── priceRepo.ts
│       ├── setupRepo.ts
│       ├── retailerRepo.ts # Dynamic retailer_configs store (replaces the old hardcoded list)
│       └── riderRepo.ts
├── domain/
│   ├── compatibility/      # Gear compatibility engine
│   │   ├── engine.ts       # runRules()/evaluateCompatibility() - runs the hard rules + flex advisory
│   │   ├── rules.ts        # The three hard rule functions
│   │   ├── flex-advisory.ts# Riding-style-aware flex advisory rule
│   │   ├── sizing-tables.ts# Per-brand binding size tables
│   │   ├── product-adapter.ts # NormalizedProduct -> engine domain types (Board/Binding/Boot)
│   │   ├── board-sizing.ts # recommendBoardLength()/parseBoardLengthsCm() - rider -> board length
│   │   ├── setup-badges.ts # badgeFor/sortedCandidates/annotateCandidates/trayVerdict for the builder
│   │   └── types.ts        # Shared domain types (MountPattern, Verdict, GearSetup, RuleResult)
│   └── alerts/
│       └── diff.ts         # priceDropAlert() - pure price-drop detection for the watch daemon
├── lib/
│   ├── profile.ts          # conf-backed profile persistence + validators (read/write/validate)
│   ├── conversions.ts      # Imperial -> metric input parsing (height/weight)
│   ├── assets.ts           # resolveAssetPath() - bundled image asset resolution
│   └── tty.ts              # TTY detection (assertTTY)
├── types/
│   └── profile.ts          # RiderProfile interface
└── fixtures/
    ├── demo-products.json  # Offline fixture catalog used by --demo
    └── assets/             # Concept/option art (skill, style, profile, category, flex, budget PNGs)
```

## Screen routing

`App.tsx` is a single component that holds a `Screen` state value and returns the matching view.
The `Screen` union is:

```ts
type Screen = 'wizard' | 'search' | 'builder' | 'wishlist' | 'history' | 'summary';
```

The app always starts on `'wizard'`. A saved profile (read once at mount via `readProfile()`)
pre-fills the rider-fact steps rather than skipping them.

```
wizard --(category !== 'setup')--> search --+--> wishlist --> history
   |                                         +--> builder (opened from results)
   +--(category === 'setup')-------> builder --> summary --> wishlist
```

- **wizard -> search**: when `handleWizardComplete` receives any single category
  (`board` / `binding` / `boot`), it stores the wizard query + filters via `wizardToSearch()`
  and routes to the results screen.
- **wizard -> builder**: when the wizard answer is `category === 'setup'` ("Full Setup"),
  `handleWizardComplete` routes to `SetupBuilderView` instead of the results list.
- **search -> builder / wishlist**: the results screen can open the builder, and `w` opens the
  saved-setups wishlist. A cached session (products + filters) is preserved in a ref so returning
  does not re-fetch.
- **builder/search -> summary**: completing all three setup slots and saving routes to
  `SetupSummaryView` (gated by `shouldOpenSummary` so an older complete setup never hijacks the
  jump).
- **wizard quit**: `nextScreenOnWizardQuit` returns to preserved results when the wizard was
  opened from a live session, otherwise it exits the app.

Global keys are screen-aware and handled in `App.tsx` (`q`, `w`, `n`), gated by a `blockQuitRef`
so child modals (filter panel, save box, alert prompt, delete confirm) can own input.

## Runtime flow

### First run (guided wizard)

```
shred-scout
  └─ src/cli.ts (search command, default)
       └─ assertTTY()
       └─ App (screen = 'wizard')
            └─ GearWizard
                 ├─ boot -> height -> weight -> skill -> style -> category -> [profile] -> confirm
                 └─ onComplete(answers)
                      ├─ answersToProfile(answers) -> writeProfile()
                      └─ category === 'setup' ? screen = 'builder' : screen = 'search'
```

The board-profile step is only shown when a board is involved (`category` is `board` or `setup`).

### Single-category search

```
App (screen = 'search')
  └─ SearchView (initialQuery supplied by the wizard -> runs on mount)
       └─ runSearch(query, profile, pipeline)            [src/agent/search-pipeline.ts]
            ├─ retailerRepo.seedIfEmpty(loadStores())     [seed from stores.json on first run]
            ├─ for each configured retailer source:
            │    ├─ SmartShopifySource.fetchAll() OR EvoHtmlScrapeSource.fetchAll()
            │    ├─ normalizeProduct(raw, retailer)        [pure mapping]
            │    └─ productRepo.upsert(normalized)         [SQLite upsert]
            └─ returns { products, errors }
       └─ rankProducts(found, profile) -> groupProducts() -> render ResultCard / ComparisonGroup
```

Sources come from the `retailer_configs` table (seeded from `stores.json` or the embedded
defaults). The evo.com source uses the HTML scraper; everything else uses `SmartShopifySource`.

### Full-setup builder

```
App (screen = 'builder')
  └─ SetupBuilderView (rider, repos, optional preloaded products)
       ├─ annotateCandidates(cat, products, setup, rider)  [src/domain/compatibility/setup-badges.ts]
       │    └─ rankProducts() then a stable severity re-sort (compatible-first)
       ├─ each row shows badgeFor(cat, candidate, setup, rider)  [live fit badge]
       ├─ trayVerdict(setup, rider) once all three slots are filled
       └─ save -> setupRepo.saveComplete() + priceRepo.record() -> onSetupSaved -> summary
```

### Watch daemon

`shred-scout watch` is a foreground daemon: it polls each watched setup's products via the
single-product Shopify endpoint through `RequestPipeline`, records prices via `priceRepo`, and
fires an OS notification when `priceDropAlert()` (in `src/domain/alerts/diff.ts`) detects a drop.

### CLI flags / commands

- `--demo` - skips all HTTP and returns fixtures from `src/fixtures/demo-products.json`; the App
  uses an in-memory SQLite DB so production data is never touched.
- `add-store <url>` - validates the URL (http/https only), classifies it as `html` (evo.com) or
  `shopify`, persists it to `retailer_configs`, and appends it to `stores.json`.

### TTY gate

`src/lib/tty.ts` exports `assertTTY()`, called before rendering Ink in the interactive commands.
It exits cleanly when stdin is not a TTY, preventing raw-mode errors in piped/CI environments -
the most common cause of demo failures.

## Key design decisions

### Ink + React for TUI

Ink renders React component trees to the terminal using a yoga-based layout. All UI state flows
through React (`useState` + `useReducer` + refs) - search results, loading state, and wizard
steps are driven by normal re-renders. Nothing is written to stdout outside of Ink's renderer.

### Deterministic, LLM-free pipeline

`runSearch()` in `src/agent/search-pipeline.ts` is entirely deterministic: load stores, fetch,
normalize, persist, return. Rider-aware ordering (`rankProducts`) and all compatibility verdicts
are plain functions. There is no model API anywhere in the codebase.

### Dynamic store configuration

Stores are not hardcoded. `loadStores()` (in `src/data/stores.ts`) reads `stores.json` from the
project root, falling back to an embedded default list. On first run `runSearch()` seeds the
`retailer_configs` SQLite table from it; subsequent runs use whatever the user has configured,
including stores added with `shred-scout add-store`.

### Two-tier Shopify fetching

`SmartShopifySource` prefers the official Shopify Storefront GraphQL API when a public token is
available (configured or auto-detected from the store homepage) and falls back to the public
`/products.json` endpoint otherwise. `fetchAllProducts()` paginates `/products.json` using
`?page=N` until a page returns an empty array (Shopify hard-caps responses at 250 items per
page).

### Compatibility engine

`evaluateCompatibility()` in `src/domain/compatibility/engine.ts` runs three hard rules plus one
riding-style-aware advisory:

| Rule | Description |
|------|-------------|
| `bootToBindingSize`  | Boot size must fall within the binding's resolved size range |
| `bootToBoardWaist`   | Boot overhang per side vs board waist width (toe/heel drag) |
| `discToMount`        | Binding disc pattern must be compatible with the board mount pattern |
| `flexAdvisory`       | Board flex vs the rider's riding-style expectation (advisory only) |

`product-adapter.ts` maps a scraped `NormalizedProduct` into the engine's `Board`/`Binding`/`Boot`
types, resolving binding letter sizes against the per-brand tables in `sizing-tables.ts` and
parsing flex strings into a 1-10 number. Mount-pattern data is inferred at normalization time by
`inferMountPattern()` in `src/data/normalizer.ts`. `board-sizing.ts` turns the rider's
weight/height/skill/style into a recommended board length, used by `rank.ts` and the builder's
fit badges.

### SQLite + conf for persistence

Two stores serve different roles:

- **`conf`** (JSON config file) - the rider profile; read synchronously during React init via
  `src/lib/profile.ts`.
- **`better-sqlite3`** (SQLite) - product catalog, price history, saved setups, and retailer
  configs; opened once per app lifetime in `App.tsx` and shared across repos.

A SQL mirror of the rider profile (`riderRepo`, table `rider_profile`) exists for queries that
join rider data with products; `conf` remains the primary profile store.

### HTTP request pipeline

`RequestPipeline` in `src/data/pipeline.ts` wraps `undici.fetch()` with:

- **p-queue**: a per-hostname concurrency limit (default 1 - gentle, avoids tripping rate limits).
- **Global pacing**: a minimum interval between any two requests (default 800ms) across all hosts.
- **p-retry**: up to 3 retries with exponential backoff (1s -> 2s -> 4s) on HTTP 5xx; immediate
  abort on HTTP 429 (the per-IP limit persists, so retrying only prolongs the block) and on all
  other 4xx; a 15s per-request timeout via AbortController; a desktop-Chrome User-Agent.

### Images

`TerminalImage` renders a crisp pixel photo via the iTerm2/Kitty graphics protocol when the
terminal supports it (detected once at mount in `App.tsx`) and falls back to chafa block art
otherwise. Inline pixel photos corrupt through Ink's re-rendering paged list, so real product
photos render only in the render-once `ProductDetail` view (opened from a card's number key).
Concept/option art renders in the wizard.

### Build system

`tsup` compiles `src/` to an ESM bundle in `dist/`, copying `src/fixtures/assets` to `dist/assets`
via `publicDir`. The `bin/` shim invokes `dist/cli.js`. The package is ESM-only
(`"type": "module"`) - all imports use `.js` extensions.

## Data model summary

```
products            <- scraped and normalized from each retailer source
  price_observations <- append-only historical price snapshots (FK to products)
  saved_setups       <- user-saved board/binding/boot combinations (+ compatibility snapshot, alert flag)
retailer_configs    <- dynamically configured store sources (seeded from stores.json)
rider_profile       <- single-row SQL mirror of the conf profile
schema_versions     <- inline migration tracking (append-only)
```

Migrations are inlined as template literals in `src/data/db.ts` and tracked in `schema_versions`.
