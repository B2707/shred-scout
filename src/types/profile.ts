/**
 * Core domain types for Shred Scout rider profiles.
 *
 * RiderProfile is the single source of truth for all profile-related
 * operations in the codebase. Stored values are always metric.
 */

/**
 * Rider profile captured during first-run onboarding wizard.
 * All measurements are stored in metric units regardless of input format.
 */
export interface RiderProfile {
  /** US boot size (e.g. 10.5) — stored as-is; US size is universal in snowboard specs */
  bootSize: number;
  /** Rider height in centimeters */
  heightCm: number;
  /** Rider weight in kilograms */
  weightKg: number;
  /** Riding style — one of: 'all-mountain', 'freestyle', 'freeride', 'backcountry', 'beginner' */
  ridingStyle: string;
}
