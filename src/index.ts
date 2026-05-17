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

// Phase 3 public exports
export type { NormalizedProduct } from './data/normalizer.js';
export { DEFAULT_RETAILERS } from './data/retailers.js';
export { SmartShopifySource } from './data/smart-source.js';
export { fetchAllProductsGraphQL, extractStorefrontToken } from './data/storefront-api.js';
export type { RetailerConfig, RetailerConfigInput, RetailerRepo } from './data/repos/retailerRepo.js';
export { makeRetailerRepo } from './data/repos/retailerRepo.js';
export { RequestPipeline } from './data/pipeline.js';
export { fetchAllProducts } from './data/shopify.js';
export { openDatabase } from './data/db.js';
export { makeRiderRepo } from './data/repos/riderRepo.js';
export { makeSetupRepo } from './data/repos/setupRepo.js';
export { makePriceRepo } from './data/repos/priceRepo.js';

// Phase 4 public exports
export type { FilterSpec } from './agent/filter-spec.js';
export { applyFilterSpec } from './agent/filter-spec.js';

// Phase 6: Price alerts domain
export type { PriceDropAlert } from './domain/alerts/diff.js';
export { priceDropAlert } from './domain/alerts/diff.js';

// Phase 7 public exports
export type { ProductSource } from './data/sources.js';
export { ShopifySource } from './data/sources.js';
export { EvoHtmlScrapeSource, extractSpecs } from './data/scrapers/evo.js';
export type { EvoSpecs } from './data/scrapers/evo.js';
export type { RunSearchOptions } from './agent/search-pipeline.js';

// Phase 8 public exports
export { flexAdvisory } from './domain/compatibility/flex-advisory.js';
export { runSearch } from './agent/search-pipeline.js';
