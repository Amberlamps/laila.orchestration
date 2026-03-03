# Implement withAuth Higher-Order Function

## Task Details

- **Title:** Implement withAuth Higher-Order Function
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Create Authentication Middleware](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** None

## Description

Create the `withAuth` higher-order function (HOF) that wraps Next.js API route handlers to enforce authentication. This is the core middleware abstraction that detects the authentication type (session cookie for human users vs API key for execution agents), resolves the authenticated context, and injects it into the request for downstream handlers.

Each API route declares which authentication types it accepts: `'human'` (session cookie only), `'agent'` (API key only), or `'both'` (either). The middleware rejects requests that don't match the declared type.

### Architecture

The `withAuth` HOF wraps a standard Next.js API handler and:

1. Attempts to resolve the auth context from session cookie (via Better Auth) or API key (via prefix-based validation)
2. Rejects unauthenticated requests with 401
3. Rejects requests with the wrong credential type with 403
4. Injects the resolved auth context into the request for the wrapped handler

```typescript
// packages/web/src/lib/middleware/with-auth.ts
// Higher-order function that wraps Next.js API routes with
// authentication enforcement. Detects auth type, resolves context,
// and rejects unauthorized requests.
import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { validateApiKey, type WorkerAuthContext } from '@/lib/middleware/api-key-validator';

// The authenticated context for a human user session.
// Populated from the Better Auth session data.
export interface HumanAuthContext {
  type: 'human';
  userId: string;
  email: string;
  name: string;
  image: string | null;
  // In this system, tenant_id equals user_id (single-tenant per user).
  tenantId: string;
}

// Union type for all possible authenticated contexts.
// Downstream handlers receive one of these based on the auth type.
export type AuthContext = HumanAuthContext | WorkerAuthContext;

// The allowed auth types that a route can declare.
// 'human' = session cookie only, 'agent' = API key only, 'both' = either.
export type AllowedAuthType = 'human' | 'agent' | 'both';

// Extended request type that includes the resolved auth context.
// Handlers wrapped with withAuth receive this instead of plain NextApiRequest.
export interface AuthenticatedRequest extends NextApiRequest {
  auth: AuthContext;
}

// Type for the wrapped handler that receives the authenticated request.
type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => Promise<void> | void;

/**
 * Higher-order function that wraps an API route handler with authentication.
 *
 * @param allowedType - Which auth types this route accepts: 'human', 'agent', or 'both'
 * @param handler - The API route handler that receives the authenticated request
 * @returns A standard Next.js API handler with auth enforcement
 *
 * @example
 * // Route that only accepts human session auth
 * export default withAuth("human", async (req, res) => {
 *   const user = req.auth; // type: HumanAuthContext
 *   res.json({ userId: user.userId });
 * });
 *
 * @example
 * // Route that only accepts agent API key auth
 * export default withAuth("agent", async (req, res) => {
 *   const worker = req.auth; // type: WorkerAuthContext
 *   res.json({ workerId: worker.workerId });
 * });
 *
 * @example
 * // Route that accepts either auth type
 * export default withAuth("both", async (req, res) => {
 *   if (req.auth.type === "human") { /* human logic * / }
 *   else { /* agent logic * / }
 * });
 */
export function withAuth(allowedType: AllowedAuthType, handler: AuthenticatedHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Attempt to resolve auth context from both sources.
    // Only one should succeed for a given request.
    let authContext: AuthContext | null = null;

    // Try session-based auth (human users) if allowed.
    if (allowedType === 'human' || allowedType === 'both') {
      const session = await resolveSessionAuth(req);
      if (session) {
        authContext = session;
      }
    }

    // Try API key auth (agents) if allowed and session auth didn't succeed.
    if (!authContext && (allowedType === 'agent' || allowedType === 'both')) {
      const workerContext = await validateApiKey(req);
      if (workerContext) {
        authContext = workerContext;
      }
    }

    // No valid credentials found — return 401 Unauthorized.
    if (!authContext) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    // Credential type doesn't match what the route expects.
    // e.g., an API key was provided to a human-only route.
    if (allowedType !== 'both' && authContext.type !== allowedType) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Invalid credential type for this endpoint',
        },
      });
    }

    // Attach the auth context to the request and call the handler.
    (req as AuthenticatedRequest).auth = authContext;
    return handler(req as AuthenticatedRequest, res);
  };
}
```

### Session Resolution Helper

```typescript
/**
 * Resolve a human user session from the request cookies.
 * Uses Better Auth's session API to validate the session cookie.
 * Returns null if no valid session exists.
 */
async function resolveSessionAuth(req: NextApiRequest): Promise<HumanAuthContext | null> {
  // Use Better Auth's API to get the session from the request.
  // This validates the JWT, checks expiry, and refreshes if needed.
  const session = await auth.api.getSession({
    headers: req.headers as Record<string, string>,
  });

  if (!session?.user) {
    return null;
  }

  return {
    type: 'human',
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
    // In this system, each user is their own tenant.
    tenantId: session.user.id,
  };
}
```

## Acceptance Criteria

- [ ] `withAuth("human", handler)` allows session cookie auth and rejects API key auth
- [ ] `withAuth("agent", handler)` allows API key auth and rejects session cookie auth
- [ ] `withAuth("both", handler)` allows either auth type
- [ ] Unauthenticated requests receive 401 with `UNAUTHORIZED` error code
- [ ] Wrong credential type receives 403 with `FORBIDDEN` error code
- [ ] Authenticated request includes the `auth` property with the resolved context
- [ ] `HumanAuthContext` includes userId, email, name, image, and tenantId
- [ ] `WorkerAuthContext` includes workerId, workerName, tenantId, and projectAccess
- [ ] Error responses follow the standard JSON error format: `{ error: { code, message } }`
- [ ] TypeScript types are properly defined and exported for downstream consumers
- [ ] Session resolution uses Better Auth's session API to validate cookies
- [ ] No `any` types in the implementation

## Technical Notes

- Better Auth's `auth.api.getSession()` method accepts a headers object and returns the session if valid. This is the server-side session resolution method for API routes.
- The `withAuth` HOF pattern is similar to Next.js middleware but applied at the route level. This gives each route explicit control over its auth requirements.
- Consider adding rate limiting awareness — if a request has already been rate-limited by an upstream middleware, the auth middleware should not process it.
- The `tenantId` for human users equals their `userId` because this system uses a single-tenant-per-user model. This simplifies authorization checks to `WHERE tenant_id = authContext.tenantId`.
- TypeScript's discriminated union on `AuthContext.type` enables type narrowing in handlers. After checking `req.auth.type === "human"`, TypeScript knows the full `HumanAuthContext` type.

## References

- **Functional Requirements:** FR-AUTH-020 (unified auth middleware), FR-AUTH-021 (dual auth support)
- **Design Specification:** Section 4.3 (Auth Middleware Architecture), Section 4.3.1 (withAuth HOF)
- **Project Setup:** Next.js API route patterns, Better Auth server API

## Estimated Complexity

Large — This is the central auth abstraction that all protected API routes depend on. It must correctly handle two different auth mechanisms, produce a type-safe discriminated union, and integrate with both Better Auth sessions and the custom API key system. Error handling and type design require careful thought.
