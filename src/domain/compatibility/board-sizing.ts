/**
 * Board-length sizing for Shred Scout.
 *
 * Turns the rider's weight (primary), height, skill, and riding style into a recommended
 * board length - the signal the guided wizard collects but previously ignored. Used to RANK
 * results so the most appropriately-sized boards surface first (a soft sort, never a filter).
 *
 * The model approximates published manufacturer size charts: length scales mainly with weight,
 * nudged slightly by height, then adjusted for skill (beginners ride shorter, easier boards) and
 * style (powder/freeride longer for float; park/freestyle shorter for maneuverability).
 * Pure - no I/O, never throws.
 */

import type { RiderProfile } from '../../types/profile.js';

/** A recommended board-length window in centimeters. */
export interface BoardLengthRec {
  /** Shortest length still appropriate. */
  min: number;
  /** Best-fit length. */
  ideal: number;
  /** Longest length still appropriate. */
  max: number;
}

/** Centimeters added/removed for skill level (beginners ride shorter). */
const SKILL_ADJUST: Record<string, number> = {
  beginner: -3,
  intermediate: -1,
  advanced: 0,
};

/** Centimeters added/removed for riding style (powder longer, park shorter). */
const STYLE_ADJUST: Record<string, number> = {
  park: -4,
  freestyle: -3,
  'all-mountain': 0,
  powder: 4,
  freeride: 2,
  backcountry: 3,
};

function normalizeStyle(style: string): string {
  return style
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Recommends a board-length window for the rider. Weight drives the base length; height nudges
 * it; skill and style shift it. The ideal is clamped to a realistic board range and min/max are
 * a few centimeters either side.
 */
export function recommendBoardLength(rider: RiderProfile): BoardLengthRec {
  const base = 0.36 * rider.weightKg + 130 + 0.1 * (rider.heightCm - 175);
  const skillAdj =
    SKILL_ADJUST[(rider.skillLevel ?? 'intermediate').toLowerCase()] ?? -1;
  const styleAdj = STYLE_ADJUST[normalizeStyle(rider.ridingStyle)] ?? 0;
  const ideal = clamp(Math.round(base + skillAdj + styleAdj), 138, 182);
  return { min: ideal - 3, ideal, max: ideal + 3 };
}

/**
 * Extracts plausible board lengths (cm) from a product's size variants. Board size variants are
 * the length in centimeters, sometimes with a "W" (wide) suffix - e.g. "154", "157W". Boot and
 * binding sizes (single/low numbers) and letter sizes are excluded by the 130-200 cm window.
 */
export function parseBoardLengthsCm(variantsJson: string): number[] {
  try {
    const variants = JSON.parse(variantsJson) as Array<{ option1?: string }>;
    return variants
      .map((v) => {
        const m = (v.option1 ?? '').match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : Number.NaN;
      })
      .filter((n) => Number.isFinite(n) && n >= 130 && n <= 200);
  } catch {
    return [];
  }
}
