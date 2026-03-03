/**
 * @module authorization
 *
 * Authorization helpers that enforce access control after authentication.
 *
 * This system has two authorization models:
 *
 * 1. **Human (owner-scoped):** Human users can only access resources within
 *    their own tenant. Since `tenant_id = user_id` in this system, all queries
 *    must be scoped to `WHERE tenant_id = authContext.tenantId`.
 *
 * 2. **Worker (project-access scoped):** Execution agents can only access
 *    resources within projects they have been explicitly granted access to
 *    via the `worker_project_access` table.
 *
 * These helpers are called by API route handlers after `withAuth` has resolved
 * the auth context. They return either an authorized scope (for query filtering)
 * or a denial with a descriptive reason.
 */

import type { WorkerAuthContext } from './api-key-validator';
import type { AuthContext, HumanAuthContext } from './with-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The authorization scope that downstream queries use to filter data.
 * Ensures all database queries are properly scoped by tenant and,
 * for workers, by project access list.
 */
export interface AuthorizationScope {
  /** The tenant ID to scope all queries to. */
  tenantId: string;
  /**
   * For workers: the specific project IDs they can access.
   * For humans: null (they can access all their own projects).
   */
  projectIds: string[] | null;
}

/**
 * Result of an authorization check.
 * Either authorized with the scoping context, or denied with a reason.
 */
export type AuthorizationResult =
  | { authorized: true; scope: AuthorizationScope }
  | { authorized: false; reason: string };

// ---------------------------------------------------------------------------
// Custom Error
// ---------------------------------------------------------------------------

/**
 * Custom error class for authorization failures.
 * API error handlers can catch this and return 403 Forbidden.
 */
export class AuthorizationError extends Error {
  readonly code = 'FORBIDDEN' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the authorization scope for a human user.
 * Humans can access all projects within their tenant (projectIds = null).
 */
const buildHumanScope = (authContext: HumanAuthContext): AuthorizationScope => ({
  tenantId: authContext.tenantId,
  projectIds: null,
});

/**
 * Build the authorization scope for a worker agent.
 * Workers can only access explicitly granted projects.
 */
const buildWorkerScope = (authContext: WorkerAuthContext): AuthorizationScope => ({
  tenantId: authContext.tenantId,
  projectIds: authContext.projectAccess,
});

/**
 * Exhaustive check helper. If TypeScript narrows the discriminant to `never`,
 * this function is unreachable. If a new auth type is added without updating
 * the call site, TypeScript will produce a compile error here.
 */
const assertNever = (value: never): never => {
  throw new Error(`Unhandled auth type: ${String(value)}`);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if the authenticated context has access to a specific project.
 *
 * For human users: the project must belong to their tenant (tenant_id = user_id).
 * For workers: the project must be in their projectAccess list AND belong to
 * the same tenant.
 *
 * @param authContext - The resolved auth context from withAuth
 * @param projectTenantId - The tenant_id of the project being accessed
 * @param projectId - The ID of the project being accessed
 * @returns Authorization result with scope on success, or denial reason on failure
 */
export const authorizeProjectAccess = (
  authContext: AuthContext,
  projectTenantId: string,
  projectId: string,
): AuthorizationResult => {
  switch (authContext.type) {
    case 'human': {
      if (projectTenantId !== authContext.tenantId) {
        return {
          authorized: false,
          reason: 'You do not have access to this project',
        };
      }

      return {
        authorized: true,
        scope: buildHumanScope(authContext),
      };
    }

    case 'agent': {
      // The worker must belong to the same tenant as the project.
      if (projectTenantId !== authContext.tenantId) {
        return {
          authorized: false,
          reason: 'Worker does not belong to this tenant',
        };
      }

      // The worker must have explicit access to this specific project.
      if (!authContext.projectAccess.includes(projectId)) {
        return {
          authorized: false,
          reason: 'Worker does not have access to this project',
        };
      }

      return {
        authorized: true,
        scope: buildWorkerScope(authContext),
      };
    }

    default: {
      // Exhaustive check — ensures all auth types are handled.
      // If a new type is added to AuthContext, TypeScript will error here.
      const _exhaustive: never = authContext;
      return assertNever(_exhaustive);
    }
  }
};

/**
 * Check if the authenticated context has access to a specific resource
 * by its tenant_id. This is the simplest authorization check — it
 * verifies the resource belongs to the same tenant.
 *
 * Used for non-project-scoped resources (e.g., listing own workers).
 *
 * @param authContext - The resolved auth context from withAuth
 * @param resourceTenantId - The tenant_id of the resource being accessed
 * @returns Authorization result with scope on success, or denial reason on failure
 */
export const authorizeTenantAccess = (
  authContext: AuthContext,
  resourceTenantId: string,
): AuthorizationResult => {
  if (authContext.tenantId !== resourceTenantId) {
    return {
      authorized: false,
      reason: 'You do not have access to this resource',
    };
  }

  switch (authContext.type) {
    case 'human':
      return {
        authorized: true,
        scope: buildHumanScope(authContext),
      };

    case 'agent':
      return {
        authorized: true,
        scope: buildWorkerScope(authContext),
      };

    default: {
      const _exhaustive: never = authContext;
      return assertNever(_exhaustive);
    }
  }
};

/**
 * Build a query scope object for Drizzle queries.
 * Ensures all database queries are properly filtered by tenant
 * and (for workers) by project access.
 *
 * @param authContext - The resolved auth context from withAuth
 * @returns The authorization scope for downstream queries
 *
 * @example
 * const scope = buildQueryScope(req.auth);
 * const projects = await db.query.projects.findMany({
 *   where: eq(projects.tenantId, scope.tenantId),
 * });
 */
export const buildQueryScope = (authContext: AuthContext): AuthorizationScope => {
  switch (authContext.type) {
    case 'human':
      return buildHumanScope(authContext);

    case 'agent':
      return buildWorkerScope(authContext);

    default: {
      const _exhaustive: never = authContext;
      return assertNever(_exhaustive);
    }
  }
};

/**
 * Assert that the auth context is a human user.
 * Throws a typed AuthorizationError if the context is an agent.
 *
 * Used in routes that should only be called by human users
 * but are wrapped with `withAuth("both")`.
 *
 * @param authContext - The resolved auth context from withAuth
 * @throws {AuthorizationError} If the context is not a human user
 */
export const assertHumanAuth = (
  authContext: AuthContext,
): asserts authContext is HumanAuthContext => {
  if (authContext.type !== 'human') {
    throw new AuthorizationError('This action requires human authentication');
  }
};

/**
 * Assert that the auth context is a worker agent.
 * Throws a typed AuthorizationError if the context is a human user.
 *
 * Used in routes that should only be called by agents
 * but are wrapped with `withAuth("both")`.
 *
 * @param authContext - The resolved auth context from withAuth
 * @throws {AuthorizationError} If the context is not a worker agent
 */
export const assertAgentAuth = (
  authContext: AuthContext,
): asserts authContext is WorkerAuthContext => {
  if (authContext.type !== 'agent') {
    throw new AuthorizationError('This action requires agent authentication');
  }
};
