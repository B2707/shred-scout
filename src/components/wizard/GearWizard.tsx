/**
 * GearWizard - the single guided setup flow that replaces the blank search box.
 *
 * One linear flow gathers the rider's profile facts AND their gear preferences:
 *   boot → height → weight → skill → style → category → [profile] → confirm
 *
 * Free-text numeric steps (boot/height/weight) use a TextInput; every preference step asks
 * ONE question with constrained, image-bearing choices. Arrow keys move the highlight, Enter
 * confirms, Backspace/← goes back (on choice steps), and a confirm card summarises everything
 * before searching.
 *
 * Returning riders are PRE-FILLED from their saved profile rather than skipped: choice steps
 * default the highlight to the saved value, and the numeric steps show the current value with
 * "Enter to keep" - so nothing silently disappears and every fact stays editable.
 *
 * On completion it hands the collected answers up; App maps them to a persisted RiderProfile
 * (answersToProfile) and a search (wizardToSearch).
 */

import { TextInput } from '@inkjs/ui';
import { Box, Text, useInput, useStdout } from 'ink';
import Gradient from 'ink-gradient';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { resolveAssetPath } from '../../lib/assets.js';
import { kgToLbs, parseHeight, parseWeight } from '../../lib/conversions.js';
import {
  validateBootSize,
  validateHeightCm,
  validateWeightKg,
} from '../../lib/profile.js';
import type { RiderProfile } from '../../types/profile.js';
import { TerminalImage } from '../TerminalImage.js';
import { ImageOption } from './ImageOption.js';
import {
  CATEGORY_OPTIONS,
  INPUT_STEPS,
  isReturningRider,
  LABELS,
  optionWindow,
  PROFILE_OPTIONS,
  SKILL_OPTIONS,
  STYLE_OPTIONS,
  type StepId,
  visibleSteps,
  type WizardAnswers,
  type WizardOption,
} from './wizard-config.js';

export interface GearWizardProps {
  supportsImages: boolean;
  /** Called with the completed answers when the rider confirms. */
  onComplete: (answers: WizardAnswers) => void;
  /** Called when the rider backs out of the first step or presses q. */
  onQuit: () => void;
  /** A previously saved profile - pre-fills the rider-fact steps for returning riders. */
  initialProfile?: RiderProfile | null;
}

/** Numeric field on WizardAnswers that an input step writes. */
type NumericField = 'bootSize' | 'heightCm' | 'weightKg';

interface InputSpec {
  field: NumericField;
  hint: string;
  placeholder: string;
  parse: (raw: string) => number;
  validate: (n: number) => boolean;
  error: string;
  /**
   * Formats a pre-filled (stored) value for display under the prompt. MUST render the
   * number in the same unit `parse` expects so a returning rider who re-types it round-trips.
   * Defaults to the bare number when omitted.
   */
  displayValue?: (n: number) => string;
}

interface StepDef {
  title: string;
  /** Choice steps: the answers field + options. */
  field?: keyof WizardAnswers;
  options?: WizardOption[];
  /** Input steps: free-text numeric entry spec. */
  input?: InputSpec;
}

const STEP_META: Record<StepId, StepDef> = {
  boot: {
    title: 'What is your boot size?',
    input: {
      field: 'bootSize',
      hint: 'US mens size (e.g. 10.5)',
      placeholder: 'e.g. 10.5',
      parse: (raw) => Number.parseFloat(raw),
      validate: validateBootSize,
      error: 'Boot size must be a number between 4.0 and 18.0',
    },
  },
  height: {
    title: 'How tall are you?',
    input: {
      field: 'heightCm',
      hint: 'e.g. 5\'10" or 178cm',
      placeholder: 'e.g. 5\'10"',
      parse: parseHeight,
      validate: validateHeightCm,
      error: 'Enter height as 5\'10" or 178 - must be between 4\'0" and 8\'2"',
    },
  },
  weight: {
    title: 'How much do you weigh?',
    input: {
      field: 'weightKg',
      hint: 'e.g. 165 lbs',
      placeholder: 'e.g. 165',
      parse: parseWeight,
      validate: validateWeightKg,
      error: 'Enter weight in lbs between 66 and 440',
      // Stored weight is metric; show it in lbs (the prompt unit) so re-typing can't corrupt it.
      displayValue: (kg) => `${kgToLbs(kg)} lbs`,
    },
  },
  skill: {
    title: "What's your skill level?",
    field: 'skill',
    options: SKILL_OPTIONS,
  },
  style: {
    title: 'How do you like to ride?',
    field: 'style',
    options: STYLE_OPTIONS,
  },
  category: {
    title: 'What are you shopping for?',
    field: 'category',
    options: CATEGORY_OPTIONS,
  },
  profile: {
    title: 'Pick a board profile',
    field: 'profile',
    options: PROFILE_OPTIONS,
  },
  confirm: { title: 'Ready to search?' },
};

/** Seeds answers from a saved profile so returning riders see their facts pre-filled. */
function seedAnswers(profile?: RiderProfile | null): WizardAnswers {
  if (!profile) return {};
  const seed: WizardAnswers = {
    bootSize: profile.bootSize,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    style: profile.ridingStyle,
  };
  if (
    profile.skillLevel === 'beginner' ||
    profile.skillLevel === 'intermediate' ||
    profile.skillLevel === 'advanced'
  ) {
    seed.skill = profile.skillLevel;
  }
  return seed;
}

export function GearWizard({
  supportsImages,
  onComplete,
  onQuit,
  initialProfile,
}: GearWizardProps): React.JSX.Element {
  const [answers, setAnswers] = useState<WizardAnswers>(() =>
    seedAnswers(initialProfile),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { stdout } = useStdout();

  const steps = useMemo(() => visibleSteps(answers), [answers]);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const stepId = steps[safeIndex];
  const meta = STEP_META[stepId];
  const isInput = INPUT_STEPS.has(stepId);
  const options = meta.options ?? [];

  // Returning riders (saved profile) get a fast path: every step is pre-filled, and ⇥ jumps
  // straight to the confirm/search step - without removing the ability to step through and edit.
  // Body facts are seeded for a returning rider, but `category` is NEVER seeded (we don't know
  // what they want this time). So the fast path stops at the category step while category is
  // still unset, letting them choose; only once a category exists does ⇥ go all the way to
  // confirm. Skipping straight to confirm with no category would silently drop the "Looking
  // for" row and complete with category===undefined (a broad, intent-less search).
  const returning = isReturningRider(initialProfile);
  function jumpToConfirm(): void {
    if (answers.category === undefined) {
      const categoryIndex = steps.indexOf('category');
      if (categoryIndex >= 0) {
        setStepIndex(categoryIndex);
        return;
      }
    }
    setStepIndex(steps.length - 1); // confirm is always the last step
  }

  // On entering a choice step, highlight the current answer if one exists (else first option).
  // biome-ignore lint/correctness/useExhaustiveDependencies: must run only on step change; depending on answers/options/meta.field would reset the cursor mid-step.
  useEffect(() => {
    setError(null);
    if (!meta.field) {
      setCursor(0);
      return;
    }
    const current = answers[meta.field];
    const idx = options.findIndex((o) => o.value === current);
    setCursor(idx >= 0 ? idx : 0);
  }, [stepId]);

  function goBack(): void {
    if (safeIndex === 0) {
      onQuit();
      return;
    }
    setStepIndex(safeIndex - 1);
  }

  function selectCurrent(): void {
    const opt = options[cursor];
    const field = meta.field;
    if (!opt || !field) return;
    setAnswers((prev) => ({ ...prev, [field]: opt.value }));
    setStepIndex(safeIndex + 1);
  }

  function submitInput(raw: string): void {
    const spec = meta.input;
    if (!spec) return;
    const trimmed = raw.trim();
    // Empty submit keeps a pre-filled value (returning rider pressing Enter through).
    if (trimmed === '' && answers[spec.field] !== undefined) {
      setError(null);
      setStepIndex(safeIndex + 1);
      return;
    }
    const value = spec.parse(trimmed);
    if (!spec.validate(value)) {
      setError(spec.error);
      return;
    }
    setError(null);
    setAnswers((prev) => ({ ...prev, [spec.field]: value }));
    setStepIndex(safeIndex + 1);
  }

  // Choice/confirm steps own the keyboard via useInput. Input steps let TextInput own it, so
  // the handler early-returns there (it still fires, but must not consume typed characters).
  useInput((input, key) => {
    if (isInput) {
      // TextInput owns typing on numeric steps; only intercept Esc (back/quit) and - for a
      // returning rider - ⇥ to skip ahead. All other keys fall through to TextInput untouched.
      if (key.tab && returning) jumpToConfirm();
      else if (key.escape) goBack();
      return;
    }
    if (input === 'q') {
      onQuit();
      return;
    }
    if (key.backspace || key.delete || key.leftArrow) {
      goBack();
      return;
    }
    if (key.tab && returning) {
      jumpToConfirm();
      return;
    }
    if (stepId === 'confirm') {
      if (key.return) onComplete(answers);
      return;
    }
    if (key.upArrow)
      setCursor((c) => (c - 1 + options.length) % options.length);
    else if (key.downArrow) setCursor((c) => (c + 1) % options.length);
    else if (key.return) selectCurrent();
  });

  const total = steps.length;
  const filled = safeIndex + 1;
  const bar = '▰'.repeat(filled) + '▱'.repeat(Math.max(0, total - filled));
  const frameWidth = Math.min(72, Math.max(46, (stdout.columns ?? 80) - 2));

  // Option thumbnails: bigger than the old 8×3 (so chafa art is legible), and only as many
  // rendered at once as fit the terminal height - a scrolling window. Rendering the whole
  // ~30-row style step taller than the viewport is what made Ink full-clear/flicker per keypress.
  const imageWidth = 12;
  const imageHeight = 4;
  const optionRowHeight = imageHeight; // one option ≈ its thumbnail height
  const chromeRows = 14; // border, padding, brand, step bar, title, footer, scroll hints
  const availRows = Math.max(optionRowHeight, (stdout.rows ?? 24) - chromeRows);
  const maxVisible = Math.max(
    2,
    Math.min(options.length || 1, Math.floor(availRows / optionRowHeight)),
  );
  const windowStart = optionWindow(options.length, cursor, maxVisible);
  const visibleOptions = options.slice(windowStart, windowStart + maxVisible);
  const hiddenAbove = windowStart;
  const hiddenBelow = options.length - (windowStart + visibleOptions.length);
  const descWidth = Math.max(16, frameWidth - imageWidth - 6);

  return (
    // One framed card per step - a tight, scannable list inside it (no box-per-option).
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={frameWidth}
    >
      <Box>
        <Gradient colors={['#2255ee', '#00ddff']}>Shred Scout</Gradient>
        <Text dimColor> · Guided Setup</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{`Step ${filled} of ${total}  `}</Text>
        <Text color="cyan">{bar}</Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>{meta.title}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {stepId === 'confirm' ? (
          <ConfirmCard answers={answers} supportsImages={supportsImages} />
        ) : isInput && meta.input ? (
          <InputStep
            key={stepId}
            spec={meta.input}
            current={answers[meta.input.field]}
            onSubmit={submitInput}
          />
        ) : (
          <>
            {hiddenAbove > 0 && (
              <Text dimColor>{`  ▲ ${hiddenAbove} more`}</Text>
            )}
            {visibleOptions.map((o, i) => (
              <ImageOption
                key={o.value}
                label={o.label}
                description={o.description}
                image={o.image}
                selected={windowStart + i === cursor}
                supportsImages={supportsImages}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                descWidth={descWidth}
              />
            ))}
            {hiddenBelow > 0 && (
              <Text dimColor>{`  ▼ ${hiddenBelow} more`}</Text>
            )}
          </>
        )}
      </Box>

      {error !== null && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {stepId === 'confirm'
            ? '↵ search    ⌫ back    q quit'
            : isInput
              ? `↵ continue    Esc back${returning ? '    ⇥ search now' : ''}    (⌃C to quit)`
              : `↑↓ move    ↵ select    ⌫ back    q quit${returning ? '    ⇥ search now' : ''}`}
        </Text>
      </Box>
    </Box>
  );
}

function InputStep({
  spec,
  current,
  onSubmit,
}: {
  spec: InputSpec;
  current: number | undefined;
  onSubmit: (raw: string) => void;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text dimColor>{spec.hint}</Text>
      {current !== undefined && (
        <Text dimColor>{`current: ${
          spec.displayValue ? spec.displayValue(current) : current
        } - press Enter to keep`}</Text>
      )}
      <TextInput placeholder={spec.placeholder} onSubmit={onSubmit} />
    </Box>
  );
}

function ConfirmCard({
  answers,
  supportsImages,
}: {
  answers: WizardAnswers;
  supportsImages: boolean;
}): React.JSX.Element {
  const categoryOpt = CATEGORY_OPTIONS.find(
    (o) => o.value === answers.category,
  );
  const heightLabel =
    answers.heightCm !== undefined ? `${answers.heightCm}cm` : undefined;
  const weightLabel =
    answers.weightKg !== undefined ? `${answers.weightKg}kg` : undefined;
  const rows: Array<[string, string | undefined]> = [
    [
      'Boot size',
      answers.bootSize !== undefined ? `US ${answers.bootSize}` : undefined,
    ],
    ['Height', heightLabel],
    ['Weight', weightLabel],
    ['Skill', answers.skill ? LABELS[answers.skill] : undefined],
    ['Riding style', answers.style ? LABELS[answers.style] : undefined],
    // Always shown - never silently empty. Falls back to "(everything)" so the rider can see
    // they're about to run a broad search rather than the row just vanishing.
    [
      'Looking for',
      answers.category ? LABELS[answers.category] : '(everything)',
    ],
    ['Board profile', answers.profile ? LABELS[answers.profile] : undefined],
    ['Flex', answers.flex ? LABELS[answers.flex] : undefined],
    ['Budget', answers.budget ? LABELS[answers.budget] : undefined],
  ];
  return (
    <Box flexDirection="row">
      {categoryOpt?.image && (
        <Box marginRight={2} flexShrink={0}>
          <TerminalImage
            source={resolveAssetPath(categoryOpt.image)}
            supportsImages={supportsImages}
            width={12}
            height={6}
            kind="art"
          />
        </Box>
      )}
      <Box flexDirection="column" flexGrow={1}>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Box key={k}>
              <Box width={14} flexShrink={0}>
                <Text dimColor>{k}</Text>
              </Box>
              <Text bold color="green">
                {v}
              </Text>
            </Box>
          ))}
        <Box marginTop={1}>
          <Text>Press ↵ to find your gear.</Text>
        </Box>
      </Box>
    </Box>
  );
}
