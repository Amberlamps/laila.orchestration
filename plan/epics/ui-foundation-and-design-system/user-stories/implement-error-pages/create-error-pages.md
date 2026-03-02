# Create Error Pages

## Task Details

- **Title:** Create Error Pages
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Error Pages](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Create four error pages with consistent styling: 404 (Not Found), 403 (Forbidden), 500 (Server Error), and OAuth Error. Each page uses a centered layout with an icon, title, body text explaining the situation, and CTA buttons for recovery actions.

### Shared Layout

All error pages share a common layout:
- **Background:** zinc-50
- **Container:** Centered vertically and horizontally, max-width 480px
- **Icon:** 64px Lucide icon in zinc-300
- **Error Code:** Display typography (30px, bold, zinc-300) — e.g., "404"
- **Title:** H1 typography (24px, semibold, zinc-900)
- **Body:** Body typography (14px, zinc-500), max-width 400px, text-center
- **CTA Buttons:** Stacked vertically with 8px gap. Primary button + optional secondary link.

### Page Specifications

1. **404 — Not Found** (`pages/404.tsx`)
   - Icon: Lucide `FileQuestion`
   - Title: "Page Not Found"
   - Body: "The page you're looking for doesn't exist or has been moved."
   - Primary CTA: "Go to Dashboard" (links to `/dashboard`)
   - Secondary: "Go Back" (calls `router.back()`)

2. **403 — Forbidden** (`pages/403.tsx` or rendered conditionally)
   - Icon: Lucide `ShieldX`
   - Title: "Access Denied"
   - Body: "You don't have permission to access this resource. Contact your administrator if you believe this is an error."
   - Primary CTA: "Go to Dashboard" (links to `/dashboard`)

3. **500 — Server Error** (`pages/500.tsx` or `pages/_error.tsx`)
   - Icon: Lucide `ServerCrash`
   - Title: "Something Went Wrong"
   - Body: "An unexpected error occurred. Our team has been notified. Please try again."
   - Primary CTA: "Try Again" (calls `router.reload()`)
   - Secondary: "Go to Dashboard" (links to `/dashboard`)

4. **OAuth Error** (rendered on `/sign-in` when `?error=` query param is present)
   - Icon: Lucide `KeyRound`
   - Title: "Authentication Error"
   - Body: Dynamic message based on error code (e.g., "The authentication provider returned an error. Please try signing in again.")
   - Primary CTA: "Try Again" (links to `/sign-in` without error param)

```tsx
// apps/web/src/components/error/error-page.tsx
// Shared error page layout used by 404, 403, 500, and OAuth error pages.
// Provides consistent visual treatment for all error states.
import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ErrorPageProps {
  /** Lucide icon component for the error illustration */
  icon: LucideIcon;
  /** HTTP status code (displayed as large faded text) */
  code?: string;
  /** Error title (e.g., "Page Not Found") */
  title: string;
  /** Error description */
  description: string;
  /** Primary CTA button */
  primaryAction: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Optional secondary action */
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function ErrorPage({
  icon: Icon,
  code,
  title,
  description,
  primaryAction,
  secondaryAction,
}: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="text-center max-w-[480px]">
        <Icon className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
        {code && (
          <p className="text-display text-zinc-300 mb-2">{code}</p>
        )}
        <h1 className="text-h1 text-zinc-900 mb-3">{title}</h1>
        <p className="text-body text-zinc-500 max-w-[400px] mx-auto mb-8">
          {description}
        </p>
        <div className="flex flex-col items-center gap-2">
          {primaryAction.href ? (
            <Button asChild>
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          ) : (
            <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Button variant="ghost" asChild>
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : (
              <Button variant="ghost" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] 404 page renders at the Next.js default 404 route (`pages/404.tsx`)
- [ ] 500 page renders at the Next.js default 500 route (`pages/500.tsx`)
- [ ] 403 page is available as a reusable component (rendered conditionally when API returns 403)
- [ ] OAuth error is displayed on the sign-in page when `?error=` query parameter is present
- [ ] All error pages use consistent centered layout on zinc-50 background
- [ ] Error icon renders at 64px in zinc-300
- [ ] Error code (404, 500) renders in Display typography in zinc-300 (faded)
- [ ] Title uses H1 typography (24px, semibold, zinc-900)
- [ ] Description uses Body typography (14px, zinc-500), centered, max-width 400px
- [ ] Primary CTA button uses default variant (indigo-500 bg)
- [ ] Secondary action uses ghost variant
- [ ] 404: "Go to Dashboard" button links to `/dashboard`, "Go Back" calls `router.back()`
- [ ] 500: "Try Again" calls `router.reload()`, "Go to Dashboard" links to `/dashboard`
- [ ] All error pages have appropriate `<title>` meta tags
- [ ] Shared `ErrorPage` component is reusable for all four error types
- [ ] Error pages are responsive on mobile

## Technical Notes

- Next.js automatically routes to `pages/404.tsx` for pages that do not exist and to `pages/500.tsx` for server-side rendering errors. These are the conventional file locations.
- For the 403 page, Next.js does not have a built-in 403 route. Handle this by rendering the 403 error component conditionally when the API returns a 403 status in the page component.
- The OAuth error page is not a separate route — it is a state of the sign-in page. When the `?error=` query parameter is present, show the error state instead of the default sign-in form.
- The `ErrorPage` component uses the `asChild` pattern from shadcn `Button` to render `Link` as the button element, maintaining proper keyboard and screen reader semantics.
- Consider using `_error.tsx` (custom error page) for more control over error rendering, though `404.tsx` and `500.tsx` are simpler for the common cases.

## References

- **Design Specification:** Section 4.4 (Error Pages), Section 4.4.1 (Error Page Layout)
- **Functional Requirements:** FR-UI-015 (error pages), FR-UI-016 (error recovery CTAs)
- **Next.js Docs:** Custom error pages (404.tsx, 500.tsx, _error.tsx)
- **Lucide Icons Docs:** FileQuestion, ShieldX, ServerCrash, KeyRound icons

## Estimated Complexity

Low — Error pages are simple static layouts with minimal logic. The shared `ErrorPage` component makes all four pages straightforward to implement.
