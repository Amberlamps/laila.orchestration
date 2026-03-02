/**
 * @module dynamo
 *
 * DynamoDB access layer for audit logs and event storage.
 *
 * Uses AWS SDK v3 Document Client for automatic marshalling/unmarshalling.
 * All attribute names follow camelCase convention (DynamoDB standard).
 *
 * This module provides:
 * - DynamoDB Document Client factory
 * - Audit log write operations
 * - Query operations designed around access patterns
 */

export {};
