/**
 * @module @laila/shared/constants
 *
 * Application-wide constants including status enums, error codes,
 * API key prefixes, and other immutable values shared across the monorepo.
 *
 * This module must remain free of Node.js-specific APIs so it can be used
 * in both server and browser contexts.
 */

export {
  projectLifecycleStatusSchema,
  type ProjectLifecycleStatus,
  PROJECT_LIFECYCLE_STATUSES,
  workStatusSchema,
  type WorkStatus,
  WORK_STATUSES,
} from './status';

export { prioritySchema, type Priority, PRIORITIES } from './priority';

export { errorCodeSchema, type ErrorCode, ERROR_CODES } from './error-codes';

export { API_KEY_PREFIX, API_VERSION, DEFAULT_PAGINATION_LIMIT, MAX_PAGINATION_LIMIT } from './api';
