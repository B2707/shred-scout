/**
 * evo.com HTML scraper for Shred Scout.
 *
 * EvoHtmlScrapeSource implements ProductSource — fetches the evo.com snowboard
 * listing page, extracts product URLs, then concurrently fetches PDPs via
 * RequestPipeline to extract waist_width_mm and flex_rating using Cheerio.
 *
 * CSS selectors are co-located here. Verify against live evo.com before each release.
 * Source: github.com/johnwdunn20/ScrapingEvo (2024-03-08). May have changed.
 *
 * Cloudflare note: evo.com uses Cloudflare WAF. If blocked, fetchAll() throws
 * and the error surfaces in runSearch()'s errors[] — Shopify sources continue unaffected.
 */
import * as cheerio from 'cheerio';
import type { MountPattern } from '../../domain/compatibility/types.js';
import type { GearCategory, NormalizedProduct } from '../normalizer.js';
import type { RequestPipeline } from '../pipeline.js';
import type { ProductSource } from '../sources.js';

// --- CSS Selectors (verify on each release against live evo.com) ---
const LISTING_URL = 'https://www.evo.com/snowboards';
const ALT_LISTING_URL = 'https://www.evo.com/shop/snowboard/snowboards';
const PRODUCT_THUMB_SELECTOR = 'div.product-thumb-details';
const SPEC_TITLE_SELECTOR = 'span.pdp-spec-list-title';
const SPEC_DESC_SELECTOR = 'span.pdp-spec-list-description';
const FEATURE_LABEL_SELECTOR = 'div.pdp-feature h5';
const FEATURE_DESC_SELECTOR = 'div.pdp-feature div.pdp-feature-description';

/** Parsed spec fields extracted from an evo.com PDP. */
export interface EvoSpecs {
  waist_width_mm: number | null;
  flex_rating: string | null;
  mount_pattern_raw: string | null;
}

/**
 * Extracts snowboard specs from evo.com PDP HTML.
 * Pure function — accepts raw HTML string, returns spec fields.
 * Exported for direct unit testing without HTTP.
 */
export function extractSpecs(html: string): EvoSpecs {
  const $ = cheerio.load(html);
  const specs: EvoSpecs = {
    waist_width_mm: null,
    flex_rating: null,
    mount_pattern_raw: null,
  };

  // Try spec list (parallel title/desc arrays)
  const titles = $(SPEC_TITLE_SELECTOR).toArray();
  const descs = $(SPEC_DESC_SELECTOR).toArray();
  titles.forEach((titleEl, i) => {
    const key = $(titleEl).text().trim().toLowerCase();
    const val = descs[i] ? $(descs[i]).text().trim() : '';
    if (!key || !val) return;
    if (key.includes('waist width')) {
      specs.waist_width_mm = parseWaistWidth(val);
    } else if (key === 'flex' || key === 'flex rating') {
      specs.flex_rating = val;
    } else if (key.includes('mounting') || key.includes('binding mount')) {
      specs.mount_pattern_raw = val;
    }
  });

  // Try feature blocks (pdp-feature) as fallback
  const featureLabels = $(FEATURE_LABEL_SELECTOR).toArray();
  const featureDescs = $(FEATURE_DESC_SELECTOR).toArray();
  featureLabels.forEach((labelEl, i) => {
    const key = $(labelEl).text().trim().toLowerCase();
    const val = featureDescs[i] ? $(featureDescs[i]).text().trim() : '';
    if (!key || !val) return;
    if ((key === 'flex' || key.includes('flex rating')) && !specs.flex_rating) {
      specs.flex_rating = val;
    }
  });

  return specs;
}

/** Parses waist width from text like "254mm", "254 mm", "10.0 in", "10.0in". */
function parseWaistWidth(value: string): number | null {
  const mmMatch = value.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mmMatch) return Math.round(parseFloat(mmMatch[1]));
  const inMatch = value.match(/(\d+(?:\.\d+)?)\s*in/i);
  if (inMatch) return Math.round(parseFloat(inMatch[1]) * 25.4);
  return null;
}

/** Builds a NormalizedProduct from a PDP URL, extracted specs, and Cheerio root. */
function buildNormalizedProduct(
  pdpUrl: string,
  specs: EvoSpecs,
  $: ReturnType<typeof cheerio.load>,
): NormalizedProduct {
  // Extract handle from URL path — last path segment before any query string
  const pathSegments = pdpUrl.replace(/\?.*$/, '').split('/').filter(Boolean);
  const handle = pathSegments[pathSegments.length - 1] ?? 'unknown';

  // Title from h1 or page title, falling back to handle
  const title =
    $('h1').first().text().trim() ||
    $('title').text().split('|')[0]?.trim() ||
    handle;

  const gear_category: GearCategory = 'board'; // evo.com snowboards listing — always board

  // mount_pattern inference from mount_pattern_raw
  let mount_pattern: MountPattern = '4x4';
  const raw = (specs.mount_pattern_raw ?? '').toLowerCase();
  if (raw.includes('channel') || raw.includes('est')) mount_pattern = 'channel';
  else if (raw.includes('2x4') || raw.includes('2 x 4')) mount_pattern = '2x4';

  return {
    shopify_id: `evo-${handle}`,
    retailer: 'evo',
    title,
    handle,
    vendor: null,
    product_type: 'Snowboard',
    gear_category,
    flex_rating: specs.flex_rating,
    waist_width_mm: specs.waist_width_mm,
    mount_pattern,
    mount_pattern_raw: specs.mount_pattern_raw ?? '',
    image_url: null,
    price_cents: 0, // PDP price extraction out of scope — use 0 sentinel
    variants_json: '[]',
    fetched_at: Date.now(),
  };
}

/** Implements ProductSource for evo.com static HTML pages. */
export class EvoHtmlScrapeSource implements ProductSource {
  readonly name = 'evo';

  async fetchAll(pipeline: RequestPipeline): Promise<NormalizedProduct[]> {
    // Try primary listing URL, fall back to alt URL
    let listingHtml: string;
    try {
      const res = await pipeline.fetch(LISTING_URL);
      listingHtml = await res.text();
    } catch {
      const res = await pipeline.fetch(ALT_LISTING_URL);
      listingHtml = await res.text();
    }

    const $ = cheerio.load(listingHtml);
    const productPaths: string[] = [];
    $(PRODUCT_THUMB_SELECTOR).each((_i, el) => {
      const href = $(el).find('a[href]').attr('href');
      if (href?.startsWith('/')) productPaths.push(href);
    });

    // Cloudflare block detection
    if (productPaths.length === 0) {
      const isCloudflare =
        listingHtml.includes('Cloudflare') ||
        listingHtml.includes('Attention Required');
      throw new Error(
        isCloudflare
          ? 'evo.com listing returned no products — possible Cloudflare block'
          : 'evo.com listing returned no products — selectors may have changed',
      );
    }

    const results = await Promise.all(
      productPaths.map((path) => this.#fetchPdp(pipeline, path)),
    );
    return results.filter((p): p is NormalizedProduct => p !== null);
  }

  async #fetchPdp(
    pipeline: RequestPipeline,
    path: string,
  ): Promise<NormalizedProduct | null> {
    try {
      const url = `https://www.evo.com${path}`;
      const res = await pipeline.fetch(url);
      const html = await res.text();
      const $ = cheerio.load(html);
      const specs = extractSpecs(html);
      return buildNormalizedProduct(url, specs, $);
    } catch {
      return null; // Individual PDP failure — skip, not fatal
    }
  }
}
