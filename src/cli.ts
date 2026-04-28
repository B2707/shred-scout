#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { assertTTY, isTTY } from './lib/tty.js';

// ESM equivalent of __dirname (no __dirname in ESM scope)
const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json at runtime so --version stays in sync
let pkgVersion = '0.0.0';
try {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf-8'),
  ) as { version: string };
  pkgVersion = pkg.version;
} catch {
  // package.json unreadable — fall back to placeholder
}

const program = new Command();

program
  .name('shred-scout')
  .description('Agentic terminal UI for finding compatible snowboard gear deals')
  .version(`shred-scout ${pkgVersion}`, '-v, --version', 'Print version and exit')
  .helpOption('-h, --help', 'Show help');

program
  .command('search', { isDefault: true })
  .description('Search for compatible snowboard gear (interactive)')
  .action(() => {
    assertTTY(); // Gate: only enforce TTY for interactive commands
    // Phase 1+: mount Ink app here
    process.stdout.write('Interactive search coming in Phase 1\n');
  });

// Show help when invoked with no arguments and running in a TTY.
// When stdin is not a TTY (piped), fall through to program.parse() so the
// default search action fires and assertTTY() produces the expected exit(1).
if (process.argv.length <= 2 && isTTY()) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
