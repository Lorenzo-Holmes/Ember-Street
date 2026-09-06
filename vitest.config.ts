import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Local release snapshots under output/ must not masquerade as current tests.
  test: { include: ['tests/**/*.test.ts', 'qa/playtest/**/*.test.ts'] },
});
