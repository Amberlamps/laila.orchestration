import '../styles/globals.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { ToastProvider } from '@/components/ui/toast';
import { inter, jetbrainsMono, roboto } from '@/lib/fonts';
import { createQueryClient } from '@/lib/query-client';
import { setupVisibilityIntegration } from '@/lib/query-visibility';
import { initMocking } from '@/mocks';

import type { NextPage } from 'next';
import type { AppProps } from 'next/app';
import type { ReactElement, ReactNode } from 'react';

/**
 * Extend NextPage to support a per-page `getLayout` function.
 *
 * Pages that need a custom layout (or no layout) can export:
 * ```ts
 * Page.getLayout = (page) => page; // no shell
 * ```
 *
 * Pages that omit `getLayout` are automatically wrapped in `AppLayout`.
 */
export type NextPageWithLayout<P = object, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

/** Default layout: enforces authentication, then wraps the page in the application shell. */
const defaultGetLayout = (page: ReactElement): ReactNode => (
  <ProtectedRoute>
    <AppLayout>{page}</AppLayout>
  </ProtectedRoute>
);

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  // Create QueryClient once per app lifecycle.
  // useState ensures the same instance is reused across re-renders
  // and avoids sharing state between SSR requests.
  const [queryClient] = useState(() => createQueryClient());

  // Start MSW in the browser when API mocking is enabled (E2E tests).
  // This runs before the app renders meaningful content, ensuring all
  // API requests are intercepted from the start.
  const [mswReady, setMswReady] = useState(process.env.NEXT_PUBLIC_API_MOCKING !== 'enabled');
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
      void initMocking().then(() => {
        setMswReady(true);
      });
    }
  }, []);

  // Wire up the Page Visibility API so polling pauses when the tab is hidden
  // and an immediate refetch fires when the tab becomes visible again.
  useEffect(() => {
    const cleanup = setupVisibilityIntegration();
    return cleanup;
  }, []);

  const getLayout = Component.getLayout ?? defaultGetLayout;

  // Block rendering until MSW is ready so no requests bypass the mock layer.
  if (!mswReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div
          className={`${inter.variable} ${jetbrainsMono.variable} ${roboto.variable} bg-background min-h-screen font-sans antialiased`}
        >
          {getLayout(<Component {...pageProps} />)}
        </div>
      </ToastProvider>
      {/* Devtools only render in development — automatically removed in production */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
