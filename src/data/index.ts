/**
 * Data layer public API for Shred Scout.
 *
 * Re-exports all public symbols from the Phase 3 data layer modules.
 * Consumers should import from this barrel rather than individual files.
 */

// Retailer repository (dynamic store management) — stores live in retailer_configs +
// stores.json (see loadStores); the old hardcoded retailers.ts seed list is gone.
export type { RetailerConfig, RetailerConfigInput, RetailerRepo } from './repos/retailerRepo.js';
export { makeRetailerRepo } from './repos/retailerRepo.js';

// Storefront GraphQL API
export { fetchAllProductsGraphQL, extractStorefrontToken } from './storefront-api.js';

// Smart source (GraphQL preferred, /products.json fallback)
export { SmartShopifySource } from './smart-source.js';

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
export { makeProductRepo } from './repos/productRepo.js';
export type { PriceObservation } from './repos/priceRepo.js';
export { makePriceRepo } from './repos/priceRepo.js';
export { makeRiderRepo } from './repos/riderRepo.js';
export type { SavedSetup, SaveSetupInput } from './repos/setupRepo.js';
export { makeSetupRepo } from './repos/setupRepo.js';

// Phase 7 public exports
export type { ProductSource } from './sources.js';
export { ShopifySource } from './sources.js';
export { EvoHtmlScrapeSource, extractSpecs } from './scrapers/evo.js';
export type { EvoSpecs } from './scrapers/evo.js';
