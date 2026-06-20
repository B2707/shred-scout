/**
 * Static configuration + pure logic for the single guided setup wizard.
 *
 * One linear flow collects the rider's profile facts AND their gear preferences:
 *   boot → height → weight → skill → style → category → [profile] → confirm
 *
 * Keeping the option data, step sequencing, and answer→profile / answer→search mappings here
 * (pure, no React, no I/O) makes the wizard's behaviour testable independently of Ink.
 */

import type { RiderProfile } from '../../types/profile.js';

export type Category = 'board' | 'binding' | 'boot' | 'setup';
export type BoardProfile = 'camber' | 'rocker' | 'hybrid' | 'flat';
export type Flex = 'soft' | 'medium' | 'stiff';
export type Budget = 'u300' | 'u500' | 'u700' | 'any';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type StepId =
  // rider facts (free-text numeric entry - no options, so no per-option image)
  | 'boot'
  | 'height'
  | 'weight'
  // rider preferences (image-bearing single-select)
  | 'skill'
  | 'style'
  // gear preferences (image-bearing single-select)
  | 'category'
  | 'profile'
  | 'confirm';

/** Steps that take free-text numeric input rather than a list of image options. */
export const INPUT_STEPS: ReadonlySet<StepId> = new Set<StepId>([
  'boot',
  'height',
  'weight',
]);

export interface WizardOption<V extends string = string> {
  value: V;
  label: string;
  description: string;
  /** Bundled asset filename (in dist/assets) for the option's image. */
  image?: string;
}

export interface WizardAnswers {
  // rider facts (metric, as stored on RiderProfile)
  bootSize?: number;
  heightCm?: number;
  weightKg?: number;
  // rider preferences
  skill?: SkillLevel;
  style?: string;
  // gear preferences
  category?: Category;
  profile?: BoardProfile;
  flex?: Flex;
  budget?: Budget;
}

export const SKILL_OPTIONS: WizardOption<SkillLevel>[] = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'Green circle - new to it, or still finding your edges.',
    image: 'skill-beginner.png',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Blue square - comfortable linking turns most places.',
    image: 'skill-intermediate.png',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Black diamond - confident on steeps and at speed.',
    image: 'skill-advanced.png',
  },
];

/**
 * Riding style - a single unified list (previously split across the onboarding and gear
 * wizards with divergent sets). Values match the flex-advisory FLEX_RANGES keys. Ability
 * lives on its own `skill` step now, so 'beginner' is no longer a "style".
 */
export const STYLE_OPTIONS: WizardOption[] = [
  {
    value: 'all-mountain',
    label: 'All-Mountain',
    description: 'Ride everywhere - the do-it-all choice.',
    image: 'style-all-mountain.png',
  },
  {
    value: 'park',
    label: 'Park',
    description: 'Jumps, rails and tricks in the terrain park.',
    image: 'style-park.png',
  },
  {
    value: 'freestyle',
    label: 'Freestyle',
    description: 'Creative, playful riding all over the hill.',
    image: 'style-freestyle.png',
  },
  {
    value: 'powder',
    label: 'Powder',
    description: 'Float through deep, soft snow.',
    image: 'style-powder.png',
  },
  {
    value: 'freeride',
    label: 'Freeride',
    description: 'Off-piste, steeps and big-mountain lines.',
    image: 'style-freeride.png',
  },
  {
    value: 'backcountry',
    label: 'Backcountry',
    description: 'Earn your turns beyond the resort boundary.',
    image: 'style-backcountry.png',
  },
];

export const CATEGORY_OPTIONS: WizardOption<Category>[] = [
  {
    value: 'board',
    label: 'Snowboard',
    description: 'The deck itself - start here.',
    image: 'cat-board.png',
  },
  {
    value: 'binding',
    label: 'Bindings',
    description: 'Connect your boots to the board.',
    image: 'cat-binding.png',
  },
  {
    value: 'boot',
    label: 'Boots',
    description: 'Comfort and control start at your feet.',
    image: 'cat-boot.png',
  },
  {
    value: 'setup',
    label: 'Full Setup',
    description: 'Board + bindings + boots together.',
    image: 'cat-setup.png',
  },
];

export const PROFILE_OPTIONS: WizardOption<BoardProfile>[] = [
  {
    value: 'camber',
    label: 'Camber',
    description: 'Pop & precision - best for carving.',
    image: 'profile-camber.png',
  },
  {
    value: 'rocker',
    label: 'Rocker',
    description: 'Loose & forgiving - powder & learning.',
    image: 'profile-rocker.png',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Camber underfoot, rocker tips - the most versatile.',
    image: 'profile-hybrid.png',
  },
  {
    value: 'flat',
    label: 'Flat',
    description: 'Stable and playful - predictable for park & jibbing.',
    image: 'profile-flat.png',
  },
];

export const FLEX_OPTIONS: WizardOption<Flex>[] = [
  {
    value: 'soft',
    label: 'Soft',
    description: 'Forgiving and playful - easiest to learn on, best for park.',
    image: 'flex-soft.png',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Versatile - balances stability and ease.',
    image: 'flex-medium.png',
  },
  {
    value: 'stiff',
    label: 'Stiff',
    description: 'Responsive and stable at speed - for aggressive riding.',
    image: 'flex-stiff.png',
  },
];

export const BUDGET_OPTIONS: WizardOption<Budget>[] = [
  {
    value: 'u300',
    label: 'Under $300',
    description: 'Entry-level deals.',
    image: 'budget-u300.png',
  },
  {
    value: 'u500',
    label: 'Under $500',
    description: 'Solid mid-range.',
    image: 'budget-u500.png',
  },
  {
    value: 'u700',
    label: 'Under $700',
    description: 'High-end performance.',
    image: 'budget-u700.png',
  },
  {
    value: 'any',
    label: 'No limit',
    description: 'Show me everything.',
    image: 'budget-any.png',
  },
];

/** Human label for any stored option value, across every select step. */
export const LABELS: Record<string, string> = Object.fromEntries(
  [
    ...SKILL_OPTIONS,
    ...STYLE_OPTIONS,
    ...CATEGORY_OPTIONS,
    ...PROFILE_OPTIONS,
    ...FLEX_OPTIONS,
    ...BUDGET_OPTIONS,
  ].map((o) => [o.value, o.label]),
);

/**
 * Start index of a scrolling option window that keeps the cursor in view. Centers the cursor
 * within `maxVisible` rows and clamps at both ends, so a list taller than the terminal scrolls
 * instead of overflowing (the overflow is what made Ink full-clear and flicker on every keypress).
 */
export function optionWindow(
  total: number,
  cursor: number,
  maxVisible: number,
): number {
  if (total <= maxVisible) return 0;
  const half = Math.floor(maxVisible / 2);
  const maxStart = total - maxVisible;
  return Math.min(Math.max(0, cursor - half), maxStart);
}

/**
 * Truncates text to `max` characters at a WORD boundary (adding an ellipsis), so option
 * descriptions never cut mid-word. Hard-cuts only when a single word is itself longer than max.
 */
export function truncateAtWord(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  let end = max - 1; // reserve one char for the ellipsis
  if (text[end] !== ' ' && text[end - 1] !== ' ') {
    const lastSpace = text.lastIndexOf(' ', end);
    if (lastSpace > 0) end = lastSpace;
  }
  return `${text.slice(0, end).trimEnd()}…`;
}

/** Whether a saved profile carries the body facts - i.e. this is a returning rider. */
export function isReturningRider(
  profile: RiderProfile | null | undefined,
): boolean {
  return (
    !!profile &&
    Number.isFinite(profile.bootSize) &&
    Number.isFinite(profile.heightCm) &&
    Number.isFinite(profile.weightKg)
  );
}

/**
 * The ordered steps for the current answers. The board-profile step only applies when a
 * board is involved; every other step is always shown (rider-fact steps are pre-filled for
 * returning riders rather than skipped, so nothing silently disappears).
 */
export function visibleSteps(answers: WizardAnswers): StepId[] {
  const showProfile =
    answers.category === 'board' || answers.category === 'setup';
  return [
    'boot',
    'height',
    'weight',
    'skill',
    'style',
    'category',
    ...(showProfile ? (['profile'] as StepId[]) : []),
    'confirm',
  ];
}

/**
 * Builds the persisted RiderProfile from completed answers. Falls back to sane defaults for
 * any unanswered field so a partial answers object never produces NaN/undefined.
 */
export function answersToProfile(answers: WizardAnswers): RiderProfile {
  return {
    bootSize: answers.bootSize ?? 10,
    heightCm: answers.heightCm ?? 178,
    weightKg: answers.weightKg ?? 75,
    ridingStyle: answers.style ?? 'all-mountain',
    skillLevel: answers.skill ?? 'intermediate',
  };
}

/**
 * Maps completed answers to a runSearch query + the SearchView chip filters to pre-apply.
 * Category drives the keyword query and category chip.
 * (Profile/style/skill are captured for the rider profile + compatibility scoring - e.g.
 * flex-advisory keys off riding style - but are NOT hard search filters, since the demo
 * product data has no profile/style metadata to filter on and doing so would over-narrow
 * results to nothing.)
 */
export function wizardToSearch(answers: WizardAnswers): {
  query: string;
  filters: string[];
} {
  const query =
    answers.category === 'board'
      ? 'boards'
      : answers.category === 'binding'
        ? 'bindings'
        : answers.category === 'boot'
          ? 'boots'
          : '';
  const filters: string[] = [];
  if (answers.category && answers.category !== 'setup')
    filters.push(answers.category);
  return { query, filters };
}
