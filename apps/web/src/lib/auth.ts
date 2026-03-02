/**
 * Better Auth server instance configuration.
 *
 * Configures Google OAuth, JWT-based session caching with 15-minute access
 * tokens and 30-day session lifetime (refresh window), plus hardened cookie
 * attributes. All secrets are sourced from environment variables -- nothing
 * is hardcoded.
 *
 * @see https://better-auth.com/docs/reference/options
 */
import { getDb, usersTable, sessionsTable, accountsTable } from '@laila/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

const isProduction = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Auth instance
// ---------------------------------------------------------------------------

export const auth = betterAuth({
  /**
   * Token signing / encryption secret.
   *
   * Better Auth also auto-reads BETTER_AUTH_SECRET from the environment, but
   * we pass it explicitly so the dependency is visible in code and linters
   * can flag a missing value early.
   *
   * Must be >= 32 characters of cryptographic randomness.
   * Generate with: `openssl rand -base64 32`
   */
  secret: process.env.BETTER_AUTH_SECRET,

  /**
   * Canonical base URL for OAuth callback redirects.
   *
   * Better Auth also auto-reads BETTER_AUTH_URL from the environment.
   * Development: http://localhost:3000
   * Production:  https://<your-domain>
   */
  baseURL: process.env.BETTER_AUTH_URL,

  // -------------------------------------------------------------------------
  // Social providers
  // -------------------------------------------------------------------------

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  // -------------------------------------------------------------------------
  // Session configuration
  //
  // Strategy: 30-day sessions with 15-minute JWT cookie cache.
  //
  // - `expiresIn` (30 days) is the total session lifetime stored in the
  //   database. This effectively acts as the "refresh token" window --
  //   as long as the session is not expired, the user can obtain a new
  //   short-lived access token without re-authenticating.
  //
  // - `cookieCache` holds a signed JWT in a short-lived cookie (15 min)
  //   that avoids a database round-trip on every request. When the cache
  //   expires, Better Auth transparently re-fetches the session from the
  //   database and issues a fresh cookie cache.
  //
  // - `updateAge` (24 h) controls how often the session's `expiresAt`
  //   timestamp is bumped forward, keeping active users logged in while
  //   allowing inactive sessions to naturally expire.
  // -------------------------------------------------------------------------

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days (seconds)
    updateAge: 60 * 60 * 24, // refresh session expiry every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 15, // 15-minute access token cache
      strategy: 'jwt', // JWT-encoded for interoperability
    },
  },

  // -------------------------------------------------------------------------
  // Advanced / cookie hardening
  //
  // Better Auth automatically marks cookies as httpOnly and secure in
  // production, but we set `defaultCookieAttributes` explicitly so the
  // security posture is auditable in code rather than implicit.
  // -------------------------------------------------------------------------

  advanced: {
    /**
     * Force the Secure flag on all auth cookies when running in production.
     * In development (localhost, no TLS) this is left off so cookies still
     * function over plain HTTP.
     */
    useSecureCookies: isProduction,

    /**
     * Default attributes applied to every auth cookie.
     *
     * - httpOnly: prevents JavaScript access (XSS mitigation)
     * - secure:   HTTPS-only transmission (conditionally enabled)
     * - sameSite:  "lax" blocks cross-origin POST requests while still
     *              allowing top-level navigations (OAuth redirects)
     * - path:     "/" ensures cookies are sent on all routes
     */
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    },
  },

  // -------------------------------------------------------------------------
  // Database adapter — Drizzle ORM with PostgreSQL (Neon)
  //
  // Connects Better Auth to the existing PostgreSQL database via the Drizzle
  // ORM adapter. The singleton client from `getDb()` is reused to avoid
  // creating duplicate connection pools.
  //
  // Schema mapping: Better Auth expects model names "user", "session", and
  // "account". Our Drizzle schema exports these as `usersTable`,
  // `sessionsTable`, and `accountsTable` respectively.
  //
  // Provider is set to "pg" so the adapter uses PostgreSQL-specific query
  // patterns (e.g. RETURNING clauses, native UUID support).
  // -------------------------------------------------------------------------

  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: usersTable,
      session: sessionsTable,
      account: accountsTable,
    },
  }),
});

// ---------------------------------------------------------------------------
// Type exports
//
// Inferred types from the auth instance for use across the application.
// These ensure type safety when accessing session data in API routes,
// middleware, and server-side rendering.
// ---------------------------------------------------------------------------

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
