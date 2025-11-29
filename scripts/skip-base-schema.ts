import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' });
}

let connectionString = process.env.DATABASE_URL;

if (connectionString) {
  connectionString = connectionString.trim().replace(/^["']+|["']+$/g, '');
}

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

async function markBaseSchemaApplied() {
  console.log('📝 Marking base schema as already applied...\n');

  try {
    // Create migrations table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS public._migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // Mark base schema as applied
    await sql`
      INSERT INTO public._migrations (name) 
      VALUES ('20250129000000_base_schema.sql')
      ON CONFLICT (name) DO NOTHING
    `;
    
    console.log('✅ Base schema marked as applied (skipped).\n');
    console.log('You can now run db:migrate to apply the remaining migrations.\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

markBaseSchemaApplied();
