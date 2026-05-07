/**
 * WishlistView — full-screen saved setups list with arrow-key navigation.
 *
 * Arrow keys move selectedIndex. d = delete, h = open history, a = toggle alert.
 * Screen switching (q → search) is handled in App.tsx to avoid duplicate useInput handlers.
 * This component owns only intra-screen navigation.
 */
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SavedSetup } from '../data/repos/setupRepo.js';

export interface WishlistViewProps {
  setups: SavedSetup[];
  /** Resolve product title by DB primary key. Returns 'Unknown product' if not found. */
  resolveTitle: (id: number | null) => string;
  onDelete: (id: number) => void;
  onToggleAlert: (id: number, enabled: boolean) => void;
  /** Called with a non-null product ID when user presses h; App.tsx routes to history screen. */
  onOpenHistory: (productId: number) => void;
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

export function WishlistView({
  setups,
  resolveTitle,
  onDelete,
  onToggleAlert,
  onOpenHistory,
  onBack,
}: WishlistViewProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 2000);
  }, []);

  useInput((input, key) => {
    // Delete confirmation mode
    if (confirmDelete !== null) {
      if (input === 'y') {
        onDelete(confirmDelete);
        setConfirmDelete(null);
        setSelectedIndex(i => Math.max(0, i - 1));
      } else if (input === 'n' || key.escape) {
        setConfirmDelete(null);
      }
      return;
    }

    if (key.upArrow)   setSelectedIndex(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIndex(i => Math.min(Math.max(0, setups.length - 1), i + 1));

    const selected = setups[selectedIndex];

    if (input === 'd' && selected) {
      setConfirmDelete(selected.id);
    }

    if (input === 'h' && selected) {
      // Open history for the first non-null product in the setup
      const productId = selected.boardId ?? selected.bindingId ?? selected.bootId;
      if (productId !== null) onOpenHistory(productId);
    }

    if (input === 'a' && selected) {
      const next = !selected.alertEnabled;
      onToggleAlert(selected.id, next);
      // Use first non-null product ID for title resolution (mirrors 'h' handler pattern)
      const titleId = selected.boardId ?? selected.bindingId ?? selected.bootId;
      const title = resolveTitle(titleId);
      showStatus(next
        ? `✓ Price alert enabled for ${title}`
        : `✓ Price alert removed for ${title}`
      );
    }

    if (input === 'q' || key.escape) {
      onBack();
    }
  });

  if (setups.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="cyanBright" bold>Wishlist  (0 saved)</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Your wishlist is empty.</Text>
          <Text dimColor>Search for gear and type "Save item #:" to add items.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>q back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyanBright" bold>Wishlist  ({setups.length} saved)</Text>

      {setups.map((setup, i) => {
        const boardTitle = resolveTitle(setup.boardId);
        const bindingTitle = resolveTitle(setup.bindingId);
        const bootTitle = resolveTitle(setup.bootId);
        const titleLine = [boardTitle, bindingTitle, bootTitle]
          .filter(t => t !== 'Unknown product')
          .join(' · ') || 'Unknown product';
        const isSelected = i === selectedIndex;
        const isConfirmingDelete = confirmDelete === setup.id;

        return (
          <Box key={setup.id} marginBottom={1} flexDirection="column">
            <Box>
              <Text color={isSelected ? 'green' : undefined} bold={isSelected}>
                {isSelected ? '> ' : '  '}
              </Text>
              <Text color={isSelected ? 'green' : undefined} bold={isSelected}>
                {titleLine}
              </Text>
              <Text dimColor>  —  saved {relativeTime(setup.savedAt)}  </Text>
              {setup.alertEnabled
                ? <Text color="green" bold>[WATCHING]</Text>
                : <Text dimColor>–</Text>
              }
            </Box>
            {isConfirmingDelete && (
              <Box marginLeft={2}>
                <Text color="red" bold>Delete {titleLine}? [y/n]</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {statusMsg && (
        <Box marginTop={1}>
          <Text color="green">{statusMsg}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>↑↓ select   d delete   h history   a toggle alert   q back</Text>
      </Box>
    </Box>
  );
}
