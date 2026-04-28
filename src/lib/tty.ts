/**
 * TTY detection utility for Shred Scout.
 *
 * Checks both process.stdin.isTTY and process.stdout.isTTY because:
 * - stdin must be TTY for Ink raw-mode keyboard input
 * - stdout must be TTY for ANSI escape sequence rendering (piped stdout crashes Ink)
 *
 * @see https://github.com/vadimdemedes/ink/issues/166
 */

/**
 * Returns true only when both stdin and stdout are real TTYs.
 * Use before mounting any Ink component or calling raw-mode input.
 */
export function isTTY(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}

/**
 * Asserts that the current process has an interactive terminal.
 * Writes an error to stderr and exits with code 1 if not.
 *
 * Does NOT call process.exit() when isTTY() is true.
 * Should only be called from interactive command actions, never from --version or --help.
 */
export function assertTTY(): void {
  if (!isTTY()) {
    process.stderr.write('Error: shred-scout requires an interactive terminal\n');
    process.exit(1);
  }
}
