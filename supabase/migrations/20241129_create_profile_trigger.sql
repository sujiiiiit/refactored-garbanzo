-- Function to handle new user creation
-- This creates a profile entry when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Trigger to call the function on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for groups
CREATE POLICY "Users can view groups they are members of"
  ON public.groups FOR SELECT
  USING (
    id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update groups"
  ON public.groups FOR UPDATE
  USING (
    id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Group admins can delete groups"
  ON public.groups FOR DELETE
  USING (
    id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for group_members
CREATE POLICY "Users can view members of their groups"
  ON public.group_members FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join groups"
  ON public.group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups"
  ON public.group_members FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage group members"
  ON public.group_members FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for expenses
CREATE POLICY "Users can view expenses in their groups"
  ON public.expenses FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Expense creators and admins can update expenses"
  ON public.expenses FOR UPDATE
  USING (
    created_by = auth.uid() OR 
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Expense creators and admins can delete expenses"
  ON public.expenses FOR DELETE
  USING (
    created_by = auth.uid() OR 
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for expense_splits
CREATE POLICY "Users can view splits in their groups"
  ON public.expense_splits FOR SELECT
  USING (
    expense_id IN (
      SELECT e.id FROM public.expenses e
      JOIN public.group_members gm ON e.group_id = gm.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create splits"
  ON public.expense_splits FOR INSERT
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM public.expenses e
      JOIN public.group_members gm ON e.group_id = gm.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update splits"
  ON public.expense_splits FOR UPDATE
  USING (
    expense_id IN (
      SELECT e.id FROM public.expenses e
      JOIN public.group_members gm ON e.group_id = gm.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete splits"
  ON public.expense_splits FOR DELETE
  USING (
    expense_id IN (
      SELECT e.id FROM public.expenses e
      JOIN public.group_members gm ON e.group_id = gm.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

-- RLS Policies for settlements
CREATE POLICY "Users can view settlements in their groups"
  ON public.settlements FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create settlements"
  ON public.settlements FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Settlement participants can update settlements"
  ON public.settlements FOR UPDATE
  USING (
    from_user = auth.uid() OR to_user = auth.uid() OR
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for activity_logs
CREATE POLICY "Users can view activity in their groups"
  ON public.activity_logs FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

-- Allow profiles to be viewable by group members (for showing member info)
CREATE POLICY "Users can view profiles of their group members"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT gm2.user_id FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
    )
    OR id = auth.uid()
  );
