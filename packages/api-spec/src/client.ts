/**
 * Type-safe API client factory
 *
 * Creates an openapi-fetch client pre-typed with the generated OpenAPI paths.
 * Consumers call createApiClient(baseUrl) then use .GET(), .POST(), etc.
 *
 * Example:
 *   const client = createApiClient('/api/v1');
 *   const { data, error } = await client.GET('/projects/{projectId}', {
 *     params: { path: { projectId: '...' } },
 *   });
 */
import createClient from 'openapi-fetch';

import type { paths } from '../generated/api';

export const createApiClient = (baseUrl: string) => createClient<paths>({ baseUrl });
