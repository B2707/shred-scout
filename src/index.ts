/**
 * Shred Scout public API
 * Re-exports utilities for use by future phase modules.
 */
export { isTTY, assertTTY } from './lib/tty.js';

// Phase 1 public exports
export type { RiderProfile } from './types/profile.js';
export { readProfile, writeProfile } from './lib/profile.js';
