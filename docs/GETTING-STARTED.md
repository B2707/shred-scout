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

### Option 1 - Global install (recommended)

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

### Option 2 - Run directly without installing

If you do not want to install globally, run the pre-built binary directly from the project directory:

```bash
cd shred-scout
npm install
npm run build
npm start
```

`npm start` executes `node bin/shred-scout search`, the same entry point used by the global binary, without requiring `npm link`.

> Note: `bin/shred-scout` requires `dist/cli.js` to exist. Always run `npm run build` (or `npm run setup`) before `npm start`. If you see `Error: shred-scout is not built. Run npm run build first.`, the build step was skipped.

## First run - guided setup

On the very first launch, Shred Scout has no saved profile and opens the **Guided Setup** automatically. It is a single linear flow that collects your rider facts and what you want to shop for, one question per step:

`boot size` -> `height` -> `weight` -> `skill level` -> `riding style` -> `what are you shopping for` -> `board profile` (conditional) -> `confirm`

A progress bar at the top of the framed card tracks your position (`Step N of M`). The board-profile step only appears when your shopping choice involves a board, so the total step count is 7 or 8.

### Step 1 - Boot size

```
Shred Scout · Guided Setup
Step 1 of 8  ▰▱▱▱▱▱▱▱

What is your boot size?
US mens size (e.g. 10.5)
> _
```

Enter your US mens boot size as a number between `4.0` and `18.0`. Half sizes are accepted (e.g. `10.5`). Press Enter to continue.

### Step 2 - Height

```
How tall are you?
e.g. 5'10" or 178cm
> _
```

Enter your height in feet and inches (e.g. `5'10"`) or as a bare centimetre value (e.g. `178`). Valid range: `4'0"` to `8'2"`.

### Step 3 - Weight

```
How much do you weigh?
e.g. 165 lbs
> _
```

Enter your weight in pounds (e.g. `165`). Valid range: 66 to 440 lbs.

### Step 4 - Skill level

```
What's your skill level?
> Beginner
  Intermediate
  Advanced
```

Use the arrow keys to highlight your skill level, then press Enter. Each option shows a small thumbnail alongside it. The three levels are:

| Option | Value stored |
|--------|--------------|
| Beginner | `beginner` |
| Intermediate | `intermediate` |
| Advanced | `advanced` |

### Step 5 - Riding style

```
How do you like to ride?
> All-Mountain
  Park
  Freestyle
  Powder
  Freeride
  Backcountry
```

Arrow keys to highlight, Enter to confirm. The six riding styles are:

| Option | Value stored |
|--------|--------------|
| All-Mountain | `all-mountain` |
| Park | `park` |
| Freestyle | `freestyle` |
| Powder | `powder` |
| Freeride | `freeride` |
| Backcountry | `backcountry` |

### Step 6 - What are you shopping for

```
What are you shopping for?
> Snowboard
  Bindings
  Boots
  Full Setup
```

This step decides where you land once setup completes:

- **Snowboard**, **Bindings**, or **Boots** opens the **results list** (a scrollable feed of product cards filtered to that category).
- **Full Setup** opens the **setup builder**: a pinned "YOUR SETUP" tray (board / binding / boot) above a live candidate list where every row carries a real compatibility badge computed by the deterministic engine. Badges check boot-to-binding sizing, board-to-binding disc/mount pattern, board waist clearance, board length versus your height and weight, and flex pairing, then mark each candidate pass, warn, fail, or unverified.

### Step 7 - Board profile (conditional)

```
Pick a board profile
> Camber
  Rocker
  Hybrid
  Flat
```

This step appears only when you chose **Snowboard** or **Full Setup**. Choosing bindings or boots alone skips it.

### Final step - Confirm

```
Ready to search?
Boot size     US 10.5
Height        178cm
Weight        75kg
Skill         Advanced
Riding style  All-Mountain
Looking for   Full Setup
Board profile Camber

Press ↵ to find your gear.
```

The confirm card summarises every answer. Press Enter to save your profile and continue. The profile is stored in a platform-appropriate config file:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Preferences/shred-scout/config.json` |
| Linux | `~/.config/shred-scout/config.json` |

### Returning riders

On subsequent launches the saved profile pre-fills every rider-fact step rather than skipping them, so nothing silently disappears and each value stays editable. Press `Tab` at any step to fast-path ahead; the shortcut stops at the "what are you shopping for" step until you pick a category, then jumps straight to confirm.

## First search

After the wizard completes (or on subsequent runs), the search screen appears:

```
 Boot: 10.5  Height: 178cm  Weight: 75kg  Style: all-mountain

Search for gear... _
```

Type a search term and press Enter. Shred Scout queries the configured Shopify stores (from `stores.json`) concurrently via their public `products.json` endpoints, alongside an evo.com scraper.

```
Search for gear... capita board
```

While results load, the prompt is replaced with `Searching...`. Results render as cards once all retailers have responded. When the same product is found at multiple retailers, Shred Scout groups them side-by-side and highlights the best price.

There are no required API keys. The search pipeline scrapes public Shopify endpoints directly, so no external service account is needed.

## Quitting

Press `q` at any time to exit. The `q` key is active globally, so it works from both the wizard and the search screen.

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

Inline product images are only rendered in terminals that support the iTerm2 or Kitty image protocols. In all other terminals the image area is omitted silently, which is expected behaviour.

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

- [docs/ARCHITECTURE.md](ARCHITECTURE.md) - how the search pipeline, scraper, and Ink UI fit together
- [docs/CONFIGURATION.md](CONFIGURATION.md) - config file location, profile schema, and SQLite database path
