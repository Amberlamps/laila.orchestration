import { ServerCrash } from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { ErrorPage } from '@/components/error/error-page';

import type { NextPageWithLayout } from './_app';
import type { ReactElement } from 'react';

const ServerErrorPage: NextPageWithLayout = () => {
  const router = useRouter();
  const handleTryAgain = useCallback(() => {
    router.reload();
  }, [router]);

  return (
    <>
      <Head>
        <title>500 — Something Went Wrong - laila.works</title>
      </Head>
      <ErrorPage
        icon={ServerCrash}
        code="500"
        title="Something Went Wrong"
        description="An unexpected error occurred. Our team has been notified. Please try again."
        primaryAction={{ label: 'Try Again', onClick: handleTryAgain }}
        secondaryAction={{ label: 'Go to Dashboard', href: '/dashboard' }}
      />
    </>
  );
};

ServerErrorPage.getLayout = (page: ReactElement) => page;

export default ServerErrorPage;
