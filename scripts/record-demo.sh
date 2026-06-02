#!/usr/bin/env bash
#
# record-demo.sh — regenerate docs/demo.gif from the `--demo` walkthrough.
#
# The demo boots straight into the guided gear wizard, so this is an INTERACTIVE
# recording: run it in a real terminal, drive the wizard yourself (arrow keys +
# enter) through to the results screen, then press `q` to quit — that ends the
# recording.
#
# Requirements: asciinema + agg   (e.g. `brew install asciinema agg`)
#
# NOTE on inline product images:
#   asciinema + agg render TEXT ONLY — they cannot capture the iTerm2/Kitty inline
#   images shown next to each wizard option and result card. For a GIF that shows
#   those images, screen-record an iTerm2 or Kitty window instead (e.g. Kap,
#   https://getkap.co) and export to GIF. Size the window to ~100x30 for parity.
#
set -euo pipefail

cd "$(dirname "$0")/.."

command -v asciinema >/dev/null || { echo "asciinema not found — install it (brew install asciinema)"; exit 1; }
command -v agg >/dev/null       || { echo "agg not found — install it (brew install agg)"; exit 1; }

npm run build

echo "Recording — walk the wizard to the results screen, then press 'q' to finish."
asciinema rec --overwrite -c "node dist/cli.js --demo" docs/demo.cast

agg docs/demo.cast docs/demo.gif
echo "Wrote docs/demo.cast and docs/demo.gif"
