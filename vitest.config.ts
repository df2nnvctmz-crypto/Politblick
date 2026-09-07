import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts rather than adding a `test` key to it: nothing
// under test renders JSX, so the tests need neither the React plugin nor a DOM, and keeping
// the build config untouched means a change to the test setup can never alter the shipped
// bundle.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
