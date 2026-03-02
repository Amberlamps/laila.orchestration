import '../styles/globals.css';

import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="bg-background min-h-screen font-sans antialiased">
      <Component {...pageProps} />
    </div>
  );
}
