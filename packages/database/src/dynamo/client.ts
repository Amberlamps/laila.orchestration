/**
 * @module dynamo/client
 *
 * DynamoDB Document Client factory for the audit log system.
 *
 * Creates a configured DynamoDB Document Client using AWS SDK v3 modular
 * imports. The Document Client automatically handles marshalling/unmarshalling
 * between JavaScript objects and DynamoDB attribute values.
 *
 * Environment detection:
 * - When `DYNAMODB_ENDPOINT` is set, connects to a local DynamoDB instance
 *   (DynamoDB Local or LocalStack) for development and testing.
 * - When unset, uses default AWS credential resolution (IAM roles, env vars,
 *   shared credentials file) for production.
 *
 * @example
 * ```typescript
 * import { createDynamoClient } from './client';
 * import { PutCommand } from '@aws-sdk/lib-dynamodb';
 *
 * const docClient = createDynamoClient();
 * await docClient.send(new PutCommand({ TableName: 'audit-events', Item: { ... } }));
 * ```
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// Client configuration types
// ---------------------------------------------------------------------------

/** Options for creating the DynamoDB Document Client */
export interface DynamoClientOptions {
  /** Override the DynamoDB endpoint (e.g., for DynamoDB Local). Defaults to DYNAMODB_ENDPOINT env var. */
  endpoint?: string;

  /** Override the AWS region. Defaults to DYNAMODB_REGION or AWS_REGION env var, then 'us-east-1'. */
  region?: string;
}

// ---------------------------------------------------------------------------
// Shared configuration resolver
// ---------------------------------------------------------------------------

/**
 * Resolves DynamoDB client configuration from options and environment variables.
 */
const resolveDynamoConfig = (options?: DynamoClientOptions) => {
  const endpoint = options?.endpoint ?? process.env['DYNAMODB_ENDPOINT'] ?? undefined;
  const region =
    options?.region ?? process.env['DYNAMODB_REGION'] ?? process.env['AWS_REGION'] ?? 'us-east-1';

  return { region, ...(endpoint !== undefined ? { endpoint } : {}) };
};

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

/**
 * Creates a low-level DynamoDB client configured for the current environment.
 *
 * Use this when you need to call service-level APIs such as `DescribeTable`
 * that are not available on the Document Client.
 *
 * @param options - Optional overrides for endpoint and region
 * @returns A configured DynamoDBClient instance
 */
export const createDynamoBaseClient = (options?: DynamoClientOptions): DynamoDBClient => {
  return new DynamoDBClient(resolveDynamoConfig(options));
};

/**
 * Creates a DynamoDB Document Client configured for the current environment.
 *
 * For local development, set the `DYNAMODB_ENDPOINT` environment variable
 * to point to DynamoDB Local (e.g., `http://localhost:8000`).
 *
 * The Document Client wraps the low-level DynamoDBClient and provides:
 * - Automatic JavaScript-to-DynamoDB type conversion
 * - Simplified command interfaces (PutCommand, GetCommand, QueryCommand)
 * - Consistent camelCase attribute handling
 *
 * @param options - Optional overrides for endpoint and region
 * @returns A configured DynamoDB Document Client instance
 */
export const createDynamoClient = (options?: DynamoClientOptions): DynamoDBDocumentClient => {
  const baseClient = new DynamoDBClient(resolveDynamoConfig(options));

  return DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: {
      /** Remove undefined values from items before sending to DynamoDB */
      removeUndefinedValues: true,
    },
  });
};
