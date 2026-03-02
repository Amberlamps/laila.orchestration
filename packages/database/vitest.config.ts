import path from 'node:path';

import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@laila/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  test: {
    name: '@laila/database',
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
  },
});
