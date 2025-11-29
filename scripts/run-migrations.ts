import postgres from 'postgres';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' });
}

let connectionString = process.env.DATABASE_URL;

if (connectionString) {
  // Aggressively remove surrounding quotes and whitespace
  connectionString = connectionString.trim().replace(/^["']+|["']+$/g, '');
}

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');

  try {
    // 1. Create migrations table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS public._migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // 2. Get list of migration files
    const migrationsDir = path.join(__dirname, '../supabase/migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.error(`❌ Migrations directory not found at: ${migrationsDir}`);
      process.exit(1);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure they run in order

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    // 3. Get applied migrations
    const appliedMigrations = await sql`
      SELECT name FROM public._migrations
    `;
    const appliedNames = new Set(appliedMigrations.map(m => m.name));

    // 4. Run pending migrations
    let count = 0;
    for (const file of files) {
      if (appliedNames.has(file)) {
        continue;
      }

      console.log(`Running migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      try {
        await sql.begin(async sql => {
          // Run the entire migration as one block to preserve DO blocks and complex statements
          await sql.unsafe(content);
          
          // Record it as applied
          await sql`
            INSERT INTO public._migrations (name) VALUES (${file})
          `;
        });
        console.log(`   ✅ Applied: ${file}`);
        count++;
      } catch (err: any) {
        console.error(`\n   ❌ Failed to apply ${file}:`);
        console.error('Error message:', err.message);
        console.error('Error code:', err.code);
        if (err.detail) console.error('Error detail:', err.detail);
        if (err.hint) console.error('Error hint:', err.hint);
        if (err.position) console.error('Error position:', err.position);
        process.exit(1); // Stop on first error
      }
    }

    if (count === 0) {
      console.log('✨ All migrations are already up to date.');
    } else {
      console.log(`\n🎉 Successfully applied ${count} migrations.`);
    }

  } catch (error) {
    console.error('❌ Error running migrations:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
