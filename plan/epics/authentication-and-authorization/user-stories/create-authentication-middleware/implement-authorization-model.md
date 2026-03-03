# Implement Authorization Model

## Task Details

- **Title:** Implement Authorization Model
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Create Authentication Middleware](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Implement withAuth Higher-Order Function

## Description

Implement the authorization logic that enforces access control after authentication succeeds. This system has two authorization models:

1. **Human (owner-scoped):** Human users can only access resources within their own tenant. Since `tenant_id = user_id` in this system, all queries must be scoped to `WHERE tenant_id = authContext.tenantId`.

2. **Worker (project-access scoped):** Execution agents can only access resources within projects they have been explicitly granted access to via the `worker_project_access` table.

### Authorization Helpers

Create a set of reusable authorization helper functions that API route handlers call after the `withAuth` middleware has resolved the auth context.

```typescript
// packages/web/src/lib/middleware/authorization.ts
// Authorization helpers that enforce access control after authentication.
// Human users are owner-scoped (tenant_id = user_id).
// Workers are project-access scoped (via worker_project_access table).
import type { AuthContext, HumanAuthContext, WorkerAuthContext } from './with-auth';

// Result of an authorization check.
// Either authorized with the scoping context, or denied with a reason.
export type AuthorizationResult =
  | { authorized: true; scope: AuthorizationScope }
  | { authorized: false; reason: string };

// The authorization scope that downstream queries use to filter data.
// Ensures all database queries are properly scoped.
export interface AuthorizationScope {
  // The tenant ID to scope all queries to.
  tenantId: string;
  // For workers: the specific project IDs they can access.
  // For humans: null (they can access all their own projects).
  projectIds: string[] | null;
}

/**
 * Check if the authenticated context has access to a specific project.
 *
 * For human users: the project must belong to their tenant (tenant_id = user_id).
 * For workers: the project must be in their projectAccess list.
 *
 * @param authContext - The resolved auth context from withAuth
 * @param projectTenantId - The tenant_id of the project being accessed
 * @param projectId - The ID of the project being accessed
 */
export function authorizeProjectAccess(
  authContext: AuthContext,
  projectTenantId: string,
  projectId: string,
): AuthorizationResult {
  if (authContext.type === 'human') {
    // Human users can only access their own tenant's projects.
    // tenant_id = user_id in this system.
    if (projectTenantId !== authContext.tenantId) {
      return {
        authorized: false,
        reason: 'You do not have access to this project',
      };
    }
    return {
      authorized: true,
      scope: { tenantId: authContext.tenantId, projectIds: null },
    };
  }

  // Worker (agent) authorization: check project-level access.
  if (authContext.type === 'agent') {
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
      scope: {
        tenantId: authContext.tenantId,
        projectIds: authContext.projectAccess,
      },
    };
  }

  // Exhaustive check — should never reach here.
  const _exhaustive: never = authContext;
  return { authorized: false, reason: 'Unknown auth type' };
}

/**
 * Check if the authenticated context has access to a specific resource
 * by its tenant_id. This is the simplest authorization check — just
 * verifies the resource belongs to the same tenant.
 *
 * Used for non-project-scoped resources (e.g., listing own workers).
 */
export function authorizeTenantAccess(
  authContext: AuthContext,
  resourceTenantId: string,
): AuthorizationResult {
  if (authContext.tenantId !== resourceTenantId) {
    return {
      authorized: false,
      reason: 'You do not have access to this resource',
    };
  }

  return {
    authorized: true,
    scope: {
      tenantId: authContext.tenantId,
      projectIds: authContext.type === 'agent' ? authContext.projectAccess : null,
    },
  };
}

/**
 * Build a WHERE clause scope object for Drizzle queries.
 * Ensures all database queries are properly filtered by tenant
 * and (for workers) by project access.
 *
 * @example
 * const scope = buildQueryScope(req.auth);
 * const projects = await db.query.projects.findMany({
 *   where: eq(projects.tenantId, scope.tenantId),
 * });
 */
export function buildQueryScope(authContext: AuthContext): AuthorizationScope {
  return {
    tenantId: authContext.tenantId,
    projectIds: authContext.type === 'agent' ? authContext.projectAccess : null,
  };
}

/**
 * Assert that the auth context is a human user.
 * Throws a typed error if the context is an agent.
 * Used in routes that should only be called by human users
 * but are wrapped with withAuth("both") for some reason.
 */
export function assertHumanAuth(authContext: AuthContext): asserts authContext is HumanAuthContext {
  if (authContext.type !== 'human') {
    throw new AuthorizationError('This action requires human authentication');
  }
}

/**
 * Assert that the auth context is a worker agent.
 * Throws a typed error if the context is a human user.
 */
export function assertAgentAuth(
  authContext: AuthContext,
): asserts authContext is WorkerAuthContext {
  if (authContext.type !== 'agent') {
    throw new AuthorizationError('This action requires agent authentication');
  }
}

// Custom error class for authorization failures.
// API error handlers can catch this and return 403.
export class AuthorizationError extends Error {
  readonly code = 'FORBIDDEN' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}
```

## Acceptance Criteria

- [ ] `authorizeProjectAccess()` grants human users access to projects within their own tenant
- [ ] `authorizeProjectAccess()` denies human users access to projects in other tenants
- [ ] `authorizeProjectAccess()` grants workers access to explicitly authorized projects
- [ ] `authorizeProjectAccess()` denies workers access to projects not in their `projectAccess` list
- [ ] `authorizeProjectAccess()` denies workers access to projects in different tenants
- [ ] `authorizeTenantAccess()` grants access when tenant IDs match, denies when they differ
- [ ] `buildQueryScope()` returns correct scope for both human and agent auth contexts
- [ ] `assertHumanAuth()` passes for human contexts and throws `AuthorizationError` for agents
- [ ] `assertAgentAuth()` passes for agent contexts and throws `AuthorizationError` for humans
- [ ] `AuthorizationError` has a `code` property set to `"FORBIDDEN"`
- [ ] All authorization checks use the exhaustive pattern (TypeScript `never` check) for the auth type discriminant
- [ ] Authorization denial reasons are descriptive but do not leak internal details
- [ ] No `any` types used in the implementation
- [ ] All types are properly exported for downstream consumption

## Technical Notes

- The `tenant_id = user_id` model means each human user is effectively a single tenant. This simplifies authorization to a single equality check on `tenant_id`.
- Workers have a many-to-many relationship with projects via `worker_project_access`. The project access list is loaded during API key validation and included in the `WorkerAuthContext`.
- The `AuthorizationScope` type is designed to be used directly in Drizzle query WHERE clauses. The `projectIds` field being `null` for humans means "all projects in this tenant" (no project-level filtering needed).
- The exhaustive `never` check ensures that if a new auth type is added in the future, TypeScript will produce a compile error at all authorization check sites, forcing them to be updated.
- Consider adding audit logging for authorization denials — this helps detect misconfigured workers or potential security issues.
- The `AuthorizationError` class can be caught by a global error handler in the API layer to automatically return 403 responses.

## References

- **Functional Requirements:** FR-AUTH-030 (owner-scoped access), FR-AUTH-031 (project-scoped worker access)
- **Design Specification:** Section 4.3.2 (Authorization Model), Section 4.3.3 (Scope-based Query Filtering)
- **Project Setup:** TypeScript discriminated unions, Drizzle query patterns

## Estimated Complexity

Medium — The authorization model is conceptually simple (tenant scoping + project access lists) but requires careful implementation of the scope computation, type assertions, and exhaustive type checks. The main challenge is ensuring every data access path uses the authorization scope correctly.
