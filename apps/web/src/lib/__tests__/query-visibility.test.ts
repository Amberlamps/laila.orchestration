/**
 * Tests for query-visibility.ts -- Page Visibility API integration
 * with TanStack Query's focusManager.
 *
 * Validates:
 * - focusManager.setEventListener is called with a setup function
 * - The setup function registers a "visibilitychange" event listener
 * - When document.visibilityState changes, handleFocus is called with the correct boolean
 * - The returned cleanup function removes the event listener
 */

import { focusManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupVisibilityIntegration } from '../query-visibility';

// ---------------------------------------------------------------------------
// Mock focusManager so we can capture and invoke the setup callback manually.
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', () => ({
  focusManager: {
    setEventListener: vi.fn(),
  },
}));

// Extract a reference to the mocked function once. The cast is safe because
// the module mock above replaces the real implementation with vi.fn().
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockSetEventListener = focusManager.setEventListener as ReturnType<typeof vi.fn>;

/** Helper: retrieve the setup callback that was passed to setEventListener. */
const getSetupCallback = (): ((
  handleFocus: (focused?: boolean) => void,
) => (() => void) | undefined) => {
  const calls = mockSetEventListener.mock.calls as [
    (handleFocus: (focused?: boolean) => void) => (() => void) | undefined,
  ][];
  return calls[0]![0];
};

/** Helper: find the visibilitychange handler registered via addEventListener. */
const getVisibilityHandler = (addSpy: ReturnType<typeof vi.spyOn>): (() => void) => {
  const call = addSpy.mock.calls.find((c: [string, ...unknown[]]) => c[0] === 'visibilitychange');
  return call?.[1] as () => void;
};

describe('setupVisibilityIntegration', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    addSpy = vi.spyOn(document, 'addEventListener');
    removeSpy = vi.spyOn(document, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('calls focusManager.setEventListener with a setup function', () => {
    setupVisibilityIntegration();

    expect(mockSetEventListener).toHaveBeenCalledOnce();
    expect(typeof getSetupCallback()).toBe('function');
  });

  it('registers a visibilitychange listener on the document', () => {
    setupVisibilityIntegration();

    const handleFocus = vi.fn();
    getSetupCallback()(handleFocus);

    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function) as () => void);
  });

  it("calls handleFocus(true) when visibilityState is 'visible'", () => {
    setupVisibilityIntegration();

    const handleFocus = vi.fn();
    getSetupCallback()(handleFocus);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });

    const handler = getVisibilityHandler(addSpy);
    expect(handler).toBeDefined();
    handler();

    expect(handleFocus).toHaveBeenCalledWith(true);
  });

  it("calls handleFocus(false) when visibilityState is 'hidden'", () => {
    setupVisibilityIntegration();

    const handleFocus = vi.fn();
    getSetupCallback()(handleFocus);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });

    const handler = getVisibilityHandler(addSpy);
    expect(handler).toBeDefined();
    handler();

    expect(handleFocus).toHaveBeenCalledWith(false);
  });

  it('setup callback returns a cleanup that removes the event listener', () => {
    setupVisibilityIntegration();

    const handleFocus = vi.fn();
    const innerCleanup = getSetupCallback()(handleFocus);

    expect(innerCleanup).toBeDefined();
    innerCleanup?.();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function) as () => void);
  });

  it('returns a cleanup function that removes the visibilitychange listener', () => {
    // Make the mock actually invoke the setup callback so the outer cleanup
    // captures a reference to the handler.
    mockSetEventListener.mockImplementation(
      (setupFn: (handleFocus: (focused?: boolean) => void) => (() => void) | undefined) => {
        const handleFocus = vi.fn();
        setupFn(handleFocus);
      },
    );

    const cleanup = setupVisibilityIntegration();

    removeSpy.mockClear();
    cleanup();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function) as () => void);
  });

  it('uses visibilitychange event, not focus or blur events', () => {
    setupVisibilityIntegration();

    const handleFocus = vi.fn();
    getSetupCallback()(handleFocus);

    const eventNames = addSpy.mock.calls.map((call: [string, ...unknown[]]) => call[0]);
    expect(eventNames).toContain('visibilitychange');
    expect(eventNames).not.toContain('focus');
    expect(eventNames).not.toContain('blur');
  });
});
