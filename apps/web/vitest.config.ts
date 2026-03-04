import path from 'node:path';

import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@laila/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@laila/domain': path.resolve(__dirname, '../../packages/domain/src'),
      '@laila/database': path.resolve(__dirname, '../../packages/database/src'),
      '@laila/logger': path.resolve(__dirname, '../../packages/logger/src'),
      '@laila/metrics': path.resolve(__dirname, '../../packages/metrics/src'),
      'drizzle-orm': path.resolve(__dirname, '../../packages/database/node_modules/drizzle-orm'),
    },
  },
  test: {
    name: '@laila/web',
    environment: 'jsdom',
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    passWithNoTests: true,
  },
});
