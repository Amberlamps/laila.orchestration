import '../styles/globals.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

import { AppLayout } from '@/components/layout/app-layout';
import { ToastProvider } from '@/components/ui/toast';
import { inter, jetbrainsMono } from '@/lib/fonts';
import { createQueryClient } from '@/lib/query-client';

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

/** Default layout: wraps the page in the application shell. */
const defaultGetLayout = (page: ReactElement): ReactNode => <AppLayout>{page}</AppLayout>;

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  // Create QueryClient once per app lifecycle.
  // useState ensures the same instance is reused across re-renders
  // and avoids sharing state between SSR requests.
  const [queryClient] = useState(() => createQueryClient());

  const getLayout = Component.getLayout ?? defaultGetLayout;

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div
          className={`${inter.variable} ${jetbrainsMono.variable} bg-background min-h-screen font-sans antialiased`}
        >
          {getLayout(<Component {...pageProps} />)}
        </div>
      </ToastProvider>
      {/* Devtools only render in development — automatically removed in production */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
