# Architecture

<!-- GSD-GENERATED -->

Shred Scout is a terminal UI application (TUI) that scrapes snowboard gear from Shopify-powered retailers, normalizes and persists the products locally, and renders them in an interactive React/Ink interface. There is no backend server and no LLM in the runtime path.

## Directory structure

```
src/
├── cli.ts                  # CLI entry point — Commander setup, TTY gate, screen launch
├── index.ts                # Package exports
├── agent/
│   ├── search-pipeline.ts  # runSearch() orchestrator — scrape → normalize → persist → return
│   └── filter-spec.ts      # Filter predicate builder for product queries
├── components/
│   ├── App.tsx             # Root Ink component — screen router (onboarding | search)
│   ├── Header.tsx          # Top bar showing rider profile summary
│   ├── SearchView.tsx      # Search input + result list + loading state
│   ├── ResultCard.tsx      # Single product card renderer
│   ├── ComparisonGroup.tsx # Side-by-side comparison for same-title products across retailers
│   ├── CompatBadge.tsx     # Compatibility status badge
│   ├── SaleDisplay.tsx     # Sale price display
│   └── wizard/             # Multi-step onboarding wizard
│       ├── WizardScreen.tsx
│       ├── BootSizeStep.tsx
│       ├── HeightStep.tsx
│       ├── WeightStep.tsx
│       └── RidingStyleStep.tsx
├── data/
│   ├── index.ts            # Barrel re-export for all data layer symbols
│   ├── retailers.ts        # Static RETAILERS constant — configured Shopify stores
│   ├── pipeline.ts         # RequestPipeline — undici + p-queue + p-retry
│   ├── shopify.ts          # Shopify products.json fetcher with pagination
│   ├── normalizer.ts       # Raw Shopify → NormalizedProduct mapping (pure functions)
│   ├── db.ts               # SQLite open + migrate via better-sqlite3
│   └── repos/              # Repository pattern for each table
│       ├── productRepo.ts
│       ├── priceRepo.ts
│       ├── riderRepo.ts
│       └── setupRepo.ts
├── domain/
│   ├── compatibility/      # Gear compatibility engine
│   │   ├── engine.ts       # checkCompatibility() — evaluates all rules
│   │   ├── rules.ts        # Individual compatibility rule functions
│   │   ├── flex-advisory.ts# Flex advisory recommendations
│   │   ├── sizing-tables.ts# Lookup tables for boot/board sizing
│   │   └── types.ts        # Shared domain types (MountPattern, CompatResult, etc.)
│   ├── conversions.ts      # Unit conversion utilities
│   └── profile.ts          # Profile-level domain logic
├── lib/
│   ├── profile.ts          # conf-backed profile persistence (readProfile / writeProfile)
│   └── tty.ts              # TTY detection utilities
└── types/
    ├── profile.ts          # RiderProfile interface
    └── product-groups.ts   # groupProducts() and ProductGroup types
```

## Runtime flow

### First run (onboarding)

```
shred-scout
  └─ src/cli.ts
       └─ App (screen = 'onboarding')
            └─ WizardScreen
                 ├─ BootSizeStep → HeightStep → WeightStep → RidingStyleStep
                 └─ onComplete → writeProfile() → screen = 'search'
```

### Search

```
App (screen = 'search')
  └─ SearchView
       ├─ <TextInput onSubmit={handleSubmit}> (user types query, presses Enter)
       └─ handleSubmit(query)
            └─ runSearch(query, profile, pipeline)       [src/agent/search-pipeline.ts]
                 ├─ for each retailer in RETAILERS:
                 │    ├─ fetchAllProducts(baseUrl, pipeline) [paginates /products.json]
                 │    ├─ normalizeProduct(raw, retailer)     [pure mapping]
                 │    └─ productRepo.upsert(normalized)      [SQLite upsert]
                 └─ returns { products, errors }
            └─ setProducts(found) → groupProducts() → render ResultCard / ComparisonGroup
```

### TTY gate

`src/lib/tty.ts` exports `assertTTY()` which calls `process.exit(1)` when stdin is not a TTY. This is called before rendering Ink to prevent raw-mode errors in piped/CI environments — the #1 cause of demo failures.

## Key design decisions

### Ink + React for TUI

Ink renders React component trees to the terminal using yoga-based layout. All UI state flows through React — `useState` + `useReducer` — so the search results, loading indicator, and wizard steps are all driven by normal React re-renders. No stdout writes outside of Ink's renderer.

### No LLM in the search path

`runSearch()` in `src/agent/search-pipeline.ts` is entirely deterministic: scrape → normalize → SQLite upsert → return. The LLM pipeline (AgentLoop) was removed in Phase 8. The `ANTHROPIC_API_KEY` configuration entry is vestigial but harmless.

### Shopify products.json pagination

`fetchAllProducts()` in `src/data/shopify.ts` paginates using the `?page=N` query parameter until a page returns an empty array. Shopify hard-caps responses at 250 items per page.

### Compatibility engine

The compatibility engine in `src/domain/compatibility/engine.ts` evaluates three rule classes:

| Rule | Description |
|------|-------------|
| `bootToBindingSize` | Boot size must fall within binding's size range |
| `bootToBoardWaist` | Boot size must not exceed board waist width (toe drag) |
| `discToMount` | Binding disc pattern must match board mount pattern |

Mount pattern data is inferred at normalization time by `inferMountPattern()` in `src/data/normalizer.ts`, using vendor + title + tag heuristics.

### SQLite + conf for persistence

Two separate stores serve different roles:
- **`conf`** (JSON config file) — rider profile and API key; read synchronously during React init
- **`better-sqlite3`** (SQLite) — product catalog, price history, saved setups; opened per-search and closed in a `finally` block to avoid connection leaks

### HTTP request pipeline

`RequestPipeline` in `src/data/pipeline.ts` wraps `undici.fetch()` with:
- **p-queue**: per-hostname concurrency limit (default: 2 concurrent requests)
- **p-retry**: 3 retry attempts with exponential backoff (1 s → 2 s → 4 s) on HTTP 429 and 5xx; aborts immediately on permanent 4xx

### Build system

`tsup` compiles `src/` to ESM in `dist/`. The `bin/shred-scout` shim is a plain shell script that invokes `dist/cli.js`. The package is ESM-only (`"type": "module"` in `package.json`) — all imports use `.js` extensions.

## Data model summary

```
products          ← scraped and normalized from Shopify retailers
  └─ price_observations  ← historical price snapshots
  └─ saved_setups        ← user-saved board/binding/boot combinations
rider_profile     ← single-row table mirroring the conf JSON profile
schema_versions   ← migration tracking (append-only)
```

See [CONFIGURATION.md](./CONFIGURATION.md) for full column-level schema documentation.
