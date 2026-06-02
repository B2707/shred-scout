// Configure React 19 act() environment for vitest.
// IS_REACT_ACT_ENVIRONMENT is a global variable that React checks to determine
// whether it's running in a test environment that supports act().
// Without this, React logs a warning whenever act() is called.
// See: https://github.com/reactwg/react-18/discussions/102
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
  true;
