/**
 * Per-brand binding size tables for the Shred Scout compatibility engine.
 *
 * Each entry is an array of [minUS, maxUS] tuples representing available binding size ranges
 * in ascending order. Used when constructing GearSetup.binding.sizeRange in Phase 3.
 *
 * Sources:
 *   burton:  corbetts.com cross-checked prfo.com (S/M/L standard line — no XL in standard men's)
 *   union:   unionbindingcompany.com (S/M/L/XL — XS omitted; rare in retail SKUs)
 *   ride:    nextadventure.net (M/L/XL — Ride labels their S as M)
 *   flow:    nextadventure.net + corbetts.com (M/L/XL — no S in men's line)
 *   generic: synthesized center-of-industry fallback for unrecognized brands
 *
 * IMPORTANT — Overlapping ranges and iteration order:
 *   Some brand entries have intentionally overlapping boundary points (e.g. burton [6,8] and [8,11]
 *   share size 8; union [10.5,13] and [13,15] share size 13). This is by design: the overlap
 *   point belongs to the LARGER (less-constraining) range. Phase 3 lookup code MUST use Array.find()
 *   (first-match wins) so that boundary sizes resolve to the correct range. Do NOT use Array.filter()
 *   or otherwise accumulate multiple matches — the first range covering the boot size is the answer.
 */
export const BINDING_SIZE_RANGES: Record<string, [number, number][]> = {
  burton:  [[6, 8], [8, 11], [10, 14]],
  union:   [[5.5, 7.5], [8, 10], [10.5, 13], [13, 15]],
  ride:    [[5, 9], [8, 12], [11, 15]],
  flow:    [[5.5, 8], [8.5, 10.5], [11, 14]],
  generic: [[5, 8], [7, 10], [9, 13], [12, 15]],
};
