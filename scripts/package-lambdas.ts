/**
 * Lambda packaging script for Terraform deployment.
 *
 * Creates zip archives from the built function bundles in functions/{name}/dist.
 * Output: deploy/functions/{function-name}.zip
 *
 * Each function is bundled by tsup into a self-contained dist/ directory.
 * This script zips those directories for use with Terraform's
 * aws_lambda_function resource (filename attribute).
 *
 * Usage: tsx scripts/package-lambdas.ts
 */

import { createWriteStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import archiver from 'archiver';

const BACKGROUND_FUNCTIONS = [
  'timeout-checker',
  'dag-reconciler',
  'audit-archiver',
  'status-propagation',
] as const;

const OUTPUT_DIR = resolve('deploy/functions');

// OpenNext outputs the server function directory here (buildOutputPath + .open-next)
const OPENNEXT_SERVER_DIR = resolve('apps/web/.open-next/server-functions/default');

async function packageFunction(name: string): Promise<void> {
  const distDir = resolve('functions', name, 'dist');

  // Verify the dist directory exists before attempting to package
  try {
    await access(distDir);
  } catch {
    throw new Error(
      `dist directory not found for "${name}" at ${distDir}. Run "pnpm build:lambdas" first.`,
    );
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const outputPath = resolve(OUTPUT_DIR, `${name}.zip`);

  return new Promise<void>((promiseResolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const bytes = archive.pointer();

      console.log(`  ${name}.zip (${formatBytes(bytes)})`);
      promiseResolve();
    });

    archive.on('error', (err: Error) => {
      reject(err);
    });

    archive.pipe(output);
    // Add all files from dist/ at the root of the zip (false = no subdirectory)
    archive.directory(distDir, false);
    void archive.finalize();
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

async function packageOpenNextServer(): Promise<void> {
  try {
    await access(OPENNEXT_SERVER_DIR);
  } catch {
    throw new Error(
      `OpenNext server function not found at ${OPENNEXT_SERVER_DIR}. Run "pnpm build:open-next" first.`,
    );
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const outputPath = resolve(OUTPUT_DIR, 'nextjs-server.zip');

  return new Promise<void>((promiseResolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const bytes = archive.pointer();

      console.log(`  nextjs-server.zip (${formatBytes(bytes)})`);
      promiseResolve();
    });

    archive.on('error', (err: Error) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(OPENNEXT_SERVER_DIR, false);
    void archive.finalize();
  });
}

async function main(): Promise<void> {
  console.log('Packaging Lambda functions...\n');

  await Promise.all([...BACKGROUND_FUNCTIONS.map(packageFunction), packageOpenNextServer()]);

  console.log(`\nAll functions packaged to ${OUTPUT_DIR}`);
}

void main().catch((err: unknown) => {
  console.error('Failed to package Lambda functions:', err);
  process.exit(1);
});
