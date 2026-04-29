/**
 * Data layer public API for Shred Scout.
 *
 * Re-exports all public symbols from the Phase 3 data layer modules.
 * Consumers should import from this barrel rather than individual files.
 */

// Retailer configuration
export type { Retailer } from './retailers.js';
export { RETAILERS } from './retailers.js';

// HTTP request pipeline
export type { RequestPipelineOptions } from './pipeline.js';
export { RequestPipeline } from './pipeline.js';

// Shopify scraper
export type { ShopifyProduct, ShopifyVariant } from './shopify.js';
export { fetchAllProducts, normalizeTags } from './shopify.js';

// Product normalizer
export type { NormalizedProduct, GearCategory, MountPatternResult, ShopifyProductInput } from './normalizer.js';
export { normalizeProduct, detectGearCategory, inferMountPattern, parsePriceCents } from './normalizer.js';

// Database
export { openDatabase } from './db.js';

// Repositories
export type { PriceObservation } from './repos/priceRepo.js';
export { makePriceRepo } from './repos/priceRepo.js';
export { makeRiderRepo } from './repos/riderRepo.js';
export type { SavedSetup, SaveSetupInput } from './repos/setupRepo.js';
export { makeSetupRepo } from './repos/setupRepo.js';
