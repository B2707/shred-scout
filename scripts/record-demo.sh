#!/usr/bin/env bash
#
# record-demo.sh - helpers for producing docs/demo.gif.
#
# The wizard/result PRODUCT IMAGES use the iTerm2 / Kitty inline-image protocol,
# which only renders in those terminals and CANNOT be captured by terminal
# recorders - asciinema, agg and vhs all fall back to chafa block-art. So the demo
# GIF must be made by SCREEN-RECORDING a real iTerm2 or Kitty window.
#
# Usage:
#   scripts/record-demo.sh            Build, then print the recording steps.
#   scripts/record-demo.sh <in.mov>   Convert a screen recording to docs/demo.gif.
#
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -eq 0 ]; then
  npm run build
  cat <<'STEPS'

To record the demo (real product images need iTerm2 or Kitty):

  1. Open iTerm2 (https://iterm2.com) or Kitty; size it to roughly 100x40.
  2. Run:  node dist/cli.js --demo
  3. Screen-record the window with Kap (https://getkap.co) or QuickTime,
     walking the wizard through to the results screen, then press q.
  4. Convert the recording:  scripts/record-demo.sh ~/path/to/recording.mov

STEPS
  exit 0
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg not found - install it (brew install ffmpeg)"; exit 1; }
IN="$1"
[ -f "$IN" ] || { echo "no such file: $IN"; exit 1; }
PALETTE="$(mktemp -t demo-palette).png"
FPS=15
WIDTH=900
ffmpeg -y -i "$IN" -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff" "$PALETTE"
ffmpeg -y -i "$IN" -i "$PALETTE" \
  -lavfi "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer" \
  docs/demo.gif
rm -f "$PALETTE"
echo "Wrote docs/demo.gif ($(du -h docs/demo.gif | cut -f1))"
