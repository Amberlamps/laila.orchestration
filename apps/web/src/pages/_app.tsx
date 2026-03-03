import '../styles/globals.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

import { inter, jetbrainsMono } from '@/lib/fonts';
import { createQueryClient } from '@/lib/query-client';

import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  // Create QueryClient once per app lifecycle.
  // useState ensures the same instance is reused across re-renders
  // and avoids sharing state between SSR requests.
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={`${inter.variable} ${jetbrainsMono.variable} bg-background min-h-screen font-sans antialiased`}
      >
        <Component {...pageProps} />
      </div>
      {/* Devtools only render in development — automatically removed in production */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
