/**
 * Header — Single-line profile header bar shown after wizard completion.
 * Displays a gradient "Shred Scout" title followed by profile info.
 */

import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import type React from 'react';
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
    <Box flexDirection="column">
      <Gradient colors={['#2255ee', '#00ddff']}>{'Shred Scout'}</Gradient>
      <Text dimColor>{`Boot: ${profile.bootSize} | ${displayStyle}`}</Text>
    </Box>
  );
}
