import { FileQuestion } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { ErrorPage } from '@/components/error/error-page';

import type { NextPageWithLayout } from './_app';
import type { ReactElement } from 'react';

const NotFoundPage: NextPageWithLayout = () => {
  const router = useRouter();
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <>
      <Head>
        <title>404 — Page Not Found - laila.works</title>
      </Head>
      <ErrorPage
        icon={FileQuestion}
        code="404"
        title="Page Not Found"
        description="The page you're looking for doesn't exist or has been moved."
        primaryAction={{ label: 'Go to Dashboard', href: '/dashboard' }}
        secondaryAction={{ label: 'Go Back', onClick: handleGoBack }}
      />
    </>
  );
};

NotFoundPage.getLayout = (page: ReactElement) => page;

export default NotFoundPage;
