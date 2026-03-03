// Singleton QueryClient with default options for the orchestration dashboard.
// Polling interval of 15s keeps work status reasonably fresh without overloading the API.
import { QueryClient } from '@tanstack/react-query';

export const createQueryClient = (): QueryClient =>
  new QueryClient({
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
