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
 * This project uses the Next.js Pages Router (`src/pages/api/*`), so we use
 * Better Auth's Node integration adapter to expose a default request handler.
 */
import { toNodeHandler } from 'better-auth/node';

import { auth } from '@/lib/auth';

export default toNodeHandler(auth);
