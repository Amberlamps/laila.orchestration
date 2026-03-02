/**
 * @module @laila/shared/schemas
 *
 * Zod validation schemas for all domain entities and API contracts.
 * Schemas serve as the single source of truth for data shapes — TypeScript
 * types are derived from them via `z.infer<typeof schema>`.
 *
 * This module must remain free of Node.js-specific APIs so it can be used
 * in both server and browser contexts.
 */

export {};
