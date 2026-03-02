// Drizzle Kit configuration for PostgreSQL migration generation and management
// Reads schema from TypeScript definitions and outputs SQL migration files
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Uses the direct connection URL (not pooled) for migrations
    // The direct URL bypasses Neon's connection pooler for DDL operations
    url: process.env.DATABASE_DIRECT_URL ?? '',
  },
  // Enable verbose logging during migration generation for debugging
  verbose: true,
  // Enable strict mode to catch potential issues in schema definitions
  strict: true,
});
