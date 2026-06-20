/**
 * HistoryView - price history table for a single product.
 *
 * Shows all observations newest-first: relative timestamp | $price | trend (▼/▲/-).
 * No arrow-key navigation needed (read-only table). q/Escape returns to wishlist.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import type { PriceObservation } from '../data/repos/priceRepo.js';

export interface HistoryViewProps {
  observations: PriceObservation[];
  productTitle: string;
  onBack: () => void;
}

function relativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function HistoryView({
  observations,
  productTitle,
  onBack,
}: HistoryViewProps): React.JSX.Element {
  useInput((_input, key) => {
    if (key.escape || _input === 'q') onBack();
  });

  if (observations.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box>
          <Text color="cyanBright" bold>
            Price History -{' '}
          </Text>
          <Text>{productTitle}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold>No price history yet.</Text>
          <Text dimColor>
            Price is recorded when you save an item and each time the watch
            daemon polls.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>q back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color="cyanBright" bold>
          Price History -{' '}
        </Text>
        <Text>{productTitle}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor bold>
          {'When      '.padEnd(10)}
          {'Price     '.padEnd(10)}Chg
        </Text>
      </Box>

      {observations.map((obs, i) => {
        const prior = observations[i + 1];
        let trend = '-';
        let trendColor: string | undefined;
        if (prior) {
          if (obs.priceCents < prior.priceCents) {
            trend = '▼';
            trendColor = 'green';
          } else if (obs.priceCents > prior.priceCents) {
            trend = '▲';
            trendColor = 'red';
          } else {
            trendColor = undefined;
          }
        }
        const when = relativeTime(obs.observedAt).padEnd(10);
        const price = `$${(obs.priceCents / 100).toFixed(2)}`.padEnd(10);
        return (
          <Box key={obs.id}>
            <Text dimColor>{when}</Text>
            <Text>{price}</Text>
            <Text color={trendColor}>{trend}</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>q back</Text>
      </Box>
    </Box>
  );
}
