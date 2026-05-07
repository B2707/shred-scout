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

program
  .command('watch')
  .description('Watch saved items for price drops (foreground daemon)')
  .option('--interval <minutes>', 'Poll interval in minutes', '30')
  .action(async (options: { interval: string }) => {
    const intervalMins = parseInt(options.interval, 10);
    if (isNaN(intervalMins) || intervalMins < 1) {
      console.error('--interval must be a positive integer (minutes)');
      process.exit(1);
    }
    const intervalMs = intervalMins * 60 * 1000;

    const { openDatabase } = await import('./data/db.js');
    const { makeSetupRepo } = await import('./data/repos/setupRepo.js');
    const { makePriceRepo } = await import('./data/repos/priceRepo.js');
    const { makeProductRepo } = await import('./data/repos/productRepo.js');
    const { priceDropAlert } = await import('./domain/alerts/diff.js');
    const { execFile } = await import('node:child_process');

    const db = openDatabase();
    const setupRepo = makeSetupRepo(db);
    const priceRepo = makePriceRepo(db);
    const productRepo = makeProductRepo(db);

    process.on('SIGINT', () => {
      console.log('\nWatch daemon stopped.');
      db.close();
      process.exit(0);
    });

    function timestamp(): string {
      return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    async function pollOnce(): Promise<void> {
      const allSetups = setupRepo.list();
      const watched = allSetups.filter(s => s.alertEnabled);
      console.log(`[${timestamp()}] Checking ${watched.length} watched items...`);

      for (const setup of watched) {
        const productIds = ([setup.boardId, setup.bindingId, setup.bootId] as (number | null)[])
          .filter((id): id is number => id !== null);

        for (const productId of productIds) {
          try {
            const history = priceRepo.history(productId);
            const alert = priceDropAlert(history);
            if (alert) {
              const product = productRepo.findById(productId);
              const title = product?.title ?? 'Unknown product';
              const oldDollars = (alert.previousMinCents / 100).toFixed(2);
              const newDollars = (alert.newPriceCents / 100).toFixed(2);
              const pct = Math.round((alert.dropCents / alert.previousMinCents) * 100);
              console.log(`[${timestamp()}] PRICE DROP  ${title}  $${oldDollars} -> $${newDollars}  (-${pct}%)`);

              const message = `${title}: $${oldDollars} → $${newDollars} (-${pct}%)`;
              if (process.platform === 'darwin') {
                execFile('osascript', ['-e', `display notification "${message}" with title "Shred Scout"`], () => {});
              } else if (process.platform === 'linux') {
                execFile('notify-send', ['Shred Scout', message], () => {});
              } else {
                console.log(`[PRICE DROP] ${title}: ${message}`);
              }
            }
          } catch (err) {
            console.error(`Poll error for product ${productId}:`, err);
          }
        }
      }
    }

    const initialWatched = setupRepo.list().filter(s => s.alertEnabled);
    console.log(`Shred Scout Watch — polling ${initialWatched.length} watched items every ${intervalMins} min. Ctrl+C to stop.`);

    void pollOnce().catch(console.error);
    setInterval(() => {
      void pollOnce().catch(err => console.error('Poll error:', err));
    }, intervalMs);

    // Block forever — SIGINT handler calls process.exit(0) to exit
    await new Promise<never>(() => {});
  });

// Show help when invoked with no arguments and running in a TTY.
// When stdin is not a TTY (piped), fall through to program.parseAsync() so the
// default search action fires and assertTTY() produces the expected exit(1).
if (process.argv.length <= 2 && isTTY()) {
  program.outputHelp();
  process.exit(0);
}

await program.parseAsync();
