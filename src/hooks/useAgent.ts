/**
 * useAgent — EventEmitter → useReducer bridge for AgentLoop.
 *
 * Subscribes to AgentLoop events in useEffect; cleanup removes only the
 * specific listeners registered by this hook instance (RESEARCH Pitfall 4)
 * and calls abort() to cancel in-flight streaming.
 *
 * Pure: no stdout writes. Tokens reset on 'done' so each turn starts fresh.
 */
import { useReducer, useEffect } from 'react';
import type { AgentLoop } from '../agent/agent-loop.js';
import type { NormalizedProduct } from '../data/normalizer.js';

export type AgentState = {
  tokens: string;
  products: NormalizedProduct[];
  status: 'idle' | 'running' | 'done' | 'error';
  error: { code: string; [key: string]: unknown } | null;
};

export type AgentAction =
  | { type: 'TOKEN'; delta: string }
  | { type: 'RESULT'; products: NormalizedProduct[] }
  | { type: 'ERROR'; error: { code: string; [key: string]: unknown } }
  | { type: 'DONE' }
  | { type: 'RESET' };

const initialState: AgentState = {
  tokens: '',
  products: [],
  status: 'idle',
  error: null,
};

function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'TOKEN':
      return { ...state, tokens: state.tokens + action.delta, status: 'running' };
    case 'RESULT':
      return { ...state, products: [...state.products, ...action.products], status: 'running' };
    case 'ERROR':
      return { ...state, error: action.error, status: 'error' };
    case 'DONE':
      return { ...state, tokens: '', status: 'done' };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useAgent(agentLoop: AgentLoop | null): AgentState {
  const [state, dispatch] = useReducer(agentReducer, initialState);

  useEffect(() => {
    if (!agentLoop) return;
    const onToken = (delta: string) => dispatch({ type: 'TOKEN', delta });
    const onResult = (products: NormalizedProduct[]) => dispatch({ type: 'RESULT', products });
    const onError = (error: { code: string; [key: string]: unknown }) =>
      dispatch({ type: 'ERROR', error });
    const onDone = () => dispatch({ type: 'DONE' });

    agentLoop.on('token', onToken);
    agentLoop.on('result', onResult);
    agentLoop.on('error', onError);
    agentLoop.on('done', onDone);

    return () => {
      agentLoop.off('token', onToken);
      agentLoop.off('result', onResult);
      agentLoop.off('error', onError);
      agentLoop.off('done', onDone);
      agentLoop.abort();
    };
  }, [agentLoop]);

  return state;
}
