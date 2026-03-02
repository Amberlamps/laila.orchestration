# Set Up TanStack Query Provider

## Task Details

- **Title:** Set Up TanStack Query Provider
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Configure Tailwind CSS & shadcn/ui](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Configure TanStack Query v5 (React Query) as the data fetching and server state management layer for the application. Set up the `QueryClientProvider` in `_app.tsx` with default options tailored to the laila.works orchestration dashboard requirements.

The orchestration dashboard needs to poll for work status updates, so the default options should include a 15-second refetch interval that pauses when the browser tab is in the background. Window focus refetch should be enabled so stale data is refreshed when the user returns to the tab.

```typescript
// apps/web/src/lib/query-client.ts
// Singleton QueryClient with default options for the orchestration dashboard.
// Polling interval of 15s keeps work status reasonably fresh without overloading the API.
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Poll every 15 seconds for work status updates.
        // Pause polling when the tab is backgrounded to save bandwidth.
        refetchInterval: 15_000,
        refetchIntervalInBackground: false,

        // Refetch when the browser tab regains focus to catch up on missed updates.
        refetchOnWindowFocus: true,

        // Stale time of 10 seconds — data is considered fresh for 10s after fetch.
        // This prevents duplicate requests during rapid navigation.
        staleTime: 10_000,

        // Retry failed requests up to 2 times with exponential backoff.
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      },
      mutations: {
        // Do not retry mutations by default — let the user explicitly retry.
        retry: false,
      },
    },
  });
}
```

```tsx
// apps/web/src/pages/_app.tsx
// Wrap the application in QueryClientProvider to enable TanStack Query hooks
// in all pages and components. Use useState to ensure the QueryClient is
// created once per app instance (not shared across SSR requests).
import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createQueryClient } from "@/lib/query-client";

export default function App({ Component, pageProps }: AppProps) {
  // Create QueryClient once per app lifecycle.
  // useState ensures the same instance is reused across re-renders.
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <Component {...pageProps} />
      {/* Devtools only render in development — automatically removed in production */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

## Acceptance Criteria

- [ ] `@tanstack/react-query` and `@tanstack/react-query-devtools` are installed as dependencies
- [ ] `QueryClient` is created via a factory function in `apps/web/src/lib/query-client.ts`
- [ ] `QueryClientProvider` wraps the application in `_app.tsx`
- [ ] Default `refetchInterval` is set to 15,000ms (15 seconds)
- [ ] `refetchIntervalInBackground` is set to `false` (pause polling when tab is backgrounded)
- [ ] `refetchOnWindowFocus` is set to `true` (refetch on tab focus)
- [ ] `staleTime` is configured to prevent duplicate requests during rapid navigation
- [ ] Failed queries retry up to 2 times with exponential backoff
- [ ] Mutations do not retry by default
- [ ] `QueryClient` is created with `useState` to avoid sharing across SSR requests
- [ ] React Query Devtools are included and only visible in development
- [ ] Application builds and renders without errors

## Technical Notes

- TanStack Query v5 uses a different import path (`@tanstack/react-query`) than v4 and has breaking API changes. Ensure all imports and usage match v5 syntax.
- The `QueryClient` must be created inside the component tree (via `useState`) rather than at module scope to prevent sharing state between server-side rendered requests in Next.js.
- The 15-second refetch interval is a balance between data freshness and API load. Individual queries can override this with their own `refetchInterval` option.
- React Query Devtools are automatically tree-shaken from production builds, so there is no bundle size impact.
- Consider adding a `gcTime` (garbage collection time, formerly `cacheTime` in v4) default if memory usage becomes a concern.

## References

- **Design Specification:** Section 5.1 (Data Fetching Strategy), Section 5.1.1 (Polling Configuration)
- **Functional Requirements:** FR-DASH-001 (real-time status updates), NFR-PERF-002 (efficient data fetching)
- **TanStack Query v5 Docs:** QueryClient configuration, QueryClientProvider, default options

## Estimated Complexity

Low — TanStack Query provider setup is a well-documented pattern. The main consideration is choosing appropriate default options for the orchestration dashboard polling requirements.
