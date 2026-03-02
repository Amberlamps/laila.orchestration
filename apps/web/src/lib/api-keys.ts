// API key generation utilities for execution agent authentication.
// Keys use the format: lw_ + 48 hex chars (192 bits of entropy).
// Only the SHA-256 hash is persisted; plaintext is revealed once.
import { randomBytes, createHash } from 'node:crypto';

// Prefix that identifies all laila.works API keys.
// Used for visual identification and lookup optimization.
const API_KEY_PREFIX = 'lw_';

// Number of random bytes to generate (24 bytes = 48 hex chars).
// Provides 192 bits of entropy, sufficient for API key security.
const KEY_BYTES = 24;

// Length of the prefix substring stored for O(1) key lookup.
// 8 hex chars from the body portion, used as a database index.
const LOOKUP_PREFIX_LENGTH = 8;

export interface GeneratedApiKey {
  // The full plaintext key (returned once, never stored).
  plaintextKey: string;
  // SHA-256 hash of the full key (stored in database).
  hashedKey: string;
  // First 8 hex chars of the body (stored for O(1) lookup).
  prefix: string;
}

/**
 * Generate a new API key with cryptographic randomness.
 * Returns the plaintext key (for one-time reveal), its SHA-256 hash
 * (for database storage), and the lookup prefix (for O(1) resolution).
 */
export const generateApiKey = (): GeneratedApiKey => {
  // Generate 24 cryptographically random bytes.
  const randomHex = randomBytes(KEY_BYTES).toString('hex');

  // Construct the full key: lw_ + 48 hex characters.
  const plaintextKey = `${API_KEY_PREFIX}${randomHex}`;

  // Hash the full key with SHA-256 for secure storage.
  // The hash is what gets stored in the database.
  const hashedKey = createHash('sha256').update(plaintextKey).digest('hex');

  // Extract the lookup prefix from the hex body (not the lw_ prefix).
  // This is stored alongside the hash for O(1) key resolution.
  const prefix = randomHex.substring(0, LOOKUP_PREFIX_LENGTH);

  return { plaintextKey, hashedKey, prefix };
};

/**
 * Hash a plaintext API key for comparison against stored hashes.
 * Used during key validation to compare against the database.
 */
export const hashApiKey = (plaintextKey: string): string =>
  createHash('sha256').update(plaintextKey).digest('hex');

/**
 * Extract the lookup prefix from a plaintext API key.
 * Used during validation to find the key record in the database.
 */
export const extractPrefix = (plaintextKey: string): string => {
  // Strip the "lw_" prefix, then take the first 8 hex chars.
  const body = plaintextKey.slice(API_KEY_PREFIX.length);
  return body.substring(0, LOOKUP_PREFIX_LENGTH);
};

/**
 * Validate the format of a plaintext API key.
 * Returns true if the key matches the expected format.
 */
export const isValidKeyFormat = (key: string): boolean =>
  // Must start with "lw_" followed by exactly 48 hex characters.
  /^lw_[0-9a-f]{48}$/.test(key);
