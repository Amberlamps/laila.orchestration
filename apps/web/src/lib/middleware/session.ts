/**
 * @module session
 *
 * Lightweight session validation for authenticating human users in API routes.
 *
 * Reads the session token from cookies or the Authorization header, looks it
 * up in the sessions table, and returns the authenticated user record if valid.
 *
 * Returns `null` for all failure cases without leaking details.
 */

import { getDb, sessionsTable, usersTable } from '@laila/database';
import { eq, and, gt } from 'drizzle-orm';

import type { NextApiRequest } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The authenticated user context returned after successful session validation. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cookie name used by Better Auth for session tokens. */
const SESSION_COOKIE_NAME = 'better-auth.session_token';

/** Alternative: Bearer token prefix for API-style session auth. */
const BEARER_PREFIX = 'Bearer ';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the session token from the request.
 * Checks cookies first, then falls back to Authorization header.
 */
const extractSessionToken = (req: NextApiRequest): string | null => {
  // Check cookies (primary path for browser-based requests).
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.split('=');
      if (name === SESSION_COOKIE_NAME) {
        const value = valueParts.join('=');
        if (value.length > 0) {
          return value;
        }
      }
    }
  }

  // Fallback: check Authorization header for session-based Bearer token.
  // This is distinct from API key auth (which uses lw_ prefixed keys).
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith(BEARER_PREFIX)) {
    const token = authHeader.slice(BEARER_PREFIX.length);
    // Only treat as session token if it does NOT look like an API key.
    if (!token.startsWith('lw_')) {
      return token;
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate the session from the request and return the authenticated user.
 *
 * Returns `null` if no valid session is found (missing token, expired, or
 * no matching session record).
 *
 * @param req - The incoming Next.js API request
 * @returns The authenticated user, or `null` if not authenticated
 */
export const getAuthenticatedUser = async (
  req: NextApiRequest,
): Promise<AuthenticatedUser | null> => {
  const token = extractSessionToken(req);
  if (!token) {
    return null;
  }

  const db = getDb();

  // Look up the session by token, ensuring it has not expired.
  const results = await db
    .select({
      userId: sessionsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  const session = results[0];
  if (!session) {
    return null;
  }

  return {
    id: session.userId,
    name: session.userName,
    email: session.userEmail,
  };
};
