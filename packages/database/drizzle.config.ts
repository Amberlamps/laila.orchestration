// Configuration for Drizzle Kit migration generation
// Points to schema definitions and specifies the PostgreSQL dialect
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
