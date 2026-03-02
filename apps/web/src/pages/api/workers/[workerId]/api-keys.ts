/**
 * POST /api/workers/:workerId/api-keys
 *
 * Creates a new API key for the specified worker. The plaintext key is
 * returned exactly once in the response body. Only the SHA-256 hash
 * and lookup prefix are persisted to the database.
 *
 * Requires an authenticated human user session. The user must own the
 * worker (tenant_id = user.id) to create keys for it.
 *
 * SECURITY: The plaintext key MUST be copied by the caller immediately.
 * It cannot be retrieved again after this response.
 */

import { getDb, workersTable, apiKeysTable } from '@laila/database';
import { and, eq } from 'drizzle-orm';

import { generateApiKey } from '@/lib/api-keys';
import { getAuthenticatedUser } from '@/lib/middleware/session';

import type { NextApiRequest, NextApiResponse } from 'next';

interface CreateApiKeySuccessResponse {
  /** The full plaintext API key — returned exactly once. */
  key: string;
  /** First 8 hex chars of the key body, used for identification. */
  prefix: string;
  /** Warning that the key cannot be retrieved again. */
  warning: string;
}

interface ApiErrorResponse {
  error: string;
}

type ApiKeyResponse = CreateApiKeySuccessResponse | ApiErrorResponse;

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<ApiKeyResponse>,
): Promise<void> => {
  // Only accept POST requests for key creation.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Extract the worker ID from the dynamic route segment.
  const { workerId } = req.query;

  if (typeof workerId !== 'string' || workerId.length === 0) {
    res.status(400).json({ error: 'Missing or invalid workerId parameter' });
    return;
  }

  // Authenticate the requesting user via session cookie/token.
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Verify the authenticated user owns this worker (tenant_id = user.id).
  const db = getDb();
  const workerResults = await db
    .select({ id: workersTable.id })
    .from(workersTable)
    .where(and(eq(workersTable.id, workerId), eq(workersTable.tenantId, user.id)))
    .limit(1);

  if (workerResults.length === 0) {
    res.status(404).json({ error: 'Worker not found' });
    return;
  }

  // Generate the cryptographic key material.
  const { plaintextKey, hashedKey, prefix } = generateApiKey();

  // Persist the hash and prefix to the api_keys table linked to the worker.
  await db.insert(apiKeysTable).values({
    tenantId: user.id,
    workerId,
    hashedKey,
    prefix,
  });

  // Set a custom header to reinforce the one-time reveal contract.
  res.setHeader('X-Key-Warning', 'This API key will not be shown again. Store it securely.');

  // Return the plaintext key exactly once.
  res.status(201).json({
    key: plaintextKey,
    prefix,
    warning:
      'This is the only time this API key will be displayed. ' +
      'Store it in a secure location. It cannot be retrieved again.',
  });
};

export default handler;
