import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function resetDatabase() {
  console.log('🗑️  Dropping all tables and types...\n');

  try {
    // Drop all tables
    await sql`DROP TABLE IF EXISTS public.activity_logs CASCADE`;
    await sql`DROP TABLE IF EXISTS public.settlements CASCADE`;
    await sql`DROP TABLE IF EXISTS public.expense_splits CASCADE`;
    await sql`DROP TABLE IF EXISTS public.expenses CASCADE`;
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

    console.log('✅ All tables, types, and functions dropped!\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}

resetDatabase();
