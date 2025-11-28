-- =============================================
-- SUPABASE AUTH + PROFILES INTEGRATION
-- =============================================
-- This script sets up the connection between Supabase Auth (auth.users)
-- and our custom profiles table. Run this in Supabase SQL Editor.

-- 1. First, create profiles for any existing auth users
INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', raw_user_meta_data->>'user_name'),
  raw_user_meta_data->>'avatar_url',
  created_at,
  NOW()
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
  updated_at = NOW();

-- 2. Create function to handle new user signup
-- This function is called automatically when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'user_name'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;

-- 3. Create trigger on auth.users table
-- This triggers the handle_new_user function whenever a new user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Optional: Create function to handle user updates (profile sync)
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET
    email = NEW.email,
    full_name = COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      public.profiles.full_name
    ),
    avatar_url = COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      public.profiles.avatar_url
    ),
    updated_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Trigger for user updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_update();

-- 5. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view group member profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their groups" ON public.groups;
DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
DROP POLICY IF EXISTS "Admins can update groups" ON public.groups;
DROP POLICY IF EXISTS "Admins can delete groups" ON public.groups;

-- PROFILES policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view group member profiles"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT gm2.user_id 
      FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
    )
  );

-- GROUPS policies
CREATE POLICY "Users can view their groups"
  ON public.groups FOR SELECT
  USING (
    id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update groups"
  ON public.groups FOR UPDATE
  USING (
    id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete groups"
  ON public.groups FOR DELETE
  USING (
    id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- GROUP_MEMBERS policies
DROP POLICY IF EXISTS "Users can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON public.group_members;
DROP POLICY IF EXISTS "Admins can manage members" ON public.group_members;

CREATE POLICY "Users can view group members"
  ON public.group_members FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can join groups"
  ON public.group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups"
  ON public.group_members FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage members"
  ON public.group_members FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- EXPENSES policies
DROP POLICY IF EXISTS "Users can view group expenses" ON public.expenses;
DROP POLICY IF EXISTS "Members can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Creators can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Creators can delete expenses" ON public.expenses;

CREATE POLICY "Users can view group expenses"
  ON public.expenses FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can create expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Creators can update expenses"
  ON public.expenses FOR UPDATE
  USING (
    created_by = auth.uid() OR
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Creators can delete expenses"
  ON public.expenses FOR DELETE
  USING (
    created_by = auth.uid() OR
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- EXPENSE_SPLITS policies
DROP POLICY IF EXISTS "Users can view splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Members can manage splits" ON public.expense_splits;

CREATE POLICY "Users can view splits"
  ON public.expense_splits FOR SELECT
  USING (
    expense_id IN (
      SELECT id FROM public.expenses 
      WHERE group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Members can manage splits"
  ON public.expense_splits FOR ALL
  USING (
    expense_id IN (
      SELECT id FROM public.expenses 
      WHERE group_id IN (
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      )
    )
  );

-- SETTLEMENTS policies
DROP POLICY IF EXISTS "Users can view settlements" ON public.settlements;
DROP POLICY IF EXISTS "Members can create settlements" ON public.settlements;
DROP POLICY IF EXISTS "Participants can update settlements" ON public.settlements;

CREATE POLICY "Users can view settlements"
  ON public.settlements FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can create settlements"
  ON public.settlements FOR INSERT
  WITH CHECK (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Participants can update settlements"
  ON public.settlements FOR UPDATE
  USING (
    from_user = auth.uid() OR to_user = auth.uid() OR
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ACTIVITY_LOGS policies
DROP POLICY IF EXISTS "Users can view activity" ON public.activity_logs;
DROP POLICY IF EXISTS "Members can create activity" ON public.activity_logs;

CREATE POLICY "Users can view activity"
  ON public.activity_logs FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can create activity"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- =============================================
-- VERIFICATION
-- =============================================
-- Run this to verify profiles were created:
-- SELECT p.id, p.email, p.full_name, au.email as auth_email 
-- FROM public.profiles p 
-- JOIN auth.users au ON p.id = au.id;
