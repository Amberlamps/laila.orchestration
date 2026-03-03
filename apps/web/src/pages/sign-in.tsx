/**
 * Sign-in page with Google OAuth authentication.
 *
 * Renders at `/sign-in` with a centered card layout, laila.works branding,
 * and a Google-branded sign-in button. Handles loading, error, and success
 * states during the OAuth flow.
 *
 * Public page: opts out of AppLayout via `getLayout` to render without
 * the sidebar/navigation shell.
 */
import { KeyRound } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { ErrorPage } from '@/components/error/error-page';
import { Card } from '@/components/ui/card';
import { signIn, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

import type { NextPageWithLayout } from './_app';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SignInStatus = 'idle' | 'loading' | 'error';

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

/** Maps Better Auth error codes from query params to user-friendly messages. */
const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallback: 'Authentication failed. Please try again.',
  OAuthAccountNotLinked: 'This email is already associated with another sign-in method.',
  AccessDenied: 'Access was denied. Please try again.',
  Default: 'Something went wrong. Please try again.',
};

/**
 * Resolve a human-readable error message from an error code string.
 * Falls back to a generic message for unrecognised codes.
 */
function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Return URL validation
// ---------------------------------------------------------------------------

/**
 * Validate and sanitise the `returnUrl` query parameter to prevent open
 * redirect attacks. Only relative URLs (starting with `/`) are allowed.
 * Absolute URLs or protocol-relative URLs are rejected in favour of the
 * default `/dashboard` destination.
 */
function getSafeReturnUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '/dashboard';
  const trimmed = raw.trim();
  // Must start with a single `/` (not `//` which is protocol-relative)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  return '/dashboard';
}

// ---------------------------------------------------------------------------
// Google "G" Logo SVG
// ---------------------------------------------------------------------------

/** Official Google "G" logo rendered as an inline SVG. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Spinner (loading indicator for Google button)
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-[18px] w-[18px] animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SignInPage Component
// ---------------------------------------------------------------------------

const SignInPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { data: session, isPending: isSessionLoading } = useSession();

  const [status, setStatus] = useState<SignInStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derive safe return URL from query parameters
  const returnUrl = getSafeReturnUrl(router.query.returnUrl);

  // Check if the user was redirected here due to session expiry
  const isSessionExpired = router.query.reason === 'session_expired';

  // ---------------------------------------------------------------------------
  // Handle ?error= query parameter from Better Auth callbacks
  // ---------------------------------------------------------------------------
  const oauthErrorCode = router.query.error;
  const hasOAuthError = typeof oauthErrorCode === 'string' && oauthErrorCode.length > 0;

  useEffect(() => {
    if (hasOAuthError) {
      setStatus('error');
      setErrorMessage(getErrorMessage(oauthErrorCode));
    }
  }, [hasOAuthError, oauthErrorCode]);

  // ---------------------------------------------------------------------------
  // Redirect authenticated users to the dashboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (session && !isSessionLoading) {
      void router.replace(returnUrl);
    }
  }, [session, isSessionLoading, returnUrl, router]);

  // ---------------------------------------------------------------------------
  // Google sign-in handler
  // ---------------------------------------------------------------------------
  const handleGoogleSignIn = useCallback(() => {
    setStatus('loading');
    setErrorMessage(null);

    void signIn
      .social({
        provider: 'google',
        callbackURL: returnUrl,
        errorCallbackURL: '/sign-in?error=OAuthCallback',
      })
      .then((result) => {
        if (result.error) {
          setStatus('error');
          setErrorMessage(
            typeof result.error.message === 'string' && result.error.message.length > 0
              ? result.error.message
              : 'Authentication failed. Please try again.',
          );
        }
      })
      .catch(() => {
        setStatus('error');
        setErrorMessage('Authentication failed. Please try again.');
      });
  }, [returnUrl]);

  // While checking session status, render nothing to avoid flash
  if (isSessionLoading) {
    return (
      <>
        <Head>
          <title>Sign In - laila.works</title>
        </Head>
        <div className="flex min-h-screen items-center justify-center bg-zinc-50" />
      </>
    );
  }

  // If already authenticated, show nothing while redirect is in progress
  if (session) {
    return (
      <>
        <Head>
          <title>Sign In - laila.works</title>
        </Head>
        <div className="flex min-h-screen items-center justify-center bg-zinc-50" />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // OAuth Error — full-page error when redirected back with ?error= param
  // ---------------------------------------------------------------------------
  if (hasOAuthError) {
    return (
      <>
        <Head>
          <title>Authentication Error - laila.works</title>
        </Head>
        <ErrorPage
          icon={KeyRound}
          title="Authentication Error"
          description={errorMessage ?? getErrorMessage(oauthErrorCode)}
          primaryAction={{ label: 'Try Again', href: '/sign-in' }}
        />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Sign In - laila.works</title>
        <meta name="description" content="Sign in to laila.works to orchestrate your AI workers." />
      </Head>

      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <Card className="w-full max-w-[400px] rounded-lg bg-white p-10 shadow-lg">
          {/* ----------------------------------------------------------------- */}
          {/* Branding                                                          */}
          {/* ----------------------------------------------------------------- */}
          <div className="mb-8 text-center">
            <h1 className="text-display text-zinc-900">laila.works</h1>
            <p className="text-body-lg mt-2 text-zinc-500">Orchestrate your AI workers</p>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* Session Expired Info Banner                                       */}
          {/* Shown when redirected from a protected page after session expiry  */}
          {/* ----------------------------------------------------------------- */}
          {isSessionExpired && (
            <div
              role="status"
              className="mb-4 rounded-r border-l-[3px] border-amber-500 bg-amber-50 p-3 text-sm text-amber-700"
            >
              Your session has expired. Please sign in again.
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* Google Sign-In Button                                             */}
          {/* Follows Google Identity Branding Guidelines:                      */}
          {/* - White background, 1px #747775 border, 40px height              */}
          {/* - Google "G" logo on the left, Roboto Medium text                */}
          {/* ----------------------------------------------------------------- */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={status === 'loading'}
            className={cn(
              'font-roboto flex h-10 w-full items-center justify-center gap-3 rounded border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] transition-colors',
              'hover:bg-[#f7f8f8] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-70',
            )}
          >
            {status === 'loading' ? (
              <>
                <Spinner className="text-[#747775]" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <GoogleLogo />
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          {/* ----------------------------------------------------------------- */}
          {/* Error Alert                                                       */}
          {/* ----------------------------------------------------------------- */}
          {status === 'error' && errorMessage && (
            <div
              role="alert"
              className="mt-4 rounded-r border-l-[3px] border-red-500 bg-red-50 p-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* Footer — Terms of Service                                         */}
          {/* ----------------------------------------------------------------- */}
          <p className="text-body-sm mt-6 text-center text-zinc-400">
            By signing in, you agree to our{' '}
            <a href="/terms" className="text-indigo-600 hover:underline">
              Terms of Service
            </a>
          </p>
        </Card>
      </div>
    </>
  );
};

/**
 * Opt out of the default AppLayout so the sign-in page renders as a
 * standalone page without sidebar/navigation.
 */
SignInPage.getLayout = (page: ReactElement) => page;

export default SignInPage;
