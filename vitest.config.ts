import { defineConfig } from 'vitest/config';

import { supporterPlugin, supporterWanted } from './packages/client/supporterPlugin.js';

export default defineConfig({
  // The private supporter styles' own tests, and theirs in place of the stub, where checked out.
  plugins: [supporterPlugin(supporterWanted('test'))],
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'tools/*/src/**/*.test.ts',
      'supporter/src/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});
