import path from 'node:path';

import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@laila/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@laila/database': path.resolve(__dirname, '../../packages/database/src'),
    },
  },
  test: {
    name: '@laila/dag-reconciler',
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
  },
});
