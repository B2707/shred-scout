#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  .description('Terminal UI for finding compatible snowboard gear deals')
  .version(
    `shred-scout ${pkgVersion}`,
    '-v, --version',
    'Print version and exit',
  )
  .helpOption('-h, --help', 'Show help');

program.addHelpText(
  'after',
  [
    '',
    'Getting started:',
    '  npm run setup     One-time install — enables `shred-scout` globally',
    '  shred-scout       Run after setup',
    '',
    'Without installing:',
    '  npm start         Run directly (no global install needed)',
  ].join('\n'),
);

program
  .command('search', { isDefault: true })
  .description('Search for compatible snowboard gear (interactive)')
  .option(
    '--demo',
    'Run with cached fixture data — no network or API keys required',
  )
  .action(async (options: { demo?: boolean }) => {
    assertTTY(); // Gate: only enforce TTY for interactive commands
    const { render } = await import('ink');
    const { App } = await import('./components/App.js');
    const { createElement } = await import('react');
    render(createElement(App, { isDemoMode: options.demo ?? false }));
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
    if (Number.isNaN(intervalMins) || intervalMins < 1) {
      console.error('--interval must be a positive integer (minutes)');
      process.exit(1);
    }
    const intervalMs = intervalMins * 60 * 1000;

    const { openDatabase } = await import('./data/db.js');
    const { makeSetupRepo } = await import('./data/repos/setupRepo.js');
    const { makePriceRepo } = await import('./data/repos/priceRepo.js');
    const { makeProductRepo } = await import('./data/repos/productRepo.js');
    const { makeRetailerRepo } = await import('./data/repos/retailerRepo.js');
    const { priceDropAlert } = await import('./domain/alerts/diff.js');
    const { execFile } = await import('node:child_process');
    const { fetch } = await import('undici');
    const { parsePriceCents } = await import('./data/normalizer.js');

    const db = openDatabase();
    const setupRepo = makeSetupRepo(db);
    const priceRepo = makePriceRepo(db);
    const productRepo = makeProductRepo(db);
    const retailerRepo = makeRetailerRepo(db);

    // Build retailer name → store URL lookup for price fetching
    const storeUrlByRetailer = new Map<string, string>(
      retailerRepo.all().map((r) => [r.name, r.storeUrl]),
    );

    process.on('SIGINT', () => {
      console.log('\nWatch daemon stopped.');
      db.close();
      process.exit(0);
    });

    function timestamp(): string {
      return new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    async function pollOnce(): Promise<void> {
      const allSetups = setupRepo.list();
      const watched = allSetups.filter((s) => s.alertEnabled);
      console.log(
        `[${timestamp()}] Checking ${watched.length} watched items...`,
      );

      for (const setup of watched) {
        const productIds = (
          [setup.boardId, setup.bindingId, setup.bootId] as (number | null)[]
        ).filter((id): id is number => id !== null);

        for (const productId of productIds) {
          try {
            // Fetch the current market price before comparing.
            // Uses the single-product Shopify endpoint: /products/{handle}.json
            // This is lighter than a full paginated fetch and requires no auth.
            const product = productRepo.findById(productId);
            if (product?.handle && product.retailer) {
              const storeUrl = storeUrlByRetailer.get(product.retailer);
              if (storeUrl) {
                try {
                  const res = await fetch(
                    `${storeUrl}/products/${product.handle}.json`,
                    { headers: { 'User-Agent': 'shred-scout/1.0.0' } },
                  );
                  if (res.ok) {
                    const json = (await res.json()) as {
                      product?: { variants?: Array<{ price: string }> };
                    };
                    const variants = json.product?.variants ?? [];
                    if (variants.length > 0) {
                      const currentCents = Math.min(
                        ...variants
                          .map((v) => parsePriceCents(v.price))
                          .filter((c) => c > 0),
                      );
                      if (Number.isFinite(currentCents) && currentCents > 0) {
                        priceRepo.record(productId, currentCents);
                      }
                    }
                  }
                } catch {
                  // Price fetch failed — skip this product this poll cycle
                }
              }
            }

            const history = priceRepo.history(productId);
            const alert = priceDropAlert(history);
            if (alert) {
              const product = productRepo.findById(productId);
              const title = product?.title ?? 'Unknown product';
              const oldDollars = (alert.previousMinCents / 100).toFixed(2);
              const newDollars = (alert.newPriceCents / 100).toFixed(2);
              const pct = Math.round(
                (alert.dropCents / alert.previousMinCents) * 100,
              );
              console.log(
                `[${timestamp()}] PRICE DROP  ${title}  $${oldDollars} -> $${newDollars}  (-${pct}%)`,
              );

              const message = `${title}: $${oldDollars} → $${newDollars} (-${pct}%)`;
              if (process.platform === 'darwin') {
                // Pass message as an argv item so it is never interpolated into AppleScript
                // source code. This eliminates the command-injection surface entirely —
                // osascript receives the message as a process argument, not as script text.
                execFile(
                  'osascript',
                  [
                    '-e',
                    'on run argv',
                    '-e',
                    'display notification (item 2 of argv) with title (item 1 of argv)',
                    '-e',
                    'end run',
                    '--',
                    'Shred Scout',
                    message,
                  ],
                  () => {},
                );
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

    const initialWatched = setupRepo.list().filter((s) => s.alertEnabled);
    console.log(
      `Shred Scout Watch — polling ${initialWatched.length} watched items every ${intervalMins} min. Ctrl+C to stop.`,
    );

    void pollOnce().catch(console.error);
    setInterval(() => {
      void pollOnce().catch((err) => console.error('Poll error:', err));
    }, intervalMs);

    // Block forever — SIGINT handler calls process.exit(0) to exit
    await new Promise<never>(() => {});
  });

program
  .command('add-store <url>')
  .description(
    'Add a new store URL to the search list (persists to SQLite and stores.json)',
  )
  .action(async (url: string) => {
    // Validate the URL — exits early with code 1 on invalid input (ASVS input validation)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      console.error('Invalid URL:', url);
      process.exit(1);
    }

    const host = parsedUrl.hostname.replace(/^www\./, '');
    const name = host.split('.')[0] || host;
    const type: 'shopify' | 'html' = host.includes('evo.com')
      ? 'html'
      : 'shopify';

    const { openDatabase } = await import('./data/db.js');
    const { makeRetailerRepo } = await import('./data/repos/retailerRepo.js');
    const { syncStoreToJson } = await import('./data/stores.js');

    const db = openDatabase();
    const retailerRepo = makeRetailerRepo(db);

    retailerRepo.add({ name, storeUrl: url, storefrontToken: null });
    await syncStoreToJson({ name, baseUrl: url, type });

    console.log(`Added ${name} (${url}) [type=${type}] to store list.`);
    db.close();
  });

// Show help when invoked with no arguments and running in a TTY.
// When stdin is not a TTY (piped), fall through to program.parseAsync() so the
// default search action fires and assertTTY() produces the expected exit(1).
if (process.argv.length <= 2 && isTTY()) {
  program.outputHelp();
  process.exit(0);
}

// Note: parseAsync() never resolves for the interactive `search`/`watch`
// commands — their actions return a never-resolving promise to hold the process
// open for Ink. Using a top-level `await` here would make Node emit an
// "unsettled top-level await" warning (which also leaks into demo recordings).
// Attaching a rejection handler instead lets the module finish evaluating with
// no warning; Ink keeps the event loop alive, and `q` exits via process.exit(0).
program.parseAsync().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
