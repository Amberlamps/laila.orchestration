# Set Up Better Auth Server

## Task Details

- **Title:** Set Up Better Auth Server
- **Status:** Not Started
- **Assigned Agent:** security-engineer
- **Parent User Story:** [Configure Better Auth with Google OAuth](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** None

## Description

Install the Better Auth library and configure the server-side auth instance with Google OAuth as the identity provider. This is the foundational auth configuration that all other auth tasks build upon.

The Better Auth server instance should be created in a shared auth configuration file (e.g., `packages/web/src/lib/auth.ts`) and export the configured `auth` object. The configuration must include:

1. **Google OAuth Provider:** Configure `socialProviders.google` with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables. Set the callback URL to `/api/auth/callback/google`.

2. **Session Configuration:**
   - Use JWT-based sessions with a 15-minute access token expiry
   - Configure 30-day refresh tokens for seamless session renewal
   - Enable automatic token refresh on API requests

3. **Cookie Configuration:**
   - `HttpOnly: true` — prevent JavaScript access to session cookies
   - `Secure: true` — only transmit over HTTPS (conditionally disabled in development)
   - `SameSite: "lax"` — protect against CSRF while allowing top-level navigations
   - Set appropriate cookie name prefix (e.g., `__Host-` in production for additional security)

4. **Secret Configuration:** Use `BETTER_AUTH_SECRET` environment variable for signing tokens and encrypting session data. This must be a cryptographically random string of at least 32 characters.

5. **Base URL:** Configure `BETTER_AUTH_URL` (or `NEXTAUTH_URL` for compatibility) to set the canonical base URL for callback redirects.

```typescript
// packages/web/src/lib/auth.ts
// Configure the Better Auth server instance with Google OAuth,
// JWT sessions, and secure cookie settings.
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // BETTER_AUTH_SECRET is used for token signing and encryption.
  // Must be at least 32 characters of cryptographic randomness.
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    // 15-minute JWT access tokens with 30-day refresh tokens.
    // Access tokens are short-lived to limit exposure window.
    // Refresh tokens enable seamless re-authentication.
    expiresIn: 60 * 15,         // 15 minutes in seconds
    updateAge: 60 * 60 * 24,    // update session age every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,           // cache cookie for 5 minutes
    },
  },
  // Additional configuration for database adapter will be
  // added in the configure-drizzle-auth-adapter task.
});
```

## Acceptance Criteria

- [ ] `better-auth` package is installed as a dependency in the web workspace package
- [ ] Auth server instance is exported from `packages/web/src/lib/auth.ts`
- [ ] Google OAuth provider is configured with environment variable references for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- [ ] Session is configured with 15-minute JWT expiry and 30-day refresh token support
- [ ] Cookie settings enforce `HttpOnly: true`, `Secure: true` (production), `SameSite: "lax"`
- [ ] `BETTER_AUTH_SECRET` environment variable is referenced for token signing
- [ ] `BETTER_AUTH_URL` environment variable is referenced for base URL configuration
- [ ] Environment variable template (`.env.example`) is updated with all required auth variables
- [ ] TypeScript types are properly inferred from the Better Auth configuration
- [ ] No secrets are hardcoded — all sensitive values come from environment variables

## Technical Notes

- Better Auth v1.x uses a builder pattern for configuration. Ensure the version installed matches the API used in configuration.
- The `secret` must be at least 32 characters. Add a startup validation check or document this requirement clearly.
- In development, `Secure: false` is acceptable since localhost does not use HTTPS. Use `process.env.NODE_ENV` to conditionally set this.
- Better Auth automatically handles the OAuth callback flow, token exchange, and user creation/linking when configured with a database adapter.
- The Google OAuth consent screen must be configured in Google Cloud Console with the correct redirect URI. Document this in the environment setup guide.
- Consider using `@better-auth/cli` to generate the auth schema if the Drizzle adapter requires specific table structures.

## References

- **Functional Requirements:** FR-AUTH-001 (Google OAuth authentication), FR-AUTH-002 (session management)
- **Design Specification:** Section 4.1 (Authentication Architecture), Section 4.1.1 (Better Auth Configuration)
- **Project Setup:** Environment variables configuration, auth package setup

## Estimated Complexity

Medium — Better Auth configuration is well-documented, but correctly setting up Google OAuth with JWT sessions, refresh tokens, and secure cookie settings requires careful attention to security parameters and environment variable management.
