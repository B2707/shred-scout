/**
 * Resolves bundled image asset filenames to an absolute path at runtime.
 *
 * Assets live in src/fixtures/assets and are copied to dist/assets by tsup's publicDir.
 * Because the build bundles to a flat dist/cli.js, import.meta.url points at dist/ at
 * runtime and at src/lib during dev/test — so we try both layouts.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Returns an absolute path to a bundled asset (e.g. 'profile-camber.png'). */
export function resolveAssetPath(filename: string): string {
  const candidates = [
    join(here, 'assets', filename), // bundled: dist/assets
    join(here, '..', 'fixtures', 'assets', filename), // dev: src/lib -> src/fixtures/assets
    join(here, '..', '..', 'src', 'fixtures', 'assets', filename), // dist -> repo/src/fixtures/assets
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}
