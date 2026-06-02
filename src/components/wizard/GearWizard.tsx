/**
 * GearWizard — the guided gear-selection flow that replaces the blank search box.
 *
 * Each step asks ONE clear question with constrained, described choices (images on the
 * category and board-profile steps). Arrow keys move the highlight, Enter confirms,
 * Backspace/← goes back, and a confirm card summarises every choice before searching.
 *
 * On completion it hands the collected answers up; App maps them to a search via
 * wizardToSearch().
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { resolveAssetPath } from '../../lib/assets.js';
import { TerminalImage } from '../TerminalImage.js';
import { ImageOption } from './ImageOption.js';
import {
  BUDGET_OPTIONS,
  CATEGORY_OPTIONS,
  FLEX_OPTIONS,
  PROFILE_OPTIONS,
  STYLE_OPTIONS,
  type StepId,
  visibleSteps,
  type WizardAnswers,
  type WizardOption,
} from './wizard-config.js';

export interface GearWizardProps {
  supportsImages: boolean;
  /** Called with the completed answers when the user confirms. */
  onComplete: (answers: WizardAnswers) => void;
  /** Called when the user backs out of the first step or presses q. */
  onQuit: () => void;
}

const STEP_META: Record<
  StepId,
  { title: string; field?: keyof WizardAnswers; options: WizardOption[] }
> = {
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
  style: {
    title: 'How do you like to ride?',
    field: 'style',
    options: STYLE_OPTIONS,
  },
  flex: {
    title: 'How stiff do you want it?',
    field: 'flex',
    options: FLEX_OPTIONS,
  },
  budget: {
    title: "What's your budget?",
    field: 'budget',
    options: BUDGET_OPTIONS,
  },
  confirm: { title: 'Ready to search?', options: [] },
};

const LABELS: Record<string, string> = Object.fromEntries(
  [
    ...CATEGORY_OPTIONS,
    ...PROFILE_OPTIONS,
    ...STYLE_OPTIONS,
    ...FLEX_OPTIONS,
    ...BUDGET_OPTIONS,
  ].map((o) => [o.value, o.label]),
);

export function GearWizard({
  supportsImages,
  onComplete,
  onQuit,
}: GearWizardProps): React.JSX.Element {
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [cursor, setCursor] = useState(0);

  const steps = useMemo(() => visibleSteps(answers), [answers]);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const stepId = steps[safeIndex];
  const meta = STEP_META[stepId];
  const options = meta.options;

  // Reset the highlight when the step changes — to the current answer if one exists.
  // biome-ignore lint/correctness/useExhaustiveDependencies: must run only on step change; depending on answers/options/meta.field would reset the cursor mid-step.
  useEffect(() => {
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

  useInput((input, key) => {
    if (input === 'q') {
      onQuit();
      return;
    }
    if (key.backspace || key.delete || key.leftArrow) {
      goBack();
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

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Progress dots */}
      <Box marginBottom={1}>
        <Text>
          {steps
            .map((_, i) =>
              i === safeIndex ? '● ' : i < safeIndex ? '● ' : '○ ',
            )
            .join('')}
        </Text>
        <Text dimColor>
          {' '}
          step {safeIndex + 1} of {steps.length}
        </Text>
      </Box>

      <Text bold color="cyan">
        {meta.title}
      </Text>
      <Box height={1} />

      {stepId === 'confirm' ? (
        <ConfirmCard answers={answers} supportsImages={supportsImages} />
      ) : (
        <Box flexDirection="column">
          {options.map((o, i) => (
            <ImageOption
              key={o.value}
              label={o.label}
              description={o.description}
              image={o.image}
              selected={i === cursor}
              supportsImages={supportsImages}
            />
          ))}
        </Box>
      )}

      {/* Footer hints */}
      <Box marginTop={1}>
        <Text dimColor>
          {stepId === 'confirm'
            ? '↵ search   ⌫ back   q quit'
            : '↑↓ move   ↵ select   ⌫ back   q quit'}
        </Text>
      </Box>
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
  const rows: Array<[string, string | undefined]> = [
    ['Looking for', answers.category ? LABELS[answers.category] : undefined],
    ['Board profile', answers.profile ? LABELS[answers.profile] : undefined],
    ['Riding style', answers.style ? LABELS[answers.style] : undefined],
    ['Flex', answers.flex ? LABELS[answers.flex] : undefined],
    ['Budget', answers.budget ? LABELS[answers.budget] : undefined],
  ];
  return (
    <Box borderStyle="round" borderColor="green" paddingX={1}>
      {categoryOpt?.image && (
        <Box marginRight={1}>
          <TerminalImage
            source={resolveAssetPath(categoryOpt.image)}
            supportsImages={supportsImages}
            width={16}
            height={7}
          />
        </Box>
      )}
      <Box flexDirection="column">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Box key={k}>
              <Text dimColor>{k}: </Text>
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
