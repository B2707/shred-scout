/**
 * CompatBadge - inline colored verdict badge for a single RuleResult.
 *
 * Format: [VERDICT:ruleId] - e.g. "[PASS:boot-to-binding-size]"
 *
 * This component is BUILT but NOT RENDERED anywhere yet.
 * runRules() requires a complete GearSetup (board + binding + boot), which
 * individual product cards do not have. The badge will be wired in
 * when complete setup comparison is available.
 *
 * Caller is responsible for wrapping badges in <Box gap={1}> for horizontal spacing.
 */

import { Text } from 'ink';
import type React from 'react';
import type { RuleResult } from '../domain/compatibility/types.js';

const BADGE_COLOR: Record<string, string> = {
  pass: 'green',
  warn: 'yellow',
  fail: 'red',
  unknown: 'yellow',
};

export interface CompatBadgeProps {
  result: RuleResult;
}

export function CompatBadge({ result }: CompatBadgeProps): React.JSX.Element {
  const color = BADGE_COLOR[result.verdict] ?? 'white';
  const isPass = result.verdict === 'pass';
  return (
    <Text color={color} bold={isPass}>
      [{result.verdict.toUpperCase()}:{result.ruleId}]
    </Text>
  );
}
