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

program.addHelpText('after', [
  '',
  'Getting started:',
  '  npm run setup     One-time install — enables `shred-scout` globally',
  '  shred-scout       Run after setup',
  '',
  'Without installing:',
  '  npm start         Run directly (no global install needed)',
].join('\n'));

program
  .command('search', { isDefault: true })
  .description('Search for compatible snowboard gear (interactive)')
  .action(async () => {
    assertTTY(); // Gate: only enforce TTY for interactive commands
    const { render } = await import('ink');
    const { App } = await import('./components/App.js');
    const { createElement } = await import('react');
    render(createElement(App, null));
    // waitUntilExit() resolves prematurely with React 19 + Ink 6 — rely on
    // process.exit(0) from the global 'q' useInput handler to terminate instead.
    await new Promise<never>(() => {});
  });

// Show help when invoked with no arguments and running in a TTY.
// When stdin is not a TTY (piped), fall through to program.parse() so the
// default search action fires and assertTTY() produces the expected exit(1).
if (process.argv.length <= 2 && isTTY()) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
