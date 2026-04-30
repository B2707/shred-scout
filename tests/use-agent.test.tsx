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

  it('cleanup calls abort() before removing individual listeners on unmount', async () => {
    const { useAgent } = await import('../src/hooks/useAgent.js');
    const loop = makeMockAgentLoop();
    const callOrder: string[] = [];
    // Track abort() call order
    vi.spyOn(loop, 'abort').mockImplementation(() => { callOrder.push('abort'); });
    // Track individual off() calls
    const emitter = loop as unknown as EventEmitter;
    const offSpy = vi.spyOn(emitter, 'off').mockImplementation((...args) => {
      callOrder.push(`off:${String(args[0])}`);
      return emitter;
    });
    function Probe(): React.JSX.Element {
      useAgent(loop);
      return <Text>probe</Text>;
    }
    const r = render(<Probe />);
    r.unmount();
    // abort() must fire before any listener removal
    expect(callOrder[0]).toBe('abort');
    // All 4 listeners must be removed after abort
    expect(offSpy).toHaveBeenCalledTimes(4);
    expect(callOrder).toContain('off:token');
    expect(callOrder).toContain('off:result');
    expect(callOrder).toContain('off:error');
    expect(callOrder).toContain('off:done');
    // Verify abort was first
    expect(callOrder.indexOf('abort')).toBeLessThan(callOrder.indexOf('off:token'));
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
