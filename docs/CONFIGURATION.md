# Configuration

Shred Scout stores configuration in two locations: a platform-appropriate config store (via `conf`) for the rider profile, and a SQLite database for product and price data.

## Config store location

The `conf` library stores a JSON config file at a platform-appropriate path:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Preferences/shred-scout/config.json` |
| Linux | `~/.config/shred-scout/config.json` (or `$XDG_CONFIG_HOME/shred-scout/config.json`) |
| Windows | `%APPDATA%\shred-scout\config.json` |

## Rider profile

The rider profile is set during the first-run onboarding wizard and stored in the config file under the `riderProfile` key. All measurements are stored in metric units.

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `bootSize` | `number` | 4.0 to 18.0 (US) | US boot size |
| `heightCm` | `number` | 120 to 250 cm | Rider height |
| `weightKg` | `number` | 30 to 200 kg | Rider weight |
| `skillLevel` | `string` | one of 3 values | Rider skill level |
| `ridingStyle` | `string` | one of 6 values | Riding style |

Valid `skillLevel` values: `beginner`, `intermediate`, `advanced`.

Valid `ridingStyle` values: `all-mountain`, `park`, `freestyle`, `powder`, `freeride`, `backcountry`.

## Database

The SQLite database is co-located with the config store:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Preferences/shred-scout/shred-scout.db` |
| Linux | `~/.config/shred-scout/shred-scout.db` (or `$XDG_CONFIG_HOME/shred-scout/shred-scout.db`) |
| Windows | `%APPDATA%\shred-scout\shred-scout.db` |

The database is created and migrated automatically on first run. WAL mode and foreign keys are enabled at open time.

### Schema

**`schema_versions`** - migration tracking

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT PK | Migration name (e.g. `001_initial`) |
| `applied_at` | INTEGER | Unix timestamp of when the migration ran |

**`products`** - scraped product catalog

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `shopify_id` | TEXT | Shopify product ID |
| `retailer` | TEXT | Retailer name (e.g. `stoked`) |
| `title` | TEXT | Product title |
| `handle` | TEXT | Shopify URL handle |
| `vendor` | TEXT | Brand name |
| `product_type` | TEXT | Shopify product type |
| `gear_category` | TEXT | Normalized category (`board`, `binding`, `boot`) |
| `waist_width_mm` | INTEGER | Board waist width in mm (boards only) |
| `mount_pattern` | TEXT | Normalized mount pattern |
| `mount_pattern_raw` | TEXT | Raw mount pattern string from retailer |
| `image_url` | TEXT | Product image URL |
| `price_cents` | INTEGER | Current price in cents |
| `variants_json` | TEXT | JSON array of variant objects |
| `fetched_at` | INTEGER | Unix timestamp of last fetch |

Unique constraint: `(shopify_id, retailer)`. Indexes on `gear_category` and `retailer`.

**`price_observations`** - historical price tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `product_id` | INTEGER FK | References `products.id` |
| `price_cents` | INTEGER | Observed price in cents |
| `observed_at` | INTEGER | Unix timestamp |

Index on `(product_id, observed_at)`.

**`saved_setups`** - user-saved gear combinations

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `board_id` | INTEGER FK | References `products.id` |
| `binding_id` | INTEGER FK | References `products.id` |
| `boot_id` | INTEGER FK | References `products.id` |
| `compatibility` | TEXT | JSON compatibility summary |
| `saved_at` | INTEGER | Unix timestamp |

**`rider_profile`** - in-database copy of rider profile

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK CHECK(id=1) | Single-row constraint |
| `boot_size` | REAL | US boot size |
| `height_cm` | REAL | Height in cm |
| `weight_kg` | REAL | Weight in kg |
| `riding_style` | TEXT | Riding style string |

## Stores

Stores are configured at runtime from `stores.json` in the project root. The file is read by `loadStores()` in `src/data/stores.ts` and seeds the retailer table in SQLite on first run. Editing `stores.json` lets you add, remove, or modify stores without touching source code.

Each entry has a `name`, a `baseUrl`, and a `type` of either `shopify` (queried via the public `products.json` endpoint) or `html` (scraped with cheerio). If `stores.json` is missing, malformed, or fails schema validation, `loadStores()` falls back to an identical set of embedded defaults so a global install keeps working.

The default `stores.json` ships with ten stores:

| Name | Base URL | Type |
|------|----------|------|
| `stoked` | `https://stokedboardshop.com` | `shopify` |
| `thirtytwo` | `https://www.thirtytwo.com` | `shopify` |
| `nidecker` | `https://www.nidecker.com` | `shopify` |
| `bataleon` | `https://www.bataleon.com` | `shopify` |
| `jones` | `https://www.jonessnowboards.com` | `shopify` |
| `nitro` | `https://www.nitrosnowboards.com` | `shopify` |
| `roxy` | `https://www.roxy.com` | `shopify` |
| `springbreak` | `https://www.springbreaksnowboards.com` | `shopify` |
| `korua` | `https://www.korua-shapes.com` | `shopify` |
| `evo` | `https://www.evo.com` | `html` |

A `stores.json` entry looks like:

```json
{
  "name": "stoked",
  "baseUrl": "https://stokedboardshop.com",
  "type": "shopify"
}
```

### Adding a store

Use the `add-store` command instead of editing the file by hand. It validates the URL, infers the `type` (the `evo.com` host and its subdomains are treated as `html`, everything else as `shopify`), persists the store to SQLite, and appends it to `stores.json` (deduplicated on `baseUrl`):

```
shred-scout add-store https://example-boardshop.com
```

The URL must use an `http` or `https` scheme. Any other scheme (such as `file:` or `data:`) is rejected and the command exits with code 1.

## HTTP pipeline defaults

The `RequestPipeline` class in `src/data/pipeline.ts` manages all outbound HTTP requests. It enforces a per-host concurrency limit plus a global minimum interval between requests to stay under per-IP rate limits. Defaults:

| Setting | Default | Description |
|---------|---------|-------------|
| `concurrency` | 1 | Max concurrent requests per hostname |
| `timeout` | 15000 ms | Per-request abort timeout |
| `retries` | 3 | Retry attempts on 5xx (backoff: 1s, 2s, 4s); a 429 aborts immediately |

## CLI

The default command is `search` (run `shred-scout` with no arguments to launch it). It renders the interactive TUI and requires a TTY, so a non-interactive environment exits with an error.

### Commands

| Command | Description |
|---------|-------------|
| `search` (default) | Launch the interactive gear-search TUI |
| `watch` | Foreground daemon that polls saved items for price drops |
| `add-store <url>` | Add a store (http/https only) to `stores.json` and SQLite |

### Options

| Option | Command | Description |
|--------|---------|-------------|
| `--demo` | `search` | Run against cached offline fixtures (`src/fixtures/demo-products.json`) with no network access |
| `--interval <minutes>` | `watch` | Price-poll interval in minutes (default: `30`) |
| `-v, --version` | top level | Print version and exit |
| `-h, --help` | top level | Show help |
