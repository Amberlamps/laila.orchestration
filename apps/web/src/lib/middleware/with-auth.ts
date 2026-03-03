/**
 * @module with-auth
 *
 * Higher-order function that wraps Next.js API route handlers with
 * authentication enforcement. Detects the auth type (session cookie for
 * human users vs API key for execution agents), resolves the authenticated
 * context, and injects it into the request for downstream handlers.
 *
 * Each API route declares which authentication types it accepts:
 * - `'human'`  — session cookie only
 * - `'agent'`  — API key only
 * - `'both'`   — either auth type
 *
 * The middleware rejects unauthenticated requests with 401 and requests
 * using the wrong credential type with 403.
 */

import { auth } from '@/lib/auth';
import { validateApiKey } from '@/lib/middleware/api-key-validator';

import type { WorkerAuthContext } from '@/lib/middleware/api-key-validator';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The authenticated context for a human user session.
 * Populated from the Better Auth session data.
 */
export interface HumanAuthContext {
  /** Discriminator for distinguishing human auth from agent auth. */
  type: 'human';
  /** The user's UUID (primary key). */
  userId: string;
  /** The user's email address. */
  email: string;
  /** The user's display name. */
  name: string;
  /** The user's profile image URL, or null if not set. */
  image: string | null;
  /**
   * The tenant UUID. In this system, each user is their own tenant,
   * so tenantId equals userId.
   */
  tenantId: string;
}

/**
 * Union type for all possible authenticated contexts.
 * Downstream handlers receive one of these based on the auth type.
 * TypeScript's discriminated union on `type` enables type narrowing.
 */
export type AuthContext = HumanAuthContext | WorkerAuthContext;

/**
 * The allowed auth types that a route can declare.
 * - `'human'` — session cookie only
 * - `'agent'` — API key only
 * - `'both'`  — either auth type
 */
export type AllowedAuthType = 'human' | 'agent' | 'both';

/**
 * Extended request type that includes the resolved auth context.
 * Handlers wrapped with withAuth receive this instead of plain NextApiRequest.
 */
export interface AuthenticatedRequest extends NextApiRequest {
  /** The resolved authentication context for the current request. */
  auth: AuthContext;
}

/**
 * Type for the wrapped handler that receives the authenticated request.
 */
type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => Promise<void> | void;

// ---------------------------------------------------------------------------
// Session resolution helper
// ---------------------------------------------------------------------------

/**
 * Resolve a human user session from the request cookies.
 * Uses Better Auth's session API to validate the session cookie.
 * Returns null if no valid session exists.
 */
async function resolveSessionAuth(req: NextApiRequest): Promise<HumanAuthContext | null> {
  // Use Better Auth's API to get the session from the request.
  // This validates the JWT, checks expiry, and refreshes if needed.
  // Better Auth's `getSession` accepts `HeadersInit`, which includes
  // `Record<string, string>`. Node.js IncomingHttpHeaders is compatible
  // after casting since header values are strings for auth-related headers.
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

// ---------------------------------------------------------------------------
// withAuth HOF
// ---------------------------------------------------------------------------

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
 *   if (req.auth.type === "human") {
 *     // TypeScript narrows to HumanAuthContext
 *   } else {
 *     // TypeScript narrows to WorkerAuthContext
 *   }
 * });
 */
export function withAuth(allowedType: AllowedAuthType, handler: AuthenticatedHandler) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    // Attempt to resolve auth context from both sources.
    // We try both to distinguish "no credentials" (401) from
    // "wrong credential type" (403).
    let authContext: AuthContext | null = null;

    // Try session-based auth (human users).
    const sessionContext = await resolveSessionAuth(req);
    if (sessionContext) {
      authContext = sessionContext;
    }

    // Try API key auth (agents) if session auth didn't succeed.
    // Only one auth mechanism should succeed for a given request.
    if (!authContext) {
      const workerContext = await validateApiKey(req);
      if (workerContext) {
        authContext = workerContext;
      }
    }

    // No valid credentials found — return 401 Unauthorized.
    if (!authContext) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Credential type doesn't match what the route expects.
    // e.g., an API key was provided to a human-only route, or a
    // session cookie was provided to an agent-only route.
    if (allowedType !== 'both' && authContext.type !== allowedType) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Invalid credential type for this endpoint',
        },
      });
      return;
    }

    // Attach the auth context to the request and call the handler.
    (req as AuthenticatedRequest).auth = authContext;
    return handler(req as AuthenticatedRequest, res);
  };
}
