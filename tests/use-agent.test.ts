import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAgent()', () => {
  it.todo('dispatches TOKEN action when agentLoop emits token event');
  it.todo('dispatches RESULT action when agentLoop emits result event');
  it.todo('dispatches DONE action when agentLoop emits done event');
  it.todo('cleanup function calls agentLoop.abort() and removeAllListeners()');
});
