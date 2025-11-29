import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env' });
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

async function seedDatabase() {
  console.log('🌱 Seeding database with dummy data...\n');

  try {
    // =============================================
    // STEP 1: Create test profiles
    // =============================================
    console.log('1️⃣ Creating test profiles...');

    // Note: These UUIDs should match actual auth.users if you're using Supabase Auth
    // For testing, we'll create standalone profiles
    const user1Id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const user2Id = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
    const user3Id = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    // Note: This will only work if you manually create auth.users first
    // Or use service_role to bypass RLS
    await sql`
      INSERT INTO public.profiles (id, email, full_name, avatar_url, phone, currency)
      VALUES
        (${user1Id}, 'alice@example.com', 'Alice Johnson', 'https://i.pravatar.cc/150?u=alice', '+1234567890', 'USD'),
        (${user2Id}, 'bob@example.com', 'Bob Smith', 'https://i.pravatar.cc/150?u=bob', '+1234567891', 'USD'),
        (${user3Id}, 'charlie@example.com', 'Charlie Davis', 'https://i.pravatar.cc/150?u=charlie', '+1234567892', 'INR')
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW()
    `;
    console.log('   ✅ Created 3 test profiles\n');

    // =============================================
    // STEP 2: Create test groups
    // =============================================
    console.log('2️⃣ Creating test groups...');

    const group1 = await sql`
      INSERT INTO public.groups (name, description, type, currency, created_by)
      VALUES ('Weekend Trip to Goa', 'Beach vacation with friends', 'trip', 'INR', ${user1Id})
      RETURNING id
    `;
    const group1Id = group1[0].id;

    const group2 = await sql`
      INSERT INTO public.groups (name, description, type, currency, created_by)
      VALUES ('Apartment 301', 'Monthly rent and utilities', 'flat', 'USD', ${user2Id})
      RETURNING id
    `;
    const group2Id = group2[0].id;

    const group3 = await sql`
      INSERT INTO public.groups (name, description, type, currency, created_by)
      VALUES ('Team Lunch', 'Office team lunch expenses', 'restaurant', 'USD', ${user1Id})
      RETURNING id
    `;
    const group3Id = group3[0].id;

    console.log('   ✅ Created 3 test groups\n');

    // =============================================
    // STEP 3: Add members to groups
    // =============================================
    console.log('3️⃣ Adding members to groups...');

    await sql`
      INSERT INTO public.group_members (group_id, user_id, role, nickname)
      VALUES
        (${group1Id}, ${user1Id}, 'admin', 'Alice'),
        (${group1Id}, ${user2Id}, 'member', 'Bob'),
        (${group1Id}, ${user3Id}, 'member', 'Charlie'),
        (${group2Id}, ${user1Id}, 'member', 'Alice'),
        (${group2Id}, ${user2Id}, 'admin', 'Bob'),
        (${group3Id}, ${user1Id}, 'admin', 'Alice'),
        (${group3Id}, ${user3Id}, 'member', 'Charlie')
      ON CONFLICT (group_id, user_id) DO NOTHING
    `;
    console.log('   ✅ Added members to groups\n');

    // =============================================
    // STEP 4: Create expenses
    // =============================================
    console.log('4️⃣ Creating test expenses...');

    // Group 1 expenses (Trip)
    const expense1 = await sql`
      INSERT INTO public.expenses (
        group_id, title, description, amount, currency, paid_by,
        category, split_type, expense_date, created_by
      )
      VALUES (
        ${group1Id}, 'Hotel Booking', 'Beach resort for 3 nights',
        15000.00, 'INR', ${user1Id}, 'accommodation', 'equal',
        CURRENT_DATE - INTERVAL '2 days', ${user1Id}
      )
      RETURNING id
    `;

    const expense2 = await sql`
      INSERT INTO public.expenses (
        group_id, title, description, amount, currency, paid_by,
        category, split_type, expense_date, created_by
      )
      VALUES (
        ${group1Id}, 'Dinner at Fisherman''s Wharf', 'Seafood dinner',
        3500.00, 'INR', ${user2Id}, 'food', 'equal',
        CURRENT_DATE - INTERVAL '1 day', ${user2Id}
      )
      RETURNING id
    `;

    // Group 2 expenses (Flat)
    const expense3 = await sql`
      INSERT INTO public.expenses (
        group_id, title, description, amount, currency, paid_by,
        category, split_type, expense_date, created_by
      )
      VALUES (
        ${group2Id}, 'Monthly Rent', 'December rent',
        2400.00, 'USD', ${user2Id}, 'rent', 'equal',
        CURRENT_DATE - INTERVAL '5 days', ${user2Id}
      )
      RETURNING id
    `;

    const expense4 = await sql`
      INSERT INTO public.expenses (
        group_id, title, description, amount, currency, paid_by,
        category, split_type, expense_date, created_by
      )
      VALUES (
        ${group2Id}, 'Electricity Bill', 'November electricity',
        120.00, 'USD', ${user1Id}, 'utilities', 'equal',
        CURRENT_DATE - INTERVAL '3 days', ${user1Id}
      )
      RETURNING id
    `;

    // Group 3 expenses (Restaurant)
    const expense5 = await sql`
      INSERT INTO public.expenses (
        group_id, title, description, amount, currency, paid_by,
        category, split_type, expense_date, created_by
      )
      VALUES (
        ${group3Id}, 'Pizza Party', 'Team celebration',
        85.00, 'USD', ${user1Id}, 'food', 'equal',
        CURRENT_DATE, ${user1Id}
      )
      RETURNING id
    `;

    console.log('   ✅ Created 5 test expenses\n');

    // =============================================
    // STEP 5: Create expense splits
    // =============================================
    console.log('5️⃣ Creating expense splits...');

    // Expense 1 splits (equal split among 3 members)
    await sql`
      INSERT INTO public.expense_splits (expense_id, user_id, amount, is_paid)
      VALUES
        (${expense1[0].id}, ${user1Id}, 5000.00, true),
        (${expense1[0].id}, ${user2Id}, 5000.00, false),
        (${expense1[0].id}, ${user3Id}, 5000.00, false)
    `;

    // Expense 2 splits
    await sql`
      INSERT INTO public.expense_splits (expense_id, user_id, amount, is_paid)
      VALUES
        (${expense2[0].id}, ${user1Id}, 1166.67, false),
        (${expense2[0].id}, ${user2Id}, 1166.67, true),
        (${expense2[0].id}, ${user3Id}, 1166.66, false)
    `;

    // Expense 3 splits (2 people)
    await sql`
      INSERT INTO public.expense_splits (expense_id, user_id, amount, is_paid)
      VALUES
        (${expense3[0].id}, ${user1Id}, 1200.00, false),
        (${expense3[0].id}, ${user2Id}, 1200.00, true)
    `;

    // Expense 4 splits
    await sql`
      INSERT INTO public.expense_splits (expense_id, user_id, amount, is_paid)
      VALUES
        (${expense4[0].id}, ${user1Id}, 60.00, true),
        (${expense4[0].id}, ${user2Id}, 60.00, false)
    `;

    // Expense 5 splits
    await sql`
      INSERT INTO public.expense_splits (expense_id, user_id, amount, is_paid)
      VALUES
        (${expense5[0].id}, ${user1Id}, 42.50, true),
        (${expense5[0].id}, ${user3Id}, 42.50, false)
    `;

    console.log('   ✅ Created expense splits\n');

    // =============================================
    // STEP 6: Create some settlements
    // =============================================
    console.log('6️⃣ Creating test settlements...');

    await sql`
      INSERT INTO public.settlements (
        group_id, from_user, to_user, amount, currency,
        status, payment_method, notes
      )
      VALUES
        (${group1Id}, ${user2Id}, ${user1Id}, 3833.33, 'INR', 'pending', 'upi', 'Will pay via UPI'),
        (${group2Id}, ${user1Id}, ${user2Id}, 1140.00, 'USD', 'completed', 'bank_transfer', 'Paid rent share'),
        (${group3Id}, ${user3Id}, ${user1Id}, 42.50, 'USD', 'pending', 'cash', null)
    `;

    console.log('   ✅ Created 3 test settlements\n');

    // =============================================
    // STEP 7: Create activity logs
    // =============================================
    console.log('7️⃣ Creating activity logs...');

    await sql`
      INSERT INTO public.activity_logs (group_id, user_id, action, entity_type, entity_id)
      VALUES
        (${group1Id}, ${user1Id}, 'created_group', 'group', ${group1Id}),
        (${group1Id}, ${user1Id}, 'added_expense', 'expense', ${expense1[0].id}),
        (${group1Id}, ${user2Id}, 'added_expense', 'expense', ${expense2[0].id}),
        (${group2Id}, ${user2Id}, 'created_group', 'group', ${group2Id}),
        (${group2Id}, ${user2Id}, 'added_expense', 'expense', ${expense3[0].id}),
        (${group3Id}, ${user1Id}, 'created_group', 'group', ${group3Id})
    `;

    console.log('   ✅ Created activity logs\n');

    // =============================================
    // STEP 8: Create business transactions (optional)
    // =============================================
    console.log('8️⃣ Creating business transactions...');

    await sql`
      INSERT INTO public.transactions (
        user_id, amount, currency, category, merchant,
        description, transaction_date, status
      )
      VALUES
        (${user1Id}, 150.00, 'USD', 'food', 'Starbucks', 'Coffee for team meeting', CURRENT_DATE - INTERVAL '1 day', 'completed'),
        (${user1Id}, 45.00, 'USD', 'transportation', 'Uber', 'Ride to client meeting', CURRENT_DATE - INTERVAL '2 days', 'completed'),
        (${user3Id}, 2500.00, 'INR', 'shopping', 'Amazon', 'Office supplies', CURRENT_DATE - INTERVAL '3 days', 'completed'),
        (${user3Id}, 800.00, 'INR', 'utilities', 'Electricity Company', 'Office electricity bill', CURRENT_DATE - INTERVAL '5 days', 'completed'),
        (${user2Id}, 120.00, 'USD', 'subscription', 'Netflix', 'Monthly subscription', CURRENT_DATE - INTERVAL '7 days', 'completed')
    `;

    console.log('   ✅ Created 5 business transactions\n');

    // =============================================
    // DONE!
    // =============================================
    console.log('═══════════════════════════════════════════');
    console.log('✅ DATABASE SEEDED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════\n');
    console.log('Summary:');
    console.log('  • 3 test users (profiles)');
    console.log('  • 3 groups (trip, flat, restaurant)');
    console.log('  • 7 group memberships');
    console.log('  • 5 expenses with splits');
    console.log('  • 3 settlements');
    console.log('  • 6 activity logs');
    console.log('  • 5 business transactions\n');
    console.log('Test Users:');
    console.log('  • alice@example.com');
    console.log('  • bob@example.com');
    console.log('  • charlie@example.com\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seedDatabase();
