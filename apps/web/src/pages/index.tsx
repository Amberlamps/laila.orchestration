import Head from 'next/head';

import type { NextPageWithLayout } from './_app';
import type { ReactElement } from 'react';

const HomePage: NextPageWithLayout = () => {
  return (
    <>
      <Head>
        <title>Laila - AI Agent Orchestration</title>
        <meta
          name="description"
          content="AI Agent Orchestration Service for project management and work coordination"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-foreground text-4xl font-bold tracking-tight sm:text-6xl">Laila</h1>
          <p className="text-muted-foreground mt-4 text-lg">AI Agent Orchestration Service</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Project management, work orchestration, and monitoring dashboard.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <div className="border-border bg-card text-card-foreground rounded-lg border px-6 py-3 text-sm shadow-sm">
              Getting started &mdash; scaffold complete
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

/** Public page — opt out of the default AppLayout shell. */
HomePage.getLayout = (page: ReactElement) => page;

export default HomePage;
