/**
 * @module with-protected-page
 *
 * Higher-order component for Next.js Pages Router that protects pages
 * requiring authentication. Wraps `getServerSideProps` to check the user's
 * session server-side and redirects unauthenticated users to `/sign-in`
 * while preserving the originally requested URL as a return parameter.
 *
 * This HOC is specifically for human users accessing the web UI.
 * Agent authentication is API-only and does not apply to page routes.
 *
 * @example
 * // Simple protected page -- just needs the user prop
 * export const getServerSideProps = withProtectedPage();
 *
 * @example
 * // Protected page with additional data loading
 * export const getServerSideProps = withProtectedPage(async (ctx, user) => {
 *   const projects = await getProjectsForUser(user.id);
 *   return { props: { projects } };
 * });
 */

import { auth } from '@/lib/auth';

import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The session data injected into page props by the HOC.
 * Pages wrapped with withProtectedPage receive this in their props.
 */
export interface ProtectedPageProps {
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
  };
}

// ---------------------------------------------------------------------------
// withProtectedPage HOC
// ---------------------------------------------------------------------------

/**
 * Wraps a `getServerSideProps` function with session authentication.
 * If the user is not authenticated, redirects to `/sign-in` with a
 * `returnUrl` query parameter pointing to the current page.
 *
 * The wrapped `getServerSideProps` receives the authenticated user
 * in the context, and the page component receives user data in props.
 *
 * @param getServerSidePropsFunc - Optional additional `getServerSideProps` logic.
 *   If provided, it runs after the session check succeeds and can add
 *   additional props. It receives the session user in the context.
 *   If it returns a redirect or notFound result, that result is passed
 *   through unmodified.
 *
 * @returns A `getServerSideProps` function compatible with Next.js Pages Router.
 */
export function withProtectedPage<P extends Record<string, unknown> = Record<string, never>>(
  getServerSidePropsFunc?: (
    ctx: GetServerSidePropsContext,
    user: ProtectedPageProps['user'],
  ) => Promise<GetServerSidePropsResult<P>>,
): GetServerSideProps<P & ProtectedPageProps> {
  return async (ctx: GetServerSidePropsContext) => {
    // Resolve the session from the request cookies using Better Auth.
    // This validates the JWT and checks token expiry. The same approach
    // is used in the API middleware (with-auth.ts) for consistency.
    const session = await auth.api.getSession({
      headers: ctx.req.headers as Record<string, string>,
    });

    // If no valid session exists, redirect to the sign-in page.
    // Include the current URL as returnUrl so the user can be
    // redirected back after successful authentication.
    // Uses ctx.resolvedUrl (not ctx.req.url) because resolvedUrl includes
    // the full path with query parameters and is properly resolved for
    // dynamic routes.
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
      // additionalResult.props may be a Promise<P> per Next.js types, so await it.
      const additionalProps = await additionalResult.props;
      return {
        props: {
          ...additionalProps,
          user,
        } as P & ProtectedPageProps,
      };
    }

    // No additional logic -- just return the user prop.
    return {
      props: { user } as P & ProtectedPageProps,
    };
  };
}
