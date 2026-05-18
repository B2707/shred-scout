#!/usr/bin/env node
/**
 * Best-effort postinstall script — installs chafa for terminal image fallback.
 *
 * Always exits with code 0 so `npm install` is never blocked.
 * chafa enables image rendering in terminals that don't support inline graphics
 * (iTerm2 / Kitty), using colored ASCII art as a fallback.
 */
import { execSync } from 'node:child_process';

function hasChafa() {
  try {
    execSync('which chafa', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (hasChafa()) {
  // Already installed — nothing to do
  process.exit(0);
}

console.log('[shred-scout] Installing chafa for terminal image fallback...');

try {
  if (process.platform === 'darwin') {
    execSync('brew install chafa', { stdio: 'inherit', timeout: 30000 });
  } else if (process.platform === 'linux') {
    execSync('apt-get install -y chafa', { stdio: 'inherit', timeout: 30000 });
  } else {
    console.log('[shred-scout] chafa not available for this platform — image fallback will use text cards.');
    console.log('[shred-scout] Install manually if supported: https://hpjansson.org/chafa/');
  }
} catch {
  console.log('[shred-scout] chafa auto-install failed — image fallback will use text cards. Install manually: brew install chafa (macOS) or apt-get install chafa (Linux)');
}

process.exit(0);
