'use client';

/**
 * Toast Notification System
 *
 * Provides non-blocking feedback on user actions (entity created, update saved,
 * error occurred, etc.). Toasts appear in the bottom-right corner of the viewport
 * and stack vertically with configurable auto-dismiss behavior.
 *
 * Architecture:
 * - React context (`ToastProvider`) manages toast state via `useReducer`
 * - `useToast()` hook exposes `addToast` / `removeToast` for component consumers
 * - Module-level `toast` object provides an imperative API for use outside React:
 *     toast.success("Title", "Optional description")
 *     toast.error("Title", "Optional description")
 *     toast.warning("Title", "Optional description")
 *     toast.info("Title", "Optional description")
 *
 * @module toast
 */

import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four semantic variants available for toasts. */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/** A single toast notification. */
export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  /**
   * Duration in milliseconds before auto-dismiss.
   * `null` means the toast persists until manually dismissed.
   */
  duration?: number | null;
}

/** Values exposed by the toast React context. */
export interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of toasts visible simultaneously. */
const MAX_VISIBLE_TOASTS = 3;

/** Default auto-dismiss durations per variant (ms). */
const DEFAULT_DURATIONS: Record<ToastVariant, number | null> = {
  success: 5_000,
  info: 5_000,
  warning: 8_000,
  error: null, // persistent — dismissed manually
};

/** Variant-specific visual configuration. */
const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    icon: typeof CheckCircle2;
    borderColor: string;
    iconColor: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    borderColor: 'border-l-green-500',
    iconColor: 'text-green-600',
  },
  error: {
    icon: XCircle,
    borderColor: 'border-l-red-500',
    iconColor: 'text-red-600',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-l-amber-500',
    iconColor: 'text-amber-600',
  },
  info: {
    icon: Info,
    borderColor: 'border-l-blue-500',
    iconColor: 'text-blue-600',
  },
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let toastCounter = 0;

function generateToastId(): string {
  toastCounter += 1;
  return `toast-${String(Date.now())}-${String(toastCounter)}`;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type ToastAction = { type: 'ADD'; toast: Toast } | { type: 'REMOVE'; id: string };

function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case 'ADD': {
      // Append new toast. If the total exceeds MAX_VISIBLE_TOASTS,
      // drop the oldest (first) entries.
      const next = [...state, action.toast];
      if (next.length > MAX_VISIBLE_TOASTS) {
        return next.slice(next.length - MAX_VISIBLE_TOASTS);
      }
      return next;
    }
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access the toast context from within the React tree.
 *
 * @throws {Error} If used outside of a `<ToastProvider>`.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Module-level imperative API (event emitter pattern)
// ---------------------------------------------------------------------------

type ToastListener = (toast: Omit<Toast, 'id'>) => void;

const listeners: Set<ToastListener> = new Set();

function subscribe(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitToast(toast: Omit<Toast, 'id'>): void {
  listeners.forEach((listener) => {
    listener(toast);
  });
}

/**
 * Imperative toast API for triggering toasts from anywhere in the codebase,
 * including outside React component trees.
 *
 * @example
 * ```ts
 * import { toast } from "@/components/ui/toast";
 *
 * toast.success("Project Created", "Your project is ready.");
 * toast.error("Failed to Save", "The server returned an error.");
 * toast.warning("Worker Timeout", "Worker 'alpha' has been idle for 25 min.");
 * toast.info("Tip", "You can use keyboard shortcuts to navigate.");
 * ```
 */
export const toast = {
  success(title: string, description?: string): void {
    emitToast({
      variant: 'success',
      title,
      ...(description !== undefined ? { description } : {}),
    });
  },
  error(title: string, description?: string): void {
    emitToast({
      variant: 'error',
      title,
      ...(description !== undefined ? { description } : {}),
    });
  },
  warning(title: string, description?: string): void {
    emitToast({
      variant: 'warning',
      title,
      ...(description !== undefined ? { description } : {}),
    });
  },
  info(title: string, description?: string): void {
    emitToast({
      variant: 'info',
      title,
      ...(description !== undefined ? { description } : {}),
    });
  },
};

// ---------------------------------------------------------------------------
// Individual Toast Component
// ---------------------------------------------------------------------------

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast: t, onDismiss }: ToastItemProps) {
  const config = VARIANT_CONFIG[t.variant];
  const IconComponent = config.icon;
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(false);
  const remainingRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Compute effective duration: use toast-level override if provided,
  // otherwise fall back to variant default.
  const effectiveDuration = t.duration !== undefined ? t.duration : DEFAULT_DURATIONS[t.variant];

  const handleDismiss = useCallback(() => {
    // Trigger exit animation, then remove after animation completes
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(t.id);
    }, 150); // matches fade-out duration
  }, [onDismiss, t.id]);

  // Start auto-dismiss timer
  const startTimer = useCallback(
    (duration: number) => {
      startTimeRef.current = Date.now();
      remainingRef.current = duration;
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, duration);
    },
    [handleDismiss],
  );

  const pauseTimer = useCallback(() => {
    if (timerRef.current && !isPausedRef.current) {
      isPausedRef.current = true;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      // Calculate remaining time
      if (remainingRef.current !== null && startTimeRef.current !== null) {
        const elapsed = Date.now() - startTimeRef.current;
        remainingRef.current = Math.max(remainingRef.current - elapsed, 0);
      }
    }
  }, []);

  const resumeTimer = useCallback(() => {
    if (isPausedRef.current && remainingRef.current !== null && remainingRef.current > 0) {
      isPausedRef.current = false;
      startTimer(remainingRef.current);
    }
  }, [startTimer]);

  useEffect(() => {
    if (effectiveDuration !== null && effectiveDuration > 0) {
      startTimer(effectiveDuration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally run only on mount

  const ariaLive = t.variant === 'error' ? 'assertive' : 'polite';

  return (
    <div
      role="alert"
      aria-live={ariaLive}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      className={cn(
        // Base styles
        'pointer-events-auto relative flex w-[360px] items-start gap-3 rounded-[8px] border border-zinc-200 bg-white p-4 shadow-lg',
        // Left border (3px) in variant color
        'border-l-[3px]',
        config.borderColor,
        // Animation classes
        isExiting ? 'animate-toast-out' : 'animate-toast-in',
      )}
    >
      {/* Variant icon */}
      <IconComponent
        className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconColor)}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <p className="text-[14px] leading-5 font-semibold text-zinc-900">{t.title}</p>
        {t.description ? (
          <p className="mt-1 text-[13px] leading-[18px] text-zinc-500">{t.description}</p>
        ) : null}
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast Container (viewport)
// ---------------------------------------------------------------------------

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed right-6 bottom-6 z-[100] flex flex-col gap-3"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Provides the toast notification system to the React tree.
 *
 * Wrap your application root with `<ToastProvider>` to enable:
 * - The `useToast()` hook for component-level access
 * - The imperative `toast.success()` / `toast.error()` / etc. API
 * - Automatic toast rendering in the bottom-right viewport corner
 *
 * @example
 * ```tsx
 * // In _app.tsx or layout:
 * import { ToastProvider } from "@/components/ui/toast";
 *
 * function App({ children }) {
 *   return <ToastProvider>{children}</ToastProvider>;
 * }
 * ```
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const addToast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = generateToastId();
    dispatch({ type: 'ADD', toast: { ...toastData, id } });
  }, []);

  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE', id });
  }, []);

  // Subscribe to the module-level emitter so imperative calls
  // (toast.success(), etc.) flow into the React state.
  useEffect(() => {
    const unsubscribe = subscribe(addToast);
    return unsubscribe;
  }, [addToast]);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, addToast, removeToast }),
    [toasts, addToast, removeToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}
