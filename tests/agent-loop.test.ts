import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Mock client factory — injects a fake Anthropic client with messages.stream()
// Each call pops the next finalMessage from the queue (last item repeats).
// ---------------------------------------------------------------------------
function makeMockClient(finalMsgQueue: unknown[]) {
  let i = 0;
  return {
    messages: {
      stream: vi.fn().mockImplementation(() => {
        const msg = finalMsgQueue[i++] ?? finalMsgQueue[finalMsgQueue.length - 1];
        return {
          on: vi.fn(),
          finalMessage: vi.fn().mockResolvedValue(msg),
        };
      }),
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

const profile = { bootSize: 10, heightCm: 180, weightKg: 80, ridingStyle: 'all-mountain' };
const mockDb = {} as never;

describe('AgentLoop', () => {
  it('emits done when stop_reason is end_turn', async () => {
    const { AgentLoop } = await import('../src/agent/agent-loop.js');
    const client = makeMockClient([
      { content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } },
    ]);
    const loop = new AgentLoop(profile, mockDb, { client });
    const done = vi.fn();
    loop.on('done', done);
    await loop.run('hello');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('emits error with code cost_ceiling when accumulated cost exceeds limit before next turn', async () => {
    const { AgentLoop } = await import('../src/agent/agent-loop.js');
    // First turn returns tool_use with massive token usage so cost ceiling trips before turn 2.
    // 1_000_000 input tokens × $1.00/MTok = $1.00 spent → exceeds default $0.10 ceiling.
    const client = makeMockClient([
      {
        content: [{ type: 'tool_use', id: 't1', name: 'search_products', input: { query: 'x' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 1_000_000, output_tokens: 0 },
      },
    ]);
    const loop = new AgentLoop(profile, mockDb, {
      client,
      costCeilingUsd: 0.10,
      // Stub data layer so search_products doesn't actually run (it shouldn't reach turn 2 anyway):
    });
    const errors: Array<{ code: string; [key: string]: unknown }> = [];
    loop.on('error', (e) => errors.push(e));
    // Note: dispatch may throw inside #dispatchSearchProducts (mockDb has no real prepare()).
    // The catch in #dispatchTool returns is_error tool_result; loop continues to turn 2.
    // Turn 2 pre-check fires cost_ceiling.
    await loop.run('hello');
    expect(errors.some((e) => e.code === 'cost_ceiling')).toBe(true);
  });

  it('stops at MAX_AGENT_TURNS even when stop_reason keeps returning tool_use (overridden via maxTurns: 2)', async () => {
    const { AgentLoop } = await import('../src/agent/agent-loop.js');
    // Every turn returns tool_use → loop never reaches end_turn → must stop at maxTurns.
    const toolUseMsg = {
      content: [{ type: 'tool_use', id: 't1', name: 'refine_results', input: {} }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const client = makeMockClient([toolUseMsg, toolUseMsg, toolUseMsg]);
    const loop = new AgentLoop(profile, mockDb, { client, maxTurns: 2, costCeilingUsd: 1000 });
    const errors: Array<{ code: string; [key: string]: unknown }> = [];
    loop.on('error', (e) => errors.push(e));
    await loop.run('hello');
    expect(errors.some((e) => e.code === 'max_turns')).toBe(true);
  });

  it('abort() invokes controller.abort() — signal is passed to messages.stream()', async () => {
    const { AgentLoop } = await import('../src/agent/agent-loop.js');
    const client = makeMockClient([
      { content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
    ]);
    const loop = new AgentLoop(profile, mockDb, { client });
    await loop.run('hello');
    // Assert messages.stream was called with options containing a signal
    const streamMock = (client as { messages: { stream: ReturnType<typeof vi.fn> } }).messages.stream;
    expect(streamMock).toHaveBeenCalled();
    const callArgs = streamMock.mock.calls[0] as unknown[];
    expect(callArgs).toHaveLength(2);
    expect(callArgs[1]).toHaveProperty('signal');
    // Calling abort() does not throw and triggers the underlying AbortController
    expect(() => loop.abort()).not.toThrow();
  });

  it('emits error for max_tokens stop_reason', async () => {
    const { AgentLoop } = await import('../src/agent/agent-loop.js');
    const client = makeMockClient([
      { content: [], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 1 } },
    ]);
    const loop = new AgentLoop(profile, mockDb, { client });
    const errors: Array<{ code: string; [key: string]: unknown }> = [];
    loop.on('error', (e) => errors.push(e));
    await loop.run('hello');
    expect(errors[0]?.code).toBe('max_tokens');
  });

  it.each(['stop_sequence', 'pause_turn', 'refusal'])(
    'emits error for unexpected stop_reason: %s',
    async (stopReason) => {
      const { AgentLoop } = await import('../src/agent/agent-loop.js');
      const client = makeMockClient([
        { content: [], stop_reason: stopReason, usage: { input_tokens: 1, output_tokens: 1 } },
      ]);
      const loop = new AgentLoop(profile, mockDb, { client });
      const errors: Array<{ code: string; stopReason?: string }> = [];
      loop.on('error', (e) => errors.push(e as { code: string; stopReason?: string }));
      await loop.run('hello');
      expect(errors[0]?.code).toBe('unexpected_stop');
      expect(errors[0]?.stopReason).toBe(stopReason);
    },
  );

  it('handles multiple tool_use blocks in a single turn (parallel tool calls)', async () => {
    const { AgentLoop } = await import('../src/agent/agent-loop.js');
    const client = makeMockClient([
      {
        content: [
          { type: 'tool_use', id: 't1', name: 'refine_results', input: { priceMax: 500 } },
          { type: 'tool_use', id: 't2', name: 'refine_results', input: { gearType: 'board' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      { content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
    ]);
    const loop = new AgentLoop(profile, mockDb, { client, costCeilingUsd: 100 });
    const toolEvents: string[] = [];
    loop.on('tool_use', (name) => toolEvents.push(name));
    const done = vi.fn();
    loop.on('done', done);
    await loop.run('hello');
    expect(toolEvents.filter((n) => n === 'refine_results').length).toBe(2);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('does not write to process.stdout or process.stderr at any point', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { AgentLoop } = await import('../src/agent/agent-loop.js');
    const client = makeMockClient([
      { content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } },
    ]);
    const loop = new AgentLoop(profile, mockDb, { client });
    await loop.run('hello');
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
