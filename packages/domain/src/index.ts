/**
 * @module @laila/domain
 *
 * Central barrel export for the domain package. Re-exports all
 * orchestration, DAG, status, and validation modules.
 *
 * This is the core business logic package -- it depends only on
 * @laila/shared for types and schemas, and never on framework-specific
 * code (no Next.js, no HTTP, no database drivers).
 *
 * For better tree-shaking, consumers can also import directly from
 * sub-paths:
 *   - `@laila/domain/orchestration`
 *   - `@laila/domain/dag`
 *   - `@laila/domain/status`
 *   - `@laila/domain/validation`
 */

export * from './orchestration';
export * from './dag';
export * from './status';
export * from './validation';
