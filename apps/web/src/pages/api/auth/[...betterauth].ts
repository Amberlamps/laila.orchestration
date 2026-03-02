/**
 * Catch-all API route that delegates all /api/auth/* requests to the Better
 * Auth server instance.
 *
 * Better Auth handles the following endpoints (among others):
 * - GET  /api/auth/signin/google    -- initiate Google OAuth flow
 * - GET  /api/auth/callback/google  -- handle OAuth callback
 * - GET  /api/auth/session          -- get current session
 * - POST /api/auth/signout          -- invalidate session
 *
 * @see https://better-auth.com/docs/integrations/next
 */
import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

export default toNextJsHandler(auth);
