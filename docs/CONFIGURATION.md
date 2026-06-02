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
| `bootSize` | `number` | 4.0 – 18.0 (US) | US boot size |
| `heightCm` | `number` | 120 – 250 cm | Rider height |
| `weightKg` | `number` | 30 – 200 kg | Rider weight |
| `ridingStyle` | `string` | one of 5 values | Riding style |

Valid `ridingStyle` values: `all-mountain`, `freestyle`, `freeride`, `backcountry`, `beginner`.

## Database

The SQLite database is co-located with the config store:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Preferences/shred-scout/shred-scout.db` |
| Linux | `~/.config/shred-scout/shred-scout.db` (or `$XDG_CONFIG_HOME/shred-scout/shred-scout.db`) |
| Windows | `%APPDATA%\shred-scout\shred-scout.db` |

The database is created and migrated automatically on first run. WAL mode and foreign keys are enabled at open time.

### Schema

**`schema_versions`** — migration tracking

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT PK | Migration name (e.g. `001_initial`) |
| `applied_at` | INTEGER | Unix timestamp of when the migration ran |

**`products`** — scraped product catalog

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

**`price_observations`** — historical price tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `product_id` | INTEGER FK | References `products.id` |
| `price_cents` | INTEGER | Observed price in cents |
| `observed_at` | INTEGER | Unix timestamp |

Index on `(product_id, observed_at)`.

**`saved_setups`** — user-saved gear combinations

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `board_id` | INTEGER FK | References `products.id` |
| `binding_id` | INTEGER FK | References `products.id` |
| `boot_id` | INTEGER FK | References `products.id` |
| `compatibility` | TEXT | JSON compatibility summary |
| `saved_at` | INTEGER | Unix timestamp |

**`rider_profile`** — in-database copy of rider profile

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK CHECK(id=1) | Single-row constraint |
| `boot_size` | REAL | US boot size |
| `height_cm` | REAL | Height in cm |
| `weight_kg` | REAL | Weight in kg |
| `riding_style` | TEXT | Riding style string |

## Retailers

Retailers are configured as a static constant in `src/data/retailers.ts`. No runtime configuration is needed — the list is hardcoded to stores with confirmed public `products.json` endpoints.

| Name | Base URL |
|------|----------|
| `stoked` | `https://stokedboardshop.com` |
| `thirtytwo` | `https://www.thirtytwo.com` |
| `nidecker` | `https://www.nidecker.com` |

## HTTP pipeline defaults

The `RequestPipeline` class in `src/data/pipeline.ts` manages all outbound HTTP requests. Defaults:

| Setting | Default | Description |
|---------|---------|-------------|
| `concurrency` | 2 | Max concurrent requests per hostname |
| `timeout` | 15 000 ms | Per-request abort timeout |
| `retries` | 3 | Retry attempts on 429 / 5xx (backoff: 1 s → 2 s → 4 s) |

## CLI flags

| Flag | Description |
|------|-------------|
| `-v, --version` | Print version and exit |
| `-h, --help` | Show help |

The default (and only) command is `search`, which launches the interactive TUI. It requires a TTY — running in a non-interactive environment exits with an error.
