/**
 * @module @laila/shared
 *
 * Central barrel export for the shared package. Re-exports all schemas,
 * types, constants, and utilities for convenient access.
 *
 * For better tree-shaking, consumers can also import directly from
 * sub-paths:
 *   - `@laila/shared/schemas`
 *   - `@laila/shared/types`
 *   - `@laila/shared/constants`
 *   - `@laila/shared/utils`
 */

export * from './schemas';
export * from './types';
export * from './constants';
export * from './utils';
export * from './errors';
