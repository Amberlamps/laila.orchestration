/**
 * @laila/database — Data access layer for the Claim Story application.
 *
 * Re-exports:
 * - Schema definitions (Drizzle ORM tables)
 * - Repository implementations (tenant-scoped queries)
 * - DynamoDB access layer (audit logs)
 * - Database client factory
 */

export * from './schema';
export * from './repositories';
export * from './dynamo';
