/**
 * Client-side auth utilities for interacting with the Better Auth API.
 *
 * Uses `createAuthClient` from `better-auth/react` which provides
 * React-specific hooks (e.g. `useSession`) with reactive state management
 * built on top of nanostores.
 *
 * The client automatically discovers auth endpoints at `/api/auth/*`
 * relative to the current origin, so no explicit base URL is required
 * unless the auth API is hosted on a different domain.
 *
 * @example
 * ```tsx
 * import { useSession, signIn, signOut } from "@/lib/auth-client";
 *
 * function AuthButton() {
 *   const { data: session, isPending } = useSession();
 *
 *   if (isPending) return <span>Loading...</span>;
 *
 *   if (session) {
 *     return <button onClick={() => signOut()}>Sign out</button>;
 *   }
 *
 *   return (
 *     <button onClick={() => signIn.social({ provider: "google" })}>
 *       Sign in with Google
 *     </button>
 *   );
 * }
 * ```
 */
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // baseURL defaults to the current origin, which works for both
  // development (http://localhost:3000) and production environments.
});

/**
 * Typed exports for use in React components.
 *
 * - `signIn`     -- Initiate an authentication flow (e.g. `signIn.social({ provider: "google" })`)
 * - `signOut`    -- Invalidate the current session and clear cookies
 * - `useSession` -- React hook returning reactive session state (`data`, `isPending`, `error`)
 */
export const { signIn, signOut, useSession } = authClient;
