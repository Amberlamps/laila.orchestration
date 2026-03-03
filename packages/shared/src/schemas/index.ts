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

export { projectSchema, type Project } from './project';
export { epicSchema, type Epic } from './epic';
export { userStorySchema, type UserStory } from './user-story';
export { taskSchema, taskReferenceSchema, type Task, type TaskReference } from './task';
export { workerSchema, type Worker } from './worker';
export { personaSchema, type Persona } from './persona';

// API request/response schemas
export * from './api';

// Pagination response factory and backwards-compatible aliases
export {
  paginationResponseMetaSchema,
  type PaginationResponseMeta,
  paginatedResponseSchema,
} from './pagination';

// Error envelope schemas
export {
  fieldErrorSchema,
  type FieldError,
  errorEnvelopeSchema,
  type ErrorEnvelope,
} from './error';

// Orchestration assignment schemas
export {
  assignRequestSchema,
  type AssignRequest,
  assignResponseSchema,
  type AssignResponse,
  assignedResponseSchema,
  type AssignedResponse,
  blockedResponseSchema,
  type BlockedResponse,
  allCompleteResponseSchema,
  type AllCompleteResponse,
  assignedStoryDetailSchema,
  type AssignedStoryDetail,
  assignedTaskDetailSchema,
  type AssignedTaskDetail,
  blockingStoryInfoSchema,
  type BlockingStoryInfo,
  taskDependencyInfoSchema,
  type TaskDependencyInfo,
  taskPersonaInfoSchema,
  type TaskPersonaInfo,
  assignedEpicInfoSchema,
  type AssignedEpicInfo,
  storyFailSchema,
  type StoryFailRequest,
  storyCompleteSchema,
  type StoryCompleteRequest,
  storyResetSchema,
  type StoryResetRequest,
} from './orchestration';

// Audit event schemas
export {
  auditActionSchema,
  type AuditAction,
  auditActorTypeSchema,
  type AuditActorType,
  auditChangeDiffSchema,
  type AuditChangeDiff,
  auditEventSchema,
  type AuditEvent,
} from './audit';
