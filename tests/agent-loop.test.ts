import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('AgentLoop', () => {
  it.todo('emits done when stop_reason is end_turn');
  it.todo('emits error with code cost_ceiling when accumulated cost exceeds limit before next turn');
  it.todo('stops at MAX_AGENT_TURNS even when stop_reason keeps returning tool_use');
  it.todo('abort() invokes controller.abort() and cancels in-flight messages.stream()');
  it.todo('emits error for max_tokens stop_reason');
  it.todo('emits error for unexpected stop_reason values (stop_sequence, pause_turn, refusal)');
  it.todo('handles multiple tool_use blocks in a single turn (parallel tool calls)');
  it.todo('does not write to process.stdout or process.stderr at any point');
});

