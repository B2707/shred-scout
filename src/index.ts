/**
 * Shred Scout public API
 * Re-exports utilities for use by future phase modules.
 */
export { isTTY, assertTTY } from './lib/tty.js';

// Phase 1 public exports
export type { RiderProfile } from './types/profile.js';
export { readProfile, writeProfile } from './lib/profile.js';

// Phase 2 public exports
export type { GearSetup, Board, Binding, Boot, RuleResult, MountPattern, Verdict } from './domain/compatibility/types.js';
export { runRules } from './domain/compatibility/engine.js';
export { flexPairing } from './domain/compatibility/flex-pairing.js';

// Phase 3 public exports
export type { NormalizedProduct } from './data/normalizer.js';
export { RETAILERS } from './data/retailers.js';
export { RequestPipeline } from './data/pipeline.js';
export { fetchAllProducts } from './data/shopify.js';
export { openDatabase } from './data/db.js';
export { makeRiderRepo } from './data/repos/riderRepo.js';
export { makeSetupRepo } from './data/repos/setupRepo.js';
export { makePriceRepo } from './data/repos/priceRepo.js';
