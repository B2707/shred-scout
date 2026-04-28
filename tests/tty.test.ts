import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Define isTTY as a configurable accessor on stdin/stdout so vi.spyOn can intercept it.
// In non-TTY environments (CI, piped), isTTY is not defined on the stream objects at all,
// which causes vi.spyOn(process.stdin, 'isTTY', 'get') to throw "property is not defined".
beforeEach(() => {
  if (!Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')) {
    Object.defineProperty(process.stdin, 'isTTY', {
      get: () => undefined,
      configurable: true,
    });
  }
  if (!Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')) {
    Object.defineProperty(process.stdout, 'isTTY', {
      get: () => undefined,
      configurable: true,
    });
  }
});

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
