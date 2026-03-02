/**
 * @module @laila/shared/schemas/api/api-key
 *
 * Zod schemas for API key management endpoints.
 *
 * The creation response is the only time the raw API key is returned
 * to the client. After creation, only a masked/truncated version is
 * available for display purposes. Clients must store the raw key
 * securely at creation time.
 *
 * API keys use the system-wide prefix (e.g., `lw_`) defined in
 * the constants module for easy identification and secret scanning.
 */

import { z } from 'zod';

import { API_KEY_PREFIX } from '../../constants/api';

/**
 * Request body for creating a new API key (POST /api/v1/api-keys).
 *
 * - `name` identifies the key in the management UI and audit logs
 * - `expiresAt` optionally sets an expiration date for the key
 */
export const createApiKeyRequestSchema = z.object({
  /** Human-readable name to identify this API key */
  name: z.string().min(1).max(255),

  /** Optional ISO 8601 expiration timestamp. Omit for non-expiring keys. */
  expiresAt: z.string().datetime().optional(),
});

/** Inferred TypeScript type for the create API key request body */
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

/**
 * Response returned after successfully creating a new API key
 * (POST /api/v1/api-keys).
 *
 * SECURITY: The `rawKey` field contains the full API key and is only
 * returned once at creation time. It is never stored in plain text
 * on the server and cannot be retrieved again.
 */
export const createApiKeyResponseSchema = z.object({
  /** Unique identifier for the API key record */
  id: z.string().uuid(),

  /** Human-readable name assigned to this key */
  name: z.string(),

  /**
   * The full raw API key, prefixed with the system API key prefix.
   * This is the ONLY time the raw key is returned -- clients must
   * store it securely.
   */
  rawKey: z.string().startsWith(API_KEY_PREFIX),

  /** Masked version of the key for display (e.g., "lw_****...ab12") */
  maskedKey: z.string(),

  /** ISO 8601 timestamp of when the key was created */
  createdAt: z.string().datetime(),

  /** ISO 8601 expiration timestamp, or null for non-expiring keys */
  expiresAt: z.string().datetime().nullable(),
});

/** Inferred TypeScript type for the API key creation response */
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

/**
 * Summary representation of an API key for list endpoints.
 *
 * Excludes the raw key (never available after creation) and includes
 * only the masked version for safe display.
 */
export const apiKeySummarySchema = z.object({
  /** Unique identifier for the API key record */
  id: z.string().uuid(),

  /** Human-readable name assigned to this key */
  name: z.string(),

  /** Masked version of the key for display (e.g., "lw_****...ab12") */
  maskedKey: z.string(),

  /** ISO 8601 timestamp of when the key was created */
  createdAt: z.string().datetime(),

  /** ISO 8601 expiration timestamp, or null for non-expiring keys */
  expiresAt: z.string().datetime().nullable(),

  /** ISO 8601 timestamp of when the key was last used, or null if never used */
  lastUsedAt: z.string().datetime().nullable(),
});

/** Inferred TypeScript type for API key summary */
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;
