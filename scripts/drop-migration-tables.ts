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

async function dropMigrationTables() {
  console.log('🗑️  Dropping migration-created tables...\n');

  try {
    // Drop tables created by migrations (not by Drizzle)
    const tablesToDrop = [
      'mis_reports',
      'cashflow_optimizations',
      'burn_rate_history',
      'runway_predictions',
      'anomalies',
      'insights',
      'agent_events',
      'subscriptions',
      'receipts',
      'entity_members',
      'entities'
    ];

    for (const table of tablesToDrop) {
      try {
        await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`   ✅ Dropped: ${table}`);
      } catch (err: any) {
        console.log(`   ⚠️  Could not drop ${table}: ${err.message  }`);
      }
    }

    console.log('\n✨ Migration tables dropped. You can now run db:migrate.\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

dropMigrationTables();
