# Implement Protected Route HOC

## Task Details

- **Title:** Implement Protected Route HOC
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Create Authentication Middleware](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Implement withAuth Higher-Order Function

## Description

Create a `withProtectedPage` higher-order component (HOC) for Next.js Pages Router that protects pages requiring authentication. The HOC checks the user's session server-side via `getServerSideProps` and redirects unauthenticated users to `/sign-in` while preserving the originally requested URL as a return parameter.

This HOC is specifically for human users accessing the web UI. Agent authentication is API-only and does not apply to page routes.

### Server-Side Session Check

The HOC wraps `getServerSideProps` to check the session before rendering the page:

```typescript
// packages/web/src/lib/middleware/with-protected-page.ts
// Higher-order component for Next.js pages that require authentication.
// Checks the session server-side and redirects to /sign-in if unauthenticated.
// Preserves the return URL so the user is redirected back after sign-in.
import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { auth } from '@/lib/auth';

// The session data injected into page props by the HOC.
// Pages wrapped with withProtectedPage receive this in their props.
export interface ProtectedPageProps {
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
  };
}

/**
 * Wraps a getServerSideProps function with session authentication.
 * If the user is not authenticated, redirects to /sign-in with a
 * returnUrl query parameter pointing to the current page.
 *
 * The wrapped getServerSideProps receives the authenticated user
 * in the context, and the page component receives user data in props.
 *
 * @param getServerSidePropsFunc - Optional additional getServerSideProps logic.
 *   If provided, it runs after the session check succeeds and can add
 *   additional props. It receives the session user in the context.
 *
 * @example
 * // Simple protected page — just needs the user prop
 * export const getServerSideProps = withProtectedPage();
 *
 * @example
 * // Protected page with additional data loading
 * export const getServerSideProps = withProtectedPage(async (ctx, user) => {
 *   const projects = await getProjectsForUser(user.id);
 *   return { props: { projects } };
 * });
 */
export function withProtectedPage<P extends Record<string, unknown> = Record<string, never>>(
  getServerSidePropsFunc?: (
    ctx: GetServerSidePropsContext,
    user: ProtectedPageProps['user'],
  ) => Promise<GetServerSidePropsResult<P>>,
): GetServerSideProps<P & ProtectedPageProps> {
  return async (ctx: GetServerSidePropsContext) => {
    // Resolve the session from the request cookies using Better Auth.
    // This validates the JWT and checks token expiry.
    const session = await auth.api.getSession({
      headers: ctx.req.headers as Record<string, string>,
    });

    // If no valid session exists, redirect to the sign-in page.
    // Include the current URL as returnUrl so the user can be
    // redirected back after successful authentication.
    if (!session?.user) {
      const returnUrl = encodeURIComponent(ctx.resolvedUrl);
      return {
        redirect: {
          destination: `/sign-in?returnUrl=${returnUrl}`,
          permanent: false, // 302 temporary redirect
        },
      };
    }

    // Build the user prop from the session data.
    const user: ProtectedPageProps['user'] = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
    };

    // If additional getServerSideProps logic is provided, run it.
    if (getServerSidePropsFunc) {
      const additionalResult = await getServerSidePropsFunc(ctx, user);

      // If the additional logic returns a redirect or notFound,
      // pass it through without modification.
      if ('redirect' in additionalResult || 'notFound' in additionalResult) {
        return additionalResult;
      }

      // Merge the user prop with any additional props.
      return {
        props: {
          ...additionalResult.props,
          user,
        } as P & ProtectedPageProps,
      };
    }

    // No additional logic — just return the user prop.
    return {
      props: { user } as P & ProtectedPageProps,
    };
  };
}
```

### Sign-In Page Return URL Handling

The sign-in page should read the `returnUrl` query parameter and redirect to it after successful authentication:

```typescript
// Example: In the sign-in page's OAuth callback handler
// After successful Google OAuth sign-in:
const returnUrl = router.query.returnUrl as string | undefined;
const redirectTo = returnUrl ? decodeURIComponent(returnUrl) : '/dashboard';
router.push(redirectTo);
```

## Acceptance Criteria

- [ ] `withProtectedPage()` HOC is exported from `packages/web/src/lib/middleware/with-protected-page.ts`
- [ ] Unauthenticated users are redirected to `/sign-in` with a 302 temporary redirect
- [ ] The `returnUrl` query parameter contains the URL-encoded originally requested page path
- [ ] Authenticated users receive their session data in the `user` prop
- [ ] The `user` prop includes `id`, `email`, `name`, and `image` fields
- [ ] Optional `getServerSidePropsFunc` callback runs after successful session check
- [ ] Additional props from the callback are merged with the `user` prop
- [ ] Redirects and notFound results from the callback are passed through unmodified
- [ ] `ctx.resolvedUrl` is used (not `ctx.req.url`) to get the full path including query parameters
- [ ] The HOC is compatible with Next.js Pages Router `getServerSideProps` type signature
- [ ] TypeScript generics correctly type the combined props (user + additional)
- [ ] No `any` types used in the implementation

## Technical Notes

- Use `ctx.resolvedUrl` instead of `ctx.req.url` because `resolvedUrl` includes the full path with query parameters and is properly resolved for dynamic routes.
- The return URL must be URL-encoded with `encodeURIComponent()` to safely pass as a query parameter. It must be decoded on the sign-in page before use.
- **Security:** Validate the `returnUrl` on the sign-in page to prevent open redirect attacks. Only allow redirects to paths on the same origin (i.e., paths starting with `/`). Reject absolute URLs or URLs pointing to external domains.
- The `permanent: false` setting produces a 302 redirect, which is appropriate for auth redirects (the resource exists, but the user needs to authenticate first).
- Consider adding a loading state or flash message on the sign-in page when redirected (e.g., "Please sign in to continue").
- The session check uses Better Auth's `auth.api.getSession()` — the same method used in the API middleware, ensuring consistent session resolution.
- TypeScript generics (`P extends Record<string, unknown>`) allow pages to declare additional prop types that are merged with `ProtectedPageProps`.

## References

- **Functional Requirements:** FR-AUTH-040 (protected page routes), FR-AUTH-041 (return URL preservation)
- **Design Specification:** Section 4.3.4 (Protected Page HOC), Section 5.1 (Sign-in Flow)
- **Project Setup:** Next.js Pages Router getServerSideProps, Better Auth server API

## Estimated Complexity

Medium — The HOC pattern is well-established, but the TypeScript generics for merging prop types, handling the optional callback's various return types (props/redirect/notFound), and security considerations for the return URL add meaningful complexity.
