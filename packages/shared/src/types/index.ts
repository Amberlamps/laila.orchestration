/**
 * @module @laila/shared/types
 *
 * TypeScript types inferred from Zod schemas and additional utility types
 * shared across the monorepo. Domain entity types are derived using
 * `z.infer<typeof schema>` to keep runtime validation and static types
 * in sync.
 *
 * This module must remain free of Node.js-specific APIs so it can be used
 * in both server and browser contexts.
 */

export type {
  Nullable,
  WithTimestamps,
  WithSoftDelete,
  WithOptimisticLock,
  TenantScoped,
} from './utility';

// Orchestration assignment types (derived from Zod schemas)
export type {
  AssignRequest,
  AssignResponse,
  AssignedResponse,
  BlockedResponse,
  AllCompleteResponse,
  AssignedStoryDetail,
  AssignedTaskDetail,
  BlockingStoryInfo,
  TaskDependencyInfo,
  TaskPersonaInfo,
  AssignedEpicInfo,
} from './orchestration';
