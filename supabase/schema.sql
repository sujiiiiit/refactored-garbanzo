-- SmartSplit Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    currency TEXT DEFAULT 'USD',
    is_business_user BOOLEAN DEFAULT FALSE,
    company_id UUID,
    role TEXT DEFAULT 'user', -- user, manager, admin
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GROUPS TABLE
-- ============================================
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

CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    type group_type DEFAULT 'other',
    image_url TEXT,
    currency TEXT DEFAULT 'USD',
    invite_code TEXT UNIQUE,
    is_business BOOLEAN DEFAULT FALSE,
    company_id UUID,
    department_id UUID,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GROUP MEMBERS TABLE
-- ============================================
CREATE TYPE member_role AS ENUM ('admin', 'member', 'viewer');

CREATE TABLE public.group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role member_role DEFAULT 'member',
    nickname TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- ============================================
-- EXPENSE CATEGORIES
-- ============================================
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

-- ============================================
-- SPLIT TYPE
-- ============================================
CREATE TYPE split_type AS ENUM (
    'equal',
    'unequal',
    'percentage',
    'shares'
);

-- ============================================
-- EXPENSES TABLE
-- ============================================
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'USD',
    paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    category expense_category DEFAULT 'other',
    split_type split_type DEFAULT 'equal',
    expense_date DATE DEFAULT CURRENT_DATE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_interval TEXT, -- daily, weekly, monthly, yearly
    next_occurrence DATE,
    is_settled BOOLEAN DEFAULT FALSE,
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_status TEXT DEFAULT 'pending', -- pending, approved, rejected
    approved_by UUID REFERENCES public.profiles(id),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EXPENSE SPLITS TABLE
-- ============================================
CREATE TABLE public.expense_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    percentage DECIMAL(5, 2),
    shares INTEGER,
    is_paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(expense_id, user_id)
);

-- ============================================
-- SETTLEMENTS TABLE
-- ============================================
CREATE TYPE settlement_status AS ENUM ('pending', 'completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'bank_transfer', 'card', 'wallet', 'other');

CREATE TABLE public.settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    from_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    to_user UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
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

-- ============================================
-- ATTACHMENTS TABLE
-- ============================================
CREATE TABLE public.attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RECURRING EXPENSES TABLE
-- ============================================
CREATE TABLE public.recurring_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    interval TEXT NOT NULL, -- daily, weekly, monthly, yearly
    start_date DATE NOT NULL,
    end_date DATE,
    next_occurrence DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BUSINESS/CORPORATE TABLES
-- ============================================

-- Companies Table
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    logo_url TEXT,
    address TEXT,
    currency TEXT DEFAULT 'USD',
    billing_email TEXT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Departments Table
CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    budget DECIMAL(12, 2),
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Wallets Table
CREATE TABLE public.business_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    balance DECIMAL(12, 2) DEFAULT 0,
    contribution_percentage DECIMAL(5, 2) DEFAULT 0, -- % company contributes
    monthly_limit DECIMAL(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet Transactions Table
CREATE TABLE public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES public.business_wallets(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    transaction_type TEXT NOT NULL, -- credit, debit
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approvals Table
CREATE TABLE public.approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    comments TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACTIVITY LOGS TABLE
-- ============================================
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT, -- expense, settlement, member, group
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_expenses_group ON public.expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX idx_expense_splits_expense ON public.expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user ON public.expense_splits(user_id);
CREATE INDEX idx_settlements_group ON public.settlements(group_id);
CREATE INDEX idx_settlements_users ON public.settlements(from_user, to_user);
CREATE INDEX idx_attachments_expense ON public.attachments(expense_id);
CREATE INDEX idx_activity_logs_group ON public.activity_logs(group_id);
CREATE INDEX idx_groups_invite_code ON public.groups(invite_code);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view profiles of group members" ON public.profiles
    FOR SELECT USING (
        id IN (
            SELECT gm.user_id FROM public.group_members gm
            WHERE gm.group_id IN (
                SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
            )
        )
    );

-- Groups policies
CREATE POLICY "Users can view groups they belong to" ON public.groups
    FOR SELECT USING (
        id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can create groups" ON public.groups
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Group admins can update groups" ON public.groups
    FOR UPDATE USING (
        id IN (
            SELECT group_id FROM public.group_members 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Group admins can delete groups" ON public.groups
    FOR DELETE USING (
        id IN (
            SELECT group_id FROM public.group_members 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- Group members policies
CREATE POLICY "Users can view members of their groups" ON public.group_members
    FOR SELECT USING (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Group admins can manage members" ON public.group_members
    FOR ALL USING (
        group_id IN (
            SELECT group_id FROM public.group_members 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can join groups" ON public.group_members
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Expenses policies
CREATE POLICY "Users can view expenses of their groups" ON public.expenses
    FOR SELECT USING (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Group members can create expenses" ON public.expenses
    FOR INSERT WITH CHECK (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Expense creators can update their expenses" ON public.expenses
    FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Expense creators can delete their expenses" ON public.expenses
    FOR DELETE USING (created_by = auth.uid());

-- Expense splits policies
CREATE POLICY "Users can view splits of their groups expenses" ON public.expense_splits
    FOR SELECT USING (
        expense_id IN (
            SELECT id FROM public.expenses 
            WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Users can create splits for their expenses" ON public.expense_splits
    FOR INSERT WITH CHECK (
        expense_id IN (SELECT id FROM public.expenses WHERE created_by = auth.uid())
    );

-- Settlements policies
CREATE POLICY "Users can view settlements of their groups" ON public.settlements
    FOR SELECT USING (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can create settlements" ON public.settlements
    FOR INSERT WITH CHECK (
        from_user = auth.uid() AND
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Settlement parties can update" ON public.settlements
    FOR UPDATE USING (from_user = auth.uid() OR to_user = auth.uid());

-- Attachments policies
CREATE POLICY "Users can view attachments of their groups" ON public.attachments
    FOR SELECT USING (
        expense_id IN (
            SELECT id FROM public.expenses 
            WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Users can upload attachments" ON public.attachments
    FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- Activity logs policies
CREATE POLICY "Users can view activity logs of their groups" ON public.activity_logs
    FOR SELECT USING (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_settlements_updated_at
    BEFORE UPDATE ON public.settlements
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to generate invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
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
CREATE OR REPLACE FUNCTION public.set_group_invite_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invite_code IS NULL THEN
        NEW.invite_code := public.generate_invite_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invite_code
    BEFORE INSERT ON public.groups
    FOR EACH ROW EXECUTE FUNCTION public.set_group_invite_code();

-- Function to log activity
CREATE OR REPLACE FUNCTION public.log_activity(
    p_group_id UUID,
    p_user_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO public.activity_logs (group_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (p_group_id, p_user_id, p_action, p_entity_type, p_entity_id, p_metadata)
    RETURNING id INTO log_id;
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VIEWS FOR BALANCE CALCULATIONS
-- ============================================

-- View for calculating group balances
CREATE OR REPLACE VIEW public.group_balances AS
SELECT 
    g.id as group_id,
    gm.user_id,
    p.full_name,
    p.email,
    COALESCE(paid.total_paid, 0) as total_paid,
    COALESCE(owed.total_owed, 0) as total_owed,
    COALESCE(paid.total_paid, 0) - COALESCE(owed.total_owed, 0) as balance
FROM public.groups g
JOIN public.group_members gm ON g.id = gm.group_id
JOIN public.profiles p ON gm.user_id = p.id
LEFT JOIN (
    SELECT 
        group_id,
        paid_by as user_id,
        SUM(amount) as total_paid
    FROM public.expenses
    WHERE is_settled = FALSE
    GROUP BY group_id, paid_by
) paid ON g.id = paid.group_id AND gm.user_id = paid.user_id
LEFT JOIN (
    SELECT 
        e.group_id,
        es.user_id,
        SUM(es.amount) as total_owed
    FROM public.expense_splits es
    JOIN public.expenses e ON es.expense_id = e.id
    WHERE e.is_settled = FALSE
    GROUP BY e.group_id, es.user_id
) owed ON g.id = owed.group_id AND gm.user_id = owed.user_id;
