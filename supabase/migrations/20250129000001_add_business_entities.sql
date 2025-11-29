-- =============================================
-- BUSINESS ENTITIES (for Persona B)
-- =============================================

-- Add persona and business fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS persona TEXT DEFAULT 'individual' CHECK (persona IN ('individual', 'business'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_business_user BOOLEAN DEFAULT FALSE;

-- Create entities table
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('startup', 'retail', 'investment_firm', 'other')),
  gstin TEXT UNIQUE,
  pan TEXT,
  registered_address JSONB,
  entity_metadata JSONB DEFAULT '{}',
  monthly_burn_target DECIMAL(12,2),
  runway_months INTEGER,
  currency TEXT DEFAULT 'INR',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_owner ON entities(owner_id);
CREATE INDEX idx_entities_gstin ON entities(gstin) WHERE gstin IS NOT NULL;

-- Create entity_members table
CREATE TABLE IF NOT EXISTS entity_members (
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'finance', 'viewer')),
  permissions JSONB DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (entity_id, user_id)
);

CREATE INDEX idx_entity_members_user ON entity_members(user_id);

-- Add entity_id to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_transactions_entity ON transactions(entity_id) WHERE deleted_at IS NULL;

-- Row Level Security for entities
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- Users can see their own entities
CREATE POLICY entities_select_policy ON entities
  FOR SELECT USING (auth.uid() = owner_id);

-- Users can insert their own entities
CREATE POLICY entities_insert_policy ON entities
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Entity members can see entity data
CREATE POLICY entity_members_select_policy ON entity_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entity_members em
      WHERE em.entity_id = entity_members.entity_id
      AND em.user_id = auth.uid()
    )
  );

-- Update trigger for entities
CREATE OR REPLACE FUNCTION update_entity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW
  EXECUTE FUNCTION update_entity_updated_at();

COMMENT ON TABLE entities IS 'Business entities (startups, retailers, etc.) for Persona B users';
COMMENT ON TABLE entity_members IS 'Multi-user access control for business entities';
