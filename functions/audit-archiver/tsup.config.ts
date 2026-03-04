/**
 * tsup build configuration for the audit-archiver Lambda function.
 *
 * Produces a single ESM bundle with all dependencies inlined.
 * Target: Node.js 22.x on ARM64 (Graviton2).
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/handler.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // Bundle all dependencies into a single file for Lambda deployment.
  // This eliminates the need for node_modules in the deployment package.
  bundle: true,
  // Tree-shake unused code for smaller bundle size and faster cold starts.
  treeshake: true,
  // Source maps for debugging in CloudWatch/X-Ray.
  sourcemap: true,
  // Minify for smaller deployment package.
  minify: true,
  // Bundle ALL dependencies (workspace packages + node_modules) into the
  // output so the Lambda deployment package is fully self-contained.
  noExternal: [/.*/],
  external: [],
  // Disable code splitting — produce a single file for Lambda deployment.
  splitting: false,
});
