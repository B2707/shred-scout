/**
 * Rider profile persistence and validation for Shred Scout.
 *
 * Wraps `conf` for platform-appropriate config storage.
 * All reads are synchronous - safe to call during React component initialization.
 *
 * Config path (macOS): ~/Library/Preferences/shred-scout/config.json
 * Config path (Linux): ~/.config/shred-scout/config.json
 */
import Conf from 'conf';
import type { RiderProfile } from '../types/profile.js';

type StoreShape = { riderProfile: RiderProfile };

// Module-level singleton - conf reads config file once at module init.
// projectSuffix: '' prevents conf from appending '-nodejs' to the directory name.
const store = new Conf<StoreShape>({
  projectName: 'shred-scout',
  projectSuffix: '',
});

/**
 * Reads the stored rider profile.
 * Returns null if no profile has been saved yet (first run).
 */
export function readProfile(): RiderProfile | null {
  if (!store.has('riderProfile')) return null;
  return store.get('riderProfile');
}

/**
 * Writes the rider profile to the platform config store.
 * Write is atomic - no partial-write risk on process crash.
 */
export function writeProfile(profile: RiderProfile): void {
  store.set('riderProfile', profile);
}

/**
 * Returns true if v is a valid US snowboard boot size (4.0 - 18.0 inclusive).
 */
export function validateBootSize(v: number): boolean {
  return !Number.isNaN(v) && v >= 4.0 && v <= 18.0;
}

/**
 * Returns true if cm is a valid height in centimeters (120 - 250 inclusive).
 * Range covers approximately 3'11" to 8'2".
 */
export function validateHeightCm(cm: number): boolean {
  return !Number.isNaN(cm) && cm >= 120 && cm <= 250;
}

/**
 * Returns true if kg is a valid weight in kilograms (30 - 200 inclusive).
 * Range covers approximately 66 - 440 lbs.
 */
export function validateWeightKg(kg: number): boolean {
  return !Number.isNaN(kg) && kg >= 30 && kg <= 200;
}
