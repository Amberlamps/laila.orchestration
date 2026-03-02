# Implement Sign-In Page

## Task Details

- **Title:** Implement Sign-In Page
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Authentication UI](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build the sign-in page at `/sign-in` that serves as the entry point for user authentication. The page uses a centered card layout with the laila.works branding and a Google OAuth sign-in button following Google's brand guidelines.

### Visual Specification

- **Page Background:** neutral-50 (zinc-50)
- **Card:** Centered both vertically and horizontally, max-width 400px, white bg, 8px radius, shadow-lg, 40px padding
- **Branding Section:**
  - laila.works wordmark in Display typography (30px, bold, zinc-900)
  - Tagline: "Orchestrate your AI workers" in Body Large (16px, zinc-500)
  - 32px gap below branding
- **Google Sign-In Button:** Full-width, follows Google brand guidelines (white bg, Google "G" logo, "Sign in with Google" text, 1px #747775 border, 40px height, Roboto font for text)
- **Footer:** Terms of Service link in Body Small (13px, zinc-400), bottom of card

### States

1. **Default:** Google sign-in button enabled, ready for interaction
2. **Loading:** Button disabled, shows spinner + "Signing in..." text, prevent double-click
3. **Error:** Inline alert below the button with red-50 bg, red-700 text, red-500 left border. Display error message (e.g., "Authentication failed. Please try again.")
4. **Success:** Redirect to dashboard (or preserved return URL) after successful authentication

```tsx
// apps/web/src/pages/sign-in.tsx
// Sign-in page with Google OAuth authentication.
// Handles loading, error, and success states during the OAuth flow.
import { useRouter } from "next/router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SignInPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The returnUrl query parameter preserves the user's intended destination
  // after authentication. Defaults to /dashboard if not specified.
  const returnUrl = (router.query.returnUrl as string) ?? "/dashboard";

  async function handleGoogleSignIn() {
    setStatus("loading");
    setErrorMessage(null);
    try {
      // Trigger Better Auth's Google OAuth flow.
      // This redirects the user to Google's consent screen.
      // On success, Better Auth handles the callback and sets the session cookie.
      window.location.href = `/api/auth/signin/google?callbackUrl=${encodeURIComponent(returnUrl)}`;
    } catch (error) {
      setStatus("error");
      setErrorMessage("Authentication failed. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-[400px] p-10">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-display text-zinc-900">laila.works</h1>
          <p className="text-body-lg text-zinc-500 mt-2">
            Orchestrate your AI workers
          </p>
        </div>

        {/* Google Sign-In Button */}
        {/* ... */}

        {/* Error Alert */}
        {status === "error" && errorMessage && (
          <div role="alert" className="mt-4 p-3 bg-red-50 border-l-3 border-red-500 rounded-r text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-body-sm text-zinc-400">
          By signing in, you agree to our{" "}
          <a href="/terms" className="text-indigo-600 hover:underline">
            Terms of Service
          </a>
        </p>
      </Card>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] Sign-in page renders at `/sign-in` route
- [ ] Page has zinc-50 background with centered card (max-width 400px, white, 8px radius, shadow-lg)
- [ ] laila.works wordmark displays in Display typography (30px, bold, zinc-900)
- [ ] Tagline "Orchestrate your AI workers" displays in Body Large (16px, zinc-500)
- [ ] Google sign-in button follows Google brand guidelines (white bg, "G" logo, correct text, border)
- [ ] Default state: button is enabled and clickable
- [ ] Loading state: button is disabled, shows spinner and "Signing in..." text
- [ ] Error state: inline alert appears below button with red styling and error message
- [ ] Success state: redirects to `/dashboard` or preserved `returnUrl` query parameter
- [ ] Page is accessible without authentication (no redirect loop)
- [ ] Page redirects authenticated users to dashboard (already signed in)
- [ ] Terms of Service link is present in the card footer
- [ ] Page is responsive on mobile (card takes full width minus padding)
- [ ] No layout shift during state transitions
- [ ] Error alert has `role="alert"` for screen reader announcement
- [ ] Page has appropriate `<title>` and meta tags for SEO

## Technical Notes

- The Google OAuth flow is initiated by redirecting the user to Better Auth's Google sign-in endpoint. This is a full-page redirect, not an AJAX call. The loading state covers the brief period before the redirect occurs.
- The `returnUrl` parameter should be validated to prevent open redirect attacks. Only allow relative URLs or URLs on the same origin.
- The Google sign-in button must follow Google's branding requirements: specific colors, font (Roboto), logo placement, minimum touch target size. See Google's Identity Branding Guidelines.
- If the user arrives at `/sign-in` with an error query parameter (e.g., `?error=OAuthCallback`), display an appropriate error message. Better Auth may include error information in the callback URL.
- For the Google "G" logo, use an SVG or the official Google Identity Services icon. Do not use a Lucide icon replacement.

## References

- **Design Specification:** Section 4.1 (Sign-In Page), Section 4.1.1 (Google OAuth Button)
- **Functional Requirements:** FR-AUTH-001 (Google OAuth sign-in), FR-AUTH-005 (sign-in page states)
- **Google Identity Branding Guidelines:** Button styling, logo usage
- **Better Auth Docs:** Social provider sign-in flow, callback handling

## Estimated Complexity

Medium — The page itself is simple, but correctly implementing the Google OAuth flow with all four states (default, loading, error, success), following Google brand guidelines for the button, and handling return URL preservation requires careful attention.
