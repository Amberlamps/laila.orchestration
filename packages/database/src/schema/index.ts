/**
 * @module schema
 *
 * Drizzle ORM table definitions for PostgreSQL.
 *
 * This module exports all table schemas used by the application.
 * Each table definition enforces tenant scoping via a mandatory `tenant_id` column
 * to guarantee data isolation in a multi-tenant environment.
 *
 * Schema files added here are automatically picked up by drizzle-kit for migration generation.
 */

export * from './auth';
export * from './projects';
export * from './epics';
export * from './user-stories';
export * from './tasks';
export * from './dependency-edges';
export * from './workers';
export * from './api-keys';
export * from './personas';
export * from './attempt-history';
