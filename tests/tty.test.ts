import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isTTY()', () => {
  it('returns true when both stdin and stdout are TTYs', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true as unknown as boolean);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true as unknown as boolean);
    const { isTTY } = await import('../src/lib/tty.js');
    expect(isTTY()).toBe(true);
  });

  it('returns false when stdin is not a TTY', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(undefined as unknown as boolean);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true as unknown as boolean);
    const { isTTY } = await import('../src/lib/tty.js');
    expect(isTTY()).toBe(false);
  });

  it('returns false when stdout is not a TTY', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true as unknown as boolean);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(undefined as unknown as boolean);
    const { isTTY } = await import('../src/lib/tty.js');
    expect(isTTY()).toBe(false);
  });

  it('returns false when both stdin and stdout are non-TTY', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(undefined as unknown as boolean);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(undefined as unknown as boolean);
    const { isTTY } = await import('../src/lib/tty.js');
    expect(isTTY()).toBe(false);
  });
});
