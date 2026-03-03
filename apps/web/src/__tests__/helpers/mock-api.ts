/**
 * @module mock-api
 *
 * Test helper utilities for invoking Next.js Pages Router API handlers
 * with mock request/response objects. Designed for integration-style tests
 * that call the handler directly without a running HTTP server.
 *
 * Provides:
 * - `createMockRequest`: builds a typed `NextApiRequest`-like object
 * - `createMockResponse`: builds a typed `NextApiResponse`-like object with
 *   chainable stubs and convenient accessor methods for assertions
 * - `MockApiResponse`: strongly-typed wrapper for test assertions
 */

import { vi } from 'vitest';

import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for creating a mock request. All fields are optional;
 * sensible defaults are applied for missing values.
 */
export interface MockRequestConfig {
  /** HTTP method (default: 'GET') */
  method?: string;
  /** Request URL path (default: '/api/test') */
  url?: string;
  /** Parsed request body (for POST, PATCH, PUT) */
  body?: Record<string, unknown>;
  /** Query string parameters (including dynamic route params for Pages Router) */
  query?: Record<string, string | string[]>;
  /** Request headers (lower-cased keys) */
  headers?: Record<string, string | undefined>;
}

/**
 * Extended mock response with accessor methods for test assertions.
 * Avoids the need to cast or dig into `vi.fn()` mock internals directly.
 */
export interface MockApiResponse extends NextApiResponse {
  /** Returns the HTTP status code that was set via `res.status()` */
  getStatusCode: () => number | undefined;
  /** Returns the JSON body passed to `res.json()`, or undefined if not called */
  getJsonBody: () => unknown;
  /** Returns true if `res.end()` was called (for 204 No Content) */
  wasEnded: () => boolean;
  /** Returns all calls to `res.setHeader()` as [name, value] tuples */
  getSetHeaders: () => Array<[string, string]>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock `NextApiRequest` for testing API route handlers.
 *
 * The returned object satisfies the shape expected by Next.js API handlers
 * and the middleware chain (withAuth, withValidation, withErrorHandler).
 *
 * @param config - Optional overrides for method, url, body, query, headers
 * @returns A mock NextApiRequest
 */
export const createMockRequest = (config: MockRequestConfig = {}): NextApiRequest => {
  const req = {
    method: config.method ?? 'GET',
    url: config.url ?? '/api/test',
    body: config.body ?? undefined,
    query: config.query ?? {},
    headers: config.headers ?? {},
    cookies: {},
    // Socket mock for potential middleware that checks socket properties
    socket: {},
  };
  return req as unknown as NextApiRequest;
};

/**
 * Creates a mock `NextApiResponse` with chainable stubs for `status()`,
 * `json()`, `end()`, and `setHeader()`.
 *
 * Includes typed accessor methods so test assertions can read response
 * data without reaching into Vitest mock internals.
 *
 * @returns A mock response object with accessor methods
 */
export const createMockResponse = (): MockApiResponse => {
  let statusCode: number | undefined;
  let jsonBody: unknown;
  let ended = false;
  const setHeaders: Array<[string, string]> = [];

  const res = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      jsonBody = body;
      return res;
    }),
    end: vi.fn(() => {
      ended = true;
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      setHeaders.push([name, value]);
      return res;
    }),

    // Accessor methods for clean test assertions
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
    wasEnded: () => ended,
    getSetHeaders: () => setHeaders,
  };

  return res as unknown as MockApiResponse;
};
