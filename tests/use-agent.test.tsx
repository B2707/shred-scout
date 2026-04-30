import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { EventEmitter } from 'node:events';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeMockAgentLoop() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    run: vi.fn(),
    abort: vi.fn(),
  }) as unknown as import('../src/agent/agent-loop.js').AgentLoop;
}

describe('useAgent()', () => {
  it('dispatches TOKEN action when agentLoop emits token event', async () => {
    const { useAgent } = await import('../src/hooks/useAgent.js');
    const loop = makeMockAgentLoop();
    let captured: ReturnType<typeof useAgent> | null = null;
    function Probe(): React.JSX.Element {
      const state = useAgent(loop);
      captured = state;
      return <Text>{state.tokens}</Text>;
    }
    const r = render(<Probe />);
    await act(async () => { (loop as unknown as EventEmitter).emit('token', 'hello '); });
    await act(async () => { (loop as unknown as EventEmitter).emit('token', 'world'); });
    expect(captured!.tokens).toBe('hello world');
    expect(captured!.status).toBe('running');
    r.unmount();
  });

  it('dispatches RESULT action when agentLoop emits result event', async () => {
    const { useAgent } = await import('../src/hooks/useAgent.js');
    const loop = makeMockAgentLoop();
    let captured: ReturnType<typeof useAgent> | null = null;
    function Probe(): React.JSX.Element {
      const state = useAgent(loop);
      captured = state;
      return <Text>{String(state.products.length)}</Text>;
    }
    const r = render(<Probe />);
    const fakeProducts = [{ shopify_id: '1' }, { shopify_id: '2' }] as never;
    await act(async () => { (loop as unknown as EventEmitter).emit('result', fakeProducts); });
    expect(captured!.products).toHaveLength(2);
    r.unmount();
  });

  it('dispatches DONE action and resets tokens', async () => {
    const { useAgent } = await import('../src/hooks/useAgent.js');
    const loop = makeMockAgentLoop();
    let captured: ReturnType<typeof useAgent> | null = null;
    function Probe(): React.JSX.Element {
      const state = useAgent(loop);
      captured = state;
      return <Text>{state.status}</Text>;
    }
    const r = render(<Probe />);
    await act(async () => { (loop as unknown as EventEmitter).emit('token', 'streaming...'); });
    await act(async () => { (loop as unknown as EventEmitter).emit('done'); });
    expect(captured!.status).toBe('done');
    expect(captured!.tokens).toBe('');
    r.unmount();
  });

  it('cleanup function calls agentLoop.abort() and removeAllListeners() on unmount', async () => {
    const { useAgent } = await import('../src/hooks/useAgent.js');
    const loop = makeMockAgentLoop();
    const removeAllSpy = vi.spyOn(loop as unknown as EventEmitter, 'removeAllListeners');
    function Probe(): React.JSX.Element {
      useAgent(loop);
      return <Text>probe</Text>;
    }
    const r = render(<Probe />);
    r.unmount();
    expect((loop as unknown as { abort: ReturnType<typeof vi.fn> }).abort).toHaveBeenCalledTimes(1);
    expect(removeAllSpy).toHaveBeenCalledTimes(1);
  });

  it('dispatches ERROR action with code and sets status to error', async () => {
    const { useAgent } = await import('../src/hooks/useAgent.js');
    const loop = makeMockAgentLoop();
    let captured: ReturnType<typeof useAgent> | null = null;
    function Probe(): React.JSX.Element {
      const state = useAgent(loop);
      captured = state;
      return <Text>{state.status}</Text>;
    }
    const r = render(<Probe />);
    await act(async () => {
      (loop as unknown as EventEmitter).emit('error', { code: 'cost_ceiling', spent: 0.11, limit: 0.10 });
    });
    expect(captured!.status).toBe('error');
    expect(captured!.error?.code).toBe('cost_ceiling');
    r.unmount();
  });
});
