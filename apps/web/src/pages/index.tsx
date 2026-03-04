/**
 * Root page — `/`
 *
 * Redirects authenticated users to `/dashboard`.
 * This ensures the app entry point is consistent with sidebar and mobile
 * navigation links that all point to `/dashboard`.
 */
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { Skeleton } from '@/components/ui/skeleton';

import type { NextPageWithLayout } from './_app';
import type { ReactElement } from 'react';

const HomePage: NextPageWithLayout = () => {
  const router = useRouter();

  useEffect(() => {
    void router.replace('/dashboard');
  }, [router]);

  return (
    <div role="status" aria-label="Redirecting to dashboard">
      <Skeleton width="180px" height="28px" rounded="rounded" />
    </div>
  );
};

HomePage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="full">{page}</AppLayout>
  </ProtectedRoute>
);

export default HomePage;
