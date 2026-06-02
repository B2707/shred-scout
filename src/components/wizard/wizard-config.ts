/**
 * Static configuration + pure logic for the guided gear-selection wizard (Phase 10).
 *
 * Keeping the option data, step sequencing, and answer→search mapping here (pure, no
 * React) makes the wizard's behaviour testable independently of the Ink rendering.
 */

export type Category = 'board' | 'binding' | 'boot' | 'setup';
export type BoardProfile = 'camber' | 'rocker' | 'hybrid' | 'flat';
export type Flex = 'soft' | 'medium' | 'stiff';
export type Budget = 'u300' | 'u500' | 'u700' | 'any';
export type StepId =
  | 'category'
  | 'profile'
  | 'style'
  | 'flex'
  | 'budget'
  | 'confirm';

export interface WizardOption<V extends string = string> {
  value: V;
  label: string;
  description: string;
  /** Bundled asset filename (in dist/assets) for the option's image, when it has one. */
  image?: string;
}

export interface WizardAnswers {
  category?: Category;
  profile?: BoardProfile;
  style?: string;
  flex?: Flex;
  budget?: Budget;
}

export const CATEGORY_OPTIONS: WizardOption<Category>[] = [
  {
    value: 'board',
    label: 'Snowboard',
    description: 'The deck itself — start here.',
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
    description:
      'Pop and precision — arched between the feet. Carving & all-mountain.',
    image: 'profile-camber.png',
  },
  {
    value: 'rocker',
    label: 'Rocker',
    description: 'Loose and forgiving — lifts at the tips. Powder & learning.',
    image: 'profile-rocker.png',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Camber underfoot, rocker tips — the most versatile.',
    image: 'profile-hybrid.png',
  },
  {
    value: 'flat',
    label: 'Flat',
    description: 'Stable and playful — predictable for park & jibbing.',
    image: 'profile-flat.png',
  },
];

export const STYLE_OPTIONS: WizardOption[] = [
  {
    value: 'all-mountain',
    label: 'All-Mountain',
    description: 'Ride everywhere — the do-it-all choice.',
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
];

export const FLEX_OPTIONS: WizardOption<Flex>[] = [
  {
    value: 'soft',
    label: 'Soft',
    description: 'Forgiving and playful — easiest to learn on, best for park.',
    image: 'flex-soft.png',
  },
  {
    value: 'medium',
    label: 'Medium',
    description: 'Versatile — balances stability and ease.',
    image: 'flex-medium.png',
  },
  {
    value: 'stiff',
    label: 'Stiff',
    description: 'Responsive and stable at speed — for aggressive riding.',
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

/** The board-profile step only applies when a board is involved. */
export function visibleSteps(answers: WizardAnswers): StepId[] {
  const showProfile =
    answers.category === 'board' || answers.category === 'setup';
  return [
    'category',
    ...(showProfile ? (['profile'] as StepId[]) : []),
    'style',
    'flex',
    'budget',
    'confirm',
  ];
}

/**
 * Maps completed wizard answers to a runSearch query + the SearchView chip filters to
 * pre-apply. Category drives the keyword query and category chip; flex and budget map to
 * their chips. (Profile/style are captured for the summary; demo data has no profile/style
 * metadata to filter on, so they don't over-narrow results.)
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
  if (answers.flex) filters.push(answers.flex);
  if (answers.budget === 'u300') filters.push('u300');
  else if (answers.budget === 'u500') filters.push('u500');
  else if (answers.budget === 'u700') filters.push('u700');
  return { query, filters };
}
