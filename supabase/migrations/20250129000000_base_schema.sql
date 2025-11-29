-- =============================================
-- BASE SCHEMA - Replaces old schema.sql
-- Run this first before all other migrations
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE group_type AS ENUM (
    'restaurant',
    'trip',
    'flat',
    'hostel',
    'subscription',
    'corporate',
    'events',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM (
    'food',
    'travel',
    'accommodation',
    'entertainment',
    'shopping',
    'utilities',
    'rent',
    'subscription',
    'transportation',
    'healthcare',
    'corporate',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE split_type AS ENUM (
    'equal',
    'unequal',
    'percentage',
    'shares'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM ('pending', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'cash',
    'upi',
    'bank_transfer',
    'card',
    'wallet',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_email ON profiles(email);

-- ============================================
-- GROUPS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  type group_type DEFAULT 'other',
  image_url TEXT,
  currency TEXT DEFAULT 'USD',
  invite_code TEXT UNIQUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_groups_invite_code ON groups(invite_code);
CREATE INDEX idx_groups_created_by ON groups(created_by);

-- ============================================
-- GROUP MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role DEFAULT 'member',
  nickname TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);

-- ============================================
-- EXPENSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'USD',
  paid_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category expense_category DEFAULT 'other',
  split_type split_type DEFAULT 'equal',
  expense_date DATE DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_interval TEXT,
  next_occurrence DATE,
  is_settled BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);

-- ============================================
-- EXPENSE SPLITS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS expense_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  percentage DECIMAL(5, 2),
  shares INTEGER,
  is_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expense_id, user_id)
);

CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);

-- ============================================
-- SETTLEMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  from_user UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_user UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'USD',
  status settlement_status DEFAULT 'pending',
  payment_method payment_method,
  payment_reference TEXT,
  notes TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_settlements_group ON settlements(group_id);
CREATE INDEX idx_settlements_from_user ON settlements(from_user);
CREATE INDEX idx_settlements_to_user ON settlements(to_user);

-- ============================================
-- ACTIVITY LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_group ON activity_logs(group_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

-- ============================================
-- TRANSACTIONS TABLE (for business features)
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Transaction details
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  category TEXT,
  merchant TEXT,
  description TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON transactions(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX idx_transactions_category ON transactions(category);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_settlements_updated_at
  BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to generate invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate invite code for new groups
CREATE OR REPLACE FUNCTION set_group_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invite_code
  BEFORE INSERT ON groups
  FOR EACH ROW EXECUTE FUNCTION set_group_invite_code();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Simple policies for authenticated users (you can make these more restrictive)
CREATE POLICY "Enable all for authenticated users" ON profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON groups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON group_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON expense_splits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON settlements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON activity_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated users" ON transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role policies
CREATE POLICY "Enable all for service role" ON profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON group_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON expenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON expense_splits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON settlements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON activity_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

COMMENT ON TABLE transactions IS 'Financial transactions for business users';
