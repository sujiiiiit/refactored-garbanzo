# Database Setup Guide

This guide explains how to reset your old Supabase schema, apply new migrations, and seed dummy data.

## Overview

Your database setup uses:
- **Custom migration system** with tracking via `_migrations` table
- **Migration files** in `supabase/migrations/`
- **Scripts** for database management in `scripts/`

## Migration Files

Migrations are applied in this order (alphabetically):

1. `20250129000000_base_schema.sql` - Base tables (profiles, groups, expenses, transactions, etc.)
2. `20250129000001_add_business_entities.sql` - Business entities for Persona B
3. `20250129000002_add_receipts_ocr.sql` - OCR receipts and embeddings
4. `20250129000003_add_agent_system.sql` - AI agent events and insights
5. `20250129000004_add_subscriptions.sql` - Subscription tracking
6. `20250129000005_add_business_analytics.sql` - Analytics tables
7. `20250129000006_add_expense_categories.sql` - Extended categories

## Available Commands

### Fresh Start (Recommended)

```bash
pnpm db:fresh
```

This command:
1. Drops all existing tables, types, and functions
2. Runs all migrations in order
3. Sets up auth triggers and RLS policies
4. Seeds dummy data for testing

**Use this when**: You want to completely reset your database with new schema and test data.

---

### Individual Commands

#### 1. Reset Database (Drop Everything)

```bash
pnpm db:drop
```

Drops all tables, types, functions, and the migration tracking table.

**Warning**: This is destructive and cannot be undone!

---

#### 2. Run Migrations

```bash
pnpm db:migrate
```

Runs all pending migrations that haven't been applied yet. The script tracks applied migrations in the `_migrations` table.

**Use this when**:
- You've added new migration files
- You want to apply migrations without resetting

---

#### 3. Setup Auth & RLS

```bash
pnpm db:setup
```

Sets up:
- Profile creation trigger when users sign up
- Profile update trigger when users update their info
- Row Level Security policies
- Permissions for Supabase roles

**Use this when**: After running migrations, to configure auth integration.

---

#### 4. Seed Dummy Data

```bash
pnpm db:seed
```

Creates test data:
- 3 test users (Alice, Bob, Charlie)
- 3 groups (Trip, Flat, Restaurant)
- 5 expenses with splits
- 3 settlements
- Activity logs
- Business transactions

**Use this when**: You want to populate the database with sample data for testing.

---

#### 5. Reset + Migrate + Setup (No Seed)

```bash
pnpm db:reset
```

Same as `db:fresh` but without seeding data.

**Use this when**: You want a clean database but will add your own data manually.

---

## Step-by-Step Guide

### Option A: Complete Fresh Start (Recommended for Testing)

```bash
# One command to do everything
pnpm db:fresh
```

### Option B: Manual Step-by-Step

```bash
# Step 1: Drop old schema
pnpm db:drop

# Step 2: Run all migrations
pnpm db:migrate

# Step 3: Setup auth triggers and RLS
pnpm db:setup

# Step 4: Seed test data
pnpm db:seed
```

### Option C: Adding New Migrations (Without Reset)

If you already have data and just want to add new migrations:

```bash
# Only run new migrations
pnpm db:migrate
```

---

## Test User Credentials

After seeding, you'll have these test users:

| Email | Name | ID | Currency |
|-------|------|-----|----------|
| alice@example.com | Alice Johnson | a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11 | USD |
| bob@example.com | Bob Smith | b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22 | USD |
| charlie@example.com | Charlie Davis | c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33 | INR |

**Note**: These are profiles only. You'll need to create corresponding `auth.users` entries if using Supabase Authentication, or use service_role key to bypass RLS.

---

## Test Data Created

### Groups
1. **Weekend Trip to Goa** (Trip) - Alice, Bob, Charlie
2. **Apartment 301** (Flat) - Alice, Bob
3. **Team Lunch** (Restaurant) - Alice, Charlie

### Expenses
1. Hotel Booking - ₹15,000 (split among 3)
2. Seafood Dinner - ₹3,500 (split among 3)
3. Monthly Rent - $2,400 (split between 2)
4. Electricity Bill - $120 (split between 2)
5. Pizza Party - $85 (split between 2)

### Settlements
1. Bob → Alice: ₹3,833.33 (pending)
2. Alice → Bob: $1,140 (completed)
3. Charlie → Alice: $42.50 (pending)

---

## Adding New Migrations

To create a new migration:

1. Create a new file in `supabase/migrations/` with format:
   ```
   YYYYMMDDHHMMSS_description.sql
   ```
   Example: `20250129120000_add_notifications.sql`

2. Write your SQL:
   ```sql
   -- Add your migration SQL here
   CREATE TABLE notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES profiles(id),
     message TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. Run migrations:
   ```bash
   pnpm db:migrate
   ```

The migration will be tracked in `_migrations` table and won't run again.

---

## Troubleshooting

### Error: "DATABASE_URL is not set"

Make sure you have `.env.local` with:
```env
DATABASE_URL="postgresql://postgres:[password]@[host]:[port]/[database]"
```

### Error: "relation does not exist"

You need to run migrations first:
```bash
pnpm db:fresh
```

### Error: "permission denied"

Make sure your DATABASE_URL uses the `service_role` key or `postgres` role with full permissions.

### Migration Already Applied

Migrations are tracked in `_migrations` table. If you want to re-run a migration:
1. Delete the entry from `_migrations` table
2. Run `pnpm db:migrate`

Or reset everything with `pnpm db:fresh`

---

## Important Notes

1. **Always backup production data** before running reset commands
2. Use `db:fresh` for development/testing only
3. Use `db:migrate` for production to apply new migrations safely
4. The seed script creates profiles directly - ensure auth.users exists or use service_role
5. All tables have RLS enabled - use service_role key or create proper auth.users

---

## Database Schema

### Core Tables (Base Schema)
- `profiles` - User profiles linked to auth.users
- `groups` - Expense sharing groups
- `group_members` - Group membership
- `expenses` - Expense records
- `expense_splits` - How expenses are split
- `settlements` - Payments between users
- `activity_logs` - Audit trail
- `transactions` - Business transactions

### Business Features
- `entities` - Business entities (startups, companies)
- `entity_members` - Entity access control
- `receipts` - OCR-processed receipts
- `agent_events` - AI agent execution logs
- `insights` - AI-generated insights
- `anomalies` - Detected spending anomalies
- `subscriptions` - Subscription tracking
- `business_analytics` - Analytics data

---

## Next Steps

After setting up your database:

1. **Test the connection**:
   ```bash
   pnpm dev
   ```

2. **View your data**:
   - Use Supabase Dashboard
   - Or run: `pnpm db:studio` (if configured)

3. **Create real users**:
   - Sign up through your app's auth flow
   - Or use Supabase Auth API

4. **Customize seed data**:
   - Edit `scripts/seed-db.ts`
   - Run `pnpm db:seed` to reload

Happy coding! 🚀
