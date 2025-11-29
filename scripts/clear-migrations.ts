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

async function clearMigrations() {
  console.log('🧹 Clearing migration records...\n');

  try {
    await sql`DELETE FROM public._migrations`;
    console.log('✅ Migration records cleared. Run db:migrate to reapply all migrations.\n');
  } catch (error) {
    console.error('❌ Error clearing migrations:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

clearMigrations();
