import { describe, it, expect } from 'vitest';
import { execaNode } from 'execa';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dirname, '../dist/cli.js');

describe('shred-scout CLI', () => {
  it('prints version to stdout in format "shred-scout X.Y.Z"', async () => {
    const result = await execaNode(CLI, ['--version']);
    expect(result.stdout).toMatch(/^shred-scout \d+\.\d+\.\d+$/);
    expect(result.exitCode).toBe(0);
  });

  it('prints help output to stdout containing "shred-scout"', async () => {
    const result = await execaNode(CLI, ['--help']);
    expect(result.stdout).toContain('shred-scout');
    expect(result.exitCode).toBe(0);
  });

  it('exits with code 1 and writes error to stderr when stdin is not a TTY', async () => {
    const result = await execaNode(CLI, [], {
      stdin: 'pipe',
      reject: false,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('requires an interactive terminal');
  });
});
