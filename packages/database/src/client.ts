/**
 * Database client factory for serverless environments.
 *
 * Creates a Drizzle ORM instance backed by @neondatabase/serverless,
 * which uses HTTP/WebSocket transport instead of persistent TCP connections.
 * This is optimized for Lambda and Edge runtime environments.
 */

// import { neon } from '@neondatabase/serverless';
// import { drizzle } from 'drizzle-orm/neon-http';
// import * as schema from './schema';

/**
 * Creates a database client connected to the Neon PostgreSQL instance.
 *
 * @param databaseUrl - The Neon connection string (typically from environment variables)
 * @returns A Drizzle ORM database instance with typed schema
 *
 * @example
 * ```typescript
 * const db = createDbClient(process.env.DATABASE_URL!);
 * const users = await db.select().from(schema.users);
 * ```
 */
// export const createDbClient = (databaseUrl: string) => {
//   const sql = neon(databaseUrl);
//   return drizzle(sql, { schema });
// };
