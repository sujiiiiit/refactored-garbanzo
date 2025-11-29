import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function resetDatabase() {
  console.log('🗑️  Dropping all tables and types...\n');

  try {
    // Drop migration tracking table
    await sql`DROP TABLE IF EXISTS public._migrations CASCADE`;

    // Drop new feature tables (from migrations)
    await sql`DROP TABLE IF EXISTS public.anomalies CASCADE`;
    await sql`DROP TABLE IF EXISTS public.insights CASCADE`;
    await sql`DROP TABLE IF EXISTS public.agent_events CASCADE`;
    await sql`DROP TABLE IF EXISTS public.receipts CASCADE`;
    await sql`DROP TABLE IF EXISTS public.entity_members CASCADE`;
    await sql`DROP TABLE IF EXISTS public.entities CASCADE`;
    await sql`DROP TABLE IF EXISTS public.subscriptions CASCADE`;
    await sql`DROP TABLE IF EXISTS public.subscription_categories CASCADE`;
    await sql`DROP TABLE IF EXISTS public.business_analytics CASCADE`;

    // Drop core tables
    await sql`DROP TABLE IF EXISTS public.activity_logs CASCADE`;
    await sql`DROP TABLE IF EXISTS public.settlements CASCADE`;
    await sql`DROP TABLE IF EXISTS public.expense_splits CASCADE`;
    await sql`DROP TABLE IF EXISTS public.expenses CASCADE`;
    await sql`DROP TABLE IF EXISTS public.transactions CASCADE`;
    await sql`DROP TABLE IF EXISTS public.group_members CASCADE`;
    await sql`DROP TABLE IF EXISTS public.groups CASCADE`;
    await sql`DROP TABLE IF EXISTS public.profiles CASCADE`;

    // Drop enums
    await sql`DROP TYPE IF EXISTS public.group_type CASCADE`;
    await sql`DROP TYPE IF EXISTS public.member_role CASCADE`;
    await sql`DROP TYPE IF EXISTS public.expense_category CASCADE`;
    await sql`DROP TYPE IF EXISTS public.split_type CASCADE`;
    await sql`DROP TYPE IF EXISTS public.settlement_status CASCADE`;
    await sql`DROP TYPE IF EXISTS public.payment_method CASCADE`;

    // Drop functions
    await sql`DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE`;
    await sql`DROP FUNCTION IF EXISTS public.handle_user_update() CASCADE`;
    await sql`DROP FUNCTION IF EXISTS public.generate_invite_code() CASCADE`;
    await sql`DROP FUNCTION IF EXISTS public.get_user_group_ids(uuid) CASCADE`;
    await sql`DROP FUNCTION IF EXISTS public.is_group_admin(uuid, uuid) CASCADE`;
    await sql`DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE`;
    await sql`DROP FUNCTION IF EXISTS public.set_group_invite_code() CASCADE`;
    await sql`DROP FUNCTION IF EXISTS public.update_entity_updated_at() CASCADE`;

    // Drop extensions (optional, comment out if you want to keep them)
    // await sql`DROP EXTENSION IF EXISTS vector CASCADE`;
    // await sql`DROP EXTENSION IF EXISTS pg_trgm CASCADE`;

    console.log('✅ All tables, types, and functions dropped!\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}

resetDatabase();
