import * as dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load .env.local for Next.js projects
dotenv.config({ path: '.env.local' });

export default defineConfig({
  out: './drizzle',
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
