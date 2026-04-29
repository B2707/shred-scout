/**
 * Header — Single-line profile header bar shown after wizard completion.
 * Displays: "Shred Scout — Boot: {size} | {DisplayStyle}"
 */
import React from 'react';
import { Text } from 'ink';
import type { RiderProfile } from '../types/profile.js';

interface HeaderProps {
  profile: RiderProfile;
}

export function Header({ profile }: HeaderProps): React.JSX.Element {
  // Convert stored 'all-mountain' → display 'All-Mountain'
  const displayStyle = profile.ridingStyle
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');

  return (
    <Text>
      <Text bold color="cyanBright">Shred Scout</Text>
      <Text>{` — Boot: ${profile.bootSize} | ${displayStyle}`}</Text>
    </Text>
  );
}
