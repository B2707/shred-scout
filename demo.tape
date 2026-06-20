# demo.tape - auto-generates docs/demo.gif via `vhs demo.tape`.
# Drives the demo flow: guided onboarding -> Full Setup builder (live
# compatibility badges) -> save -> summary. Concept and option art render as
# chafa block art, which vhs captures (only the high-res ProductDetail photos
# use the iTerm2/Kitty protocol, and the demo flow does not open that view).
#
# Pacing notes: image-select steps render chafa thumbnails asynchronously and a
# keypress that lands during a redraw is dropped. So each meaningful key on an
# image step is preceded by a generous Sleep and a no-op "wake" key (Right is
# unhandled by the wizard/builder, so it never moves anything). "Full Setup" is
# the last category option, so a single Up (wrap-around) selects it.
Output docs/demo.gif

Set Shell "zsh"
Set FontSize 15
Set Width 1180
Set Height 760
Set Padding 18
Set Theme "Catppuccin Mocha"
Set PlaybackSpeed 1.6

Hide
Type "export PATH=/opt/homebrew/bin:$PATH && clear"
Enter
Type "node dist/cli.js --demo"
Enter
Sleep 4s
Show

# Returning rider: Tab fast-paths to the one unanswered choice (what to shop for).
Sleep 2.4s
Tab
Sleep 5s

# Wake, then a single Up wraps to "Full Setup", then select it. The long settle
# above lets all four chafa thumbnails finish so the Up is not dropped mid-render.
Right
Sleep 1.4s
Up
Sleep 2.4s
Enter

# Board profile step: wake, keep Camber.
Sleep 4.5s
Right
Sleep 1.4s
Enter

# Confirm (text step), then enter the setup builder.
Sleep 2s
Enter
Sleep 4s
Screenshot "/tmp/gifframes/f_builder.png"

# Setup builder: browse boards with live fit badges, then pick the top board.
Right
Sleep 1s
Down
Sleep 1.3s
Down
Sleep 1.3s
Up
Sleep 1.1s
Enter
Sleep 2.4s

# Each pick auto-advances board -> binding -> boot. A freshly active slot can
# swallow the next keypress, so send several Enters; an extra pick on a filled
# boot slot just re-selects the same boot (harmless).
Enter
Sleep 2.2s
Enter
Sleep 2.2s
Enter
Sleep 2.2s
Enter
Sleep 2.4s
Screenshot "/tmp/gifframes/f_complete.png"

# Save the complete setup, then view the summary.
Type "S"
Sleep 3.4s
Screenshot "/tmp/gifframes/f_summary.png"

Type "q"
Sleep 1.5s
