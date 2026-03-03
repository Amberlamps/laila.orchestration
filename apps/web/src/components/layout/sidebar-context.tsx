import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import type { ReactNode } from 'react';

const STORAGE_KEY = 'laila-sidebar-collapsed';

interface SidebarContextValue {
  /** Whether the sidebar is in collapsed state (64px width) */
  collapsed: boolean;
  /** Toggle the sidebar between collapsed and expanded states */
  toggle: () => void;
  /** Explicitly set the collapsed state */
  setCollapsed: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

interface SidebarProviderProps {
  children: ReactNode;
}

/**
 * Provides collapsed/expanded state for the sidebar navigation.
 *
 * The collapsed state is persisted in localStorage under the key
 * "laila-sidebar-collapsed". On mount the provider reads the stored
 * value so the sidebar opens in the same state as the user left it.
 *
 * Reading from localStorage is deferred to a useEffect to prevent
 * hydration mismatches between server and client.
 */
export const SidebarProvider = ({ children }: SidebarProviderProps) => {
  // Default to expanded (false = not collapsed).
  // The actual persisted value is loaded in the useEffect below.
  const [collapsed, setCollapsedState] = useState(false);

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') {
        setCollapsedState(true);
      }
    } catch {
      // localStorage may be unavailable (SSR, private browsing, etc.)
    }
  }, []);

  const persistAndSet = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Silently ignore storage errors
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Silently ignore storage errors
      }
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed: persistAndSet }}>
      {children}
    </SidebarContext.Provider>
  );
};

/**
 * Hook to access the sidebar collapsed/expanded state.
 *
 * Must be used within a <SidebarProvider>.
 *
 * @example
 * ```tsx
 * const { collapsed, toggle } = useSidebar();
 * ```
 */
export const useSidebar = (): SidebarContextValue => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a <SidebarProvider>');
  }
  return context;
};
