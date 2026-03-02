# Implement Auth API Route

## Task Details

- **Title:** Implement Auth API Route
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Configure Better Auth with Google OAuth](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Set Up Better Auth Server, Configure Drizzle Auth Adapter

## Description

Create the Next.js Pages Router catch-all API route that delegates all authentication requests to Better Auth. This route handles the Google OAuth initiation, callback, session management, sign-out, and any other auth-related endpoints that Better Auth exposes.

In Next.js Pages Router, a catch-all route at `pages/api/auth/[...betterauth].ts` will match any path under `/api/auth/` and forward the request to Better Auth's request handler. This single route replaces the need for individual OAuth callback, sign-in, sign-out, and session endpoints.

```typescript
// pages/api/auth/[...betterauth].ts
// Catch-all API route that delegates all /api/auth/* requests
// to the Better Auth server instance. Better Auth handles:
// - GET /api/auth/signin/google — initiate Google OAuth flow
// - GET /api/auth/callback/google — handle OAuth callback
// - GET /api/auth/session — get current session
// - POST /api/auth/signout — invalidate session
import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// toNextJsHandler converts Better Auth's web-standard handler
// into a Next.js Pages Router compatible API handler.
export default toNextJsHandler(auth);
```

Additionally, create a client-side auth utility that components can use to interact with the auth endpoints:

```typescript
// packages/web/src/lib/auth-client.ts
// Client-side auth utilities for initiating sign-in,
// checking session status, and signing out.
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // baseURL defaults to the current origin, which works
  // for both development and production environments.
});

// Export typed hooks for use in React components.
export const { signIn, signOut, useSession } = authClient;
```

## Acceptance Criteria

- [ ] `pages/api/auth/[...betterauth].ts` exists and exports the Better Auth handler
- [ ] `toNextJsHandler` is used to adapt Better Auth's handler to Next.js Pages Router format
- [ ] GET `/api/auth/session` returns the current session or null
- [ ] GET `/api/auth/signin/google` redirects to Google OAuth consent screen
- [ ] GET `/api/auth/callback/google` handles the OAuth callback and creates a session
- [ ] POST `/api/auth/signout` invalidates the current session and clears cookies
- [ ] Client-side auth utility is created at `packages/web/src/lib/auth-client.ts`
- [ ] `signIn`, `signOut`, and `useSession` are exported from the client utility
- [ ] The route handles both GET and POST methods as required by Better Auth
- [ ] Error responses follow the application's standard error format (JSON with error code and message)
- [ ] CORS headers are not set on auth routes (same-origin only)

## Technical Notes

- Better Auth's `toNextJsHandler` function adapts the web-standard `Request`/`Response` API to Next.js's `NextApiRequest`/`NextApiResponse`. This is required for Pages Router compatibility.
- If using Next.js API routes with custom body parsing, ensure `bodyParser` is not disabled for this route, as Better Auth needs to read POST bodies for sign-out and other operations.
- The catch-all route uses the `[...betterauth]` naming convention. The parameter name must match what Better Auth expects — check the documentation for the exact naming requirement.
- The client-side `createAuthClient` automatically discovers endpoints at `/api/auth/*` relative to the current origin. No explicit base URL is needed unless the auth API is hosted on a different domain.
- Consider adding request logging (at debug level) to the auth route for troubleshooting OAuth flows during development.
- The `useSession` hook from Better Auth provides reactive session state in React components, automatically handling token refresh.

## References

- **Functional Requirements:** FR-AUTH-004 (auth API endpoints), FR-AUTH-005 (OAuth callback handling)
- **Design Specification:** Section 4.1.3 (Auth API Route), Section 4.1.4 (Client-side Auth)
- **Project Setup:** Next.js Pages Router API routes, Better Auth Next.js integration

## Estimated Complexity

Small — This is a thin integration layer. The catch-all route is essentially a one-liner that delegates to Better Auth. The client-side utility is similarly straightforward. The main complexity is ensuring the Next.js Pages Router adapter works correctly.
