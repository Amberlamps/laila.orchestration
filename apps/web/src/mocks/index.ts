// Conditional MSW initialization.
// Only starts the MSW service worker when the NEXT_PUBLIC_API_MOCKING
// environment variable is set to "enabled". In production builds,
// this module is a no-op and tree-shakes away.

export const initMocking = async (): Promise<void> => {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
    const { startWorker } = await import('@/mocks/browser');
    await startWorker();
  }
};
