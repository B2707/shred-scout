/**
 * Imperial → metric conversion utilities for Shred Scout.
 *
 * All functions are pure - no I/O, no side effects.
 * Used by the onboarding wizard to convert user input before storing.
 */

/**
 * Parses height input (feet/inches or bare cm) and returns centimeters.
 * Returns NaN if the input cannot be parsed.
 *
 * Accepts: "5'10\"", "5'10", "5' 10", "178" (bare cm)
 * Examples: "5'10\"" → 178, "178" → 178, "abc" → NaN
 */
export function parseHeight(raw: string): number {
  const trimmed = raw.trim();
  // Pattern: 5'10" or 5'10 or 5' 10 (handles curly quotes too)
  const feetInches = trimmed.match(/^(\d+)[''']\s*(\d*)["""']?$/);
  if (feetInches) {
    const feet = parseInt(feetInches[1], 10);
    const inches = feetInches[2] ? parseInt(feetInches[2], 10) : 0;
    return Math.round(feet * 30.48 + inches * 2.54);
  }
  // Bare number → treat as cm
  const cm = parseFloat(trimmed);
  return Number.isNaN(cm) ? NaN : Math.round(cm);
}

/**
 * Parses weight input in pounds and returns kilograms (rounded to nearest integer).
 * Returns NaN if the input cannot be parsed.
 *
 * Examples: "165" → 75, "200" → 91, "abc" → NaN
 */
export function parseWeight(raw: string): number {
  const lbs = parseFloat(raw.trim());
  if (Number.isNaN(lbs)) return NaN;
  return Math.round(lbs * 0.453592);
}

/**
 * Converts kilograms back to pounds (rounded to nearest integer).
 *
 * Inverse of {@link parseWeight}, used to DISPLAY a stored (metric) weight under the
 * wizard's lbs prompt so the shown number is in the same unit the prompt parses - a
 * returning rider who re-types it round-trips instead of silently corrupting their weight.
 *
 * Examples: 75 → 165, 80 → 176
 */
export function kgToLbs(kg: number): number {
  return Math.round(kg / 0.453592);
}
