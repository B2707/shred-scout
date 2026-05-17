# Shred Scout

Agentic terminal UI for finding compatible snowboard gear deals across multiple retailers.

<!-- demo.gif will be added after recording — run `npm run demo` to try locally -->

## Install

```bash
# Global install
npm install -g shred-scout
shred-scout

# Or run without installing
npx shred-scout
```

## Requirements

- Node.js 20.19+ (LTS)
- macOS or Linux (Windows not yet supported)

## First Run

On first launch, the onboarding wizard prompts for boot size, height, weight, and riding style. Your profile is saved locally and reloaded automatically on subsequent launches — no account or API keys required.

## Demo Mode

```bash
# After global install:
shred-scout --demo

# Or without installing:
npm run demo
```

Runs the full search → compatibility → results flow against cached fixture data. No API keys, no live network connection, and no prior setup required. Fixture products include boards, bindings, and boots across simulated retailers, with sale items and cross-retailer comparison pairs pre-populated.

## Recording

<!-- asciicast badge and demo.cast will be added after recording -->

<!-- The recording will show the complete demo mode flow: search query → compatibility scoring → results list with spec data → wishlist → quit. -->

## How It Works

Shred Scout queries Shopify retailers via their public `/products.json` endpoints, paginating through all available products. For evo.com, it scrapes listing pages and product detail pages with Cheerio + undici to extract spec data such as waist width and flex rating. A compatibility rules engine scores each product against your rider profile (boot size, height, weight, riding style), and results are displayed in a terminal UI with inline image rendering and scraped spec lines for evo.com products.

## Tech Stack

| Technology | Role |
|---|---|
| TypeScript | Language — strict mode throughout |
| Ink 6 (React for terminal) | TUI rendering — React component model in the terminal |
| React 19.1.0 | Ink 6 peer dependency (pinned via overrides) |
| better-sqlite3 | Local product and price history storage |
| undici | Fast concurrent HTTP for Shopify pagination and HTML scraping |
| cheerio | HTML parsing for evo.com listing and PDP pages |
| tsup | ESM bundle builder |
| vitest | Unit and integration tests (244 passing) |
| Biome | Linting and formatting |

> TypeScript + React signals alignment with Shopify's frontend stack.

## License

MIT
