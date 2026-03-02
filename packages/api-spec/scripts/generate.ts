/**
 * generate.ts — OpenAPI type generation and freshness check script
 *
 * Usage:
 *   npx tsx scripts/generate.ts          — Regenerate TypeScript types from openapi.yaml
 *   npx tsx scripts/generate.ts --check  — Verify generated types are up-to-date (CI mode)
 *
 * The freshness check compares a SHA-256 hash of the newly generated output
 * against the committed version in generated/api.ts. A mismatch indicates the
 * spec was modified without re-running generation.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');

const SPEC_PATH = resolve(packageRoot, 'openapi.yaml');
const OUTPUT_PATH = resolve(packageRoot, 'generated', 'api.ts');
const TEMP_PATH = resolve(packageRoot, 'generated', '.api.tmp.ts');

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const generate = (): void => {
  console.log('Generating TypeScript types from OpenAPI spec...');
  execSync(`npx openapi-typescript ${SPEC_PATH} -o ${OUTPUT_PATH}`, {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  console.log(`Types written to ${OUTPUT_PATH}`);
};

const checkFreshness = (): void => {
  if (!existsSync(OUTPUT_PATH)) {
    console.error('ERROR: generated/api.ts does not exist. Run `pnpm generate` first.');
    process.exit(1);
  }

  const committedContent = readFileSync(OUTPUT_PATH, 'utf-8');
  const committedHash = sha256(committedContent);

  // Generate to a temporary file so we never mutate the committed output
  console.log('Regenerating types to compare against committed version...');
  execSync(`npx openapi-typescript ${SPEC_PATH} -o ${TEMP_PATH}`, {
    cwd: packageRoot,
    stdio: 'pipe',
  });

  const freshContent = readFileSync(TEMP_PATH, 'utf-8');
  const freshHash = sha256(freshContent);

  // Always clean up the temporary file
  unlinkSync(TEMP_PATH);

  if (committedHash !== freshHash) {
    console.error('ERROR: Generated types are stale. Run `pnpm generate` and commit the result.');
    process.exit(1);
  }

  console.log('Generated types are up-to-date.');
};

const isCheckMode = process.argv.includes('--check');

if (isCheckMode) {
  checkFreshness();
} else {
  generate();
}
