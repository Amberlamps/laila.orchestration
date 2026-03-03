import { ShieldX } from 'lucide-react';
import Head from 'next/head';

import { ErrorPage } from './error-page';

/**
 * 403 Forbidden error component.
 *
 * Render this conditionally when an API returns a 403 status.
 * Next.js does not have a built-in 403 route, so this is used
 * as a reusable component within page components.
 */
export const Forbidden = () => (
  <>
    <Head>
      <title>403 — Access Denied - laila.works</title>
    </Head>
    <ErrorPage
      icon={ShieldX}
      code="403"
      title="Access Denied"
      description="You don't have permission to access this resource. Contact your administrator if you believe this is an error."
      primaryAction={{ label: 'Go to Dashboard', href: '/dashboard' }}
    />
  </>
);
