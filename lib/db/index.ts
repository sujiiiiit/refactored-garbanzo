import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// For serverless environments like Next.js, use connection pooling
// Disable prefetch as it's not supported for "Transaction" pool mode
const connectionString = process.env.DATABASE_URL!;

// Create postgres client with connection pooling settings
const client = postgres(connectionString, {
  prepare: false, // Required for Supabase Transaction pool mode
  max: 10, // Maximum connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout
});

// Create drizzle instance with schema for relational queries
export const db = drizzle(client, { schema });

// Export schema for use in queries
export * from './schema';
