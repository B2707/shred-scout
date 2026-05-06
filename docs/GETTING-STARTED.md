<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide walks through installing Shred Scout, completing the first-run profile wizard, running your first search, and solving common setup issues.

See [README.md](../README.md) for a project overview and [docs/ARCHITECTURE.md](ARCHITECTURE.md) for the system design.

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | `>=20.19.0` |
| npm | included with Node.js |

Shred Scout is ESM-only. CommonJS environments are not supported.

Confirm your Node.js version before proceeding:

```bash
node --version
```

If the version is below `20.19.0`, install a newer release from [nodejs.org](https://nodejs.org) or via a version manager such as `nvm` or `fnm`.

Shred Scout requires an interactive terminal (a real TTY). It will not run inside piped commands, CI runners, or non-interactive shells. See [Troubleshooting](#troubleshooting) below.

## Installation

### Option 1 — Global install (recommended)

Builds the project and links the `shred-scout` binary system-wide so you can run it from any directory.

```bash
git clone <repo-url> shred-scout
cd shred-scout
npm install
npm run setup
```

`npm run setup` runs `npm run build && npm link`. After it completes, the `shred-scout` command is available globally:

```bash
shred-scout
```

### Option 2 — Run directly without installing

If you do not want to install globally, run the pre-built binary directly from the project directory:

```bash
cd shred-scout
npm install
npm run build
npm start
```

`npm start` executes `node bin/shred-scout search` — the same entry point used by the global binary, without requiring `npm link`.

> Note: `bin/shred-scout` requires `dist/cli.js` to exist. Always run `npm run build` (or `npm run setup`) before `npm start`. If you see `Error: shred-scout is not built. Run npm run build first.`, the build step was skipped.

## First run — profile wizard

On the very first launch, Shred Scout has no saved profile and opens the **Profile Setup wizard** automatically. The wizard walks through four steps in sequence.

### Step 1 — Boot size

```
Shred Scout — Profile Setup (1/4)

What is your boot size?
US mens size (e.g. 10.5)
> _
```

Enter your US mens boot size as a number between `4.0` and `18.0`. Half sizes are accepted (e.g. `10.5`). Press Enter to continue.

### Step 2 — Height

```
Shred Scout — Profile Setup (2/4)

How tall are you?
e.g. 5'10" or 178cm
> _
```

Enter your height in feet and inches (e.g. `5'10"`) or as a bare centimetre value (e.g. `178`). Valid range: `4'0"` to `8'2"`.

### Step 3 — Weight

```
Shred Scout — Profile Setup (3/4)

How much do you weigh?
e.g. 165 lbs
> _
```

Enter your weight in pounds (e.g. `165`). Valid range: 66 – 440 lbs.

### Step 4 — Riding style

```
Shred Scout — Profile Setup (4/4)

What is your riding style?
> All-Mountain
  Freestyle
  Freeride
  Backcountry
  Beginner
```

Use the arrow keys to highlight your riding style, then press Enter. The five options are:

| Option | Value stored |
|--------|--------------|
| All-Mountain | `all-mountain` |
| Freestyle | `freestyle` |
| Freeride | `freeride` |
| Backcountry | `backcountry` |
| Beginner | `beginner` |

After step 4 the wizard saves your profile and transitions directly to the search screen. The profile is stored in a platform-appropriate config file:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Preferences/shred-scout/config.json` |
| Linux | `~/.config/shred-scout/config.json` |

On subsequent launches the wizard is skipped and the search screen opens immediately.

## First search

After the wizard completes (or on subsequent runs), the search screen appears:

```
 Boot: 10.5  Height: 178cm  Weight: 75kg  Style: all-mountain

Search for gear... _
```

Type a search term and press Enter. Shred Scout queries Stoked Board Shop, ThirtyTwo, and Nidecker concurrently via their public Shopify `products.json` endpoints.

```
Search for gear... capita board
```

While results load, the prompt is replaced with `Searching...`. Results render as cards once all retailers have responded. When the same product is found at multiple retailers, Shred Scout groups them side-by-side and highlights the best price.

There are no required API keys. The search pipeline scrapes public Shopify endpoints directly — no Anthropic API key or external service account is needed.

## Quitting

Press `q` at any time to exit. The `q` key is active globally — it works from both the wizard and the search screen.

```
q    ← exits immediately
```

There is no confirmation prompt. The process exits cleanly with code `0`.

## Troubleshooting

### "Error: shred-scout requires an interactive terminal"

Shred Scout checks that both `stdin` and `stdout` are connected to a real TTY before starting. This error appears when:

- Running inside a shell that pipes stdin or stdout (e.g. `shred-scout | less`, `echo "" | shred-scout`)
- Running in a CI/CD environment
- Running in a terminal emulator that does not allocate a PTY

**Fix:** Run `shred-scout` directly in a local terminal emulator (iTerm2, Terminal.app, Kitty, Alacritty, etc.) without any pipe operators.

### "Error: shred-scout is not built. Run `npm run build` first."

The `dist/cli.js` file does not exist. The `bin/shred-scout` shim requires a compiled build.

**Fix:**

```bash
npm run build
```

Then retry `npm start` or `shred-scout`.

### Blank screen or no output after launch

This can happen in terminals that do not support ANSI escape sequences or when `stdout` is redirected.

**Fix:** Use a modern terminal emulator (iTerm2, Kitty, Alacritty, Windows Terminal). Verify your `TERM` environment variable is set to a value such as `xterm-256color`.

### Product images do not appear

Inline product images are only rendered in terminals that support the iTerm2 or Kitty image protocols. In all other terminals the image area is omitted silently — this is expected behaviour.

- **iTerm2:** images render automatically when `TERM_PROGRAM=iTerm.app`
- **Kitty:** images render automatically when `KITTY_WINDOW_ID` is set
- All other terminals: text-only display

### Wrong Node.js version

If you see syntax errors or ESM import failures, your Node.js version is likely below `20.19.0`.

**Fix:**

```bash
node --version   # confirm current version
nvm install 20   # if using nvm
nvm use 20
```

## Next steps

- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — how the search pipeline, scraper, and Ink UI fit together
- [docs/CONFIGURATION.md](CONFIGURATION.md) — config file location, profile schema, and SQLite database path
