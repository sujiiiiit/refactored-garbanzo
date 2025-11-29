-- =============================================
-- SUBSCRIPTIONS (recurring expenses)
-- =============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id),

  name TEXT NOT NULL,
  merchant_name TEXT,
  category TEXT DEFAULT 'subscription',

  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',

  -- Recurrence
  billing_cycle TEXT CHECK (billing_cycle IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  billing_day INTEGER,
  next_billing_date DATE,

  -- Detection metadata
  detected_by_agent BOOLEAN DEFAULT FALSE,
  detection_confidence DECIMAL(3,2),
  matched_transactions UUID[],

  -- Sharing
  is_shared BOOLEAN DEFAULT FALSE,
  shared_with UUID[],
  sharing_split JSONB,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  reminder_enabled BOOLEAN DEFAULT TRUE,
  auto_categorize BOOLEAN DEFAULT TRUE,

  start_date DATE,
  end_date DATE,
  cancelled_at TIMESTAMPTZ,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id) WHERE is_active;
CREATE INDEX idx_subscriptions_entity ON subscriptions(entity_id) WHERE is_active;
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date);
CREATE INDEX idx_subscriptions_merchant ON subscriptions(merchant_name);

-- Add subscription_id to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);
CREATE INDEX IF NOT EXISTS idx_transactions_subscription ON transactions(subscription_id);

-- Row Level Security
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_policy ON subscriptions
  FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() = ANY(shared_with) OR
    EXISTS (SELECT 1 FROM entity_members WHERE entity_id = subscriptions.entity_id AND user_id = auth.uid())
  );

CREATE POLICY subscriptions_insert_policy ON subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY subscriptions_update_policy ON subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Update trigger
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE subscriptions IS 'Recurring expense subscriptions with sharing support';
