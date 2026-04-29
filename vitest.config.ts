import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    pool: 'forks',
    globals: false,
    testTimeout: 15000,
    typecheck: { tsconfig: './tsconfig.test.json' },
    // Setup file runs in each worker before tests — sets IS_REACT_ACT_ENVIRONMENT
    // global to suppress React 19 "not configured to support act()" warnings.
    setupFiles: ['./tests/setup.ts'],
  },
});
