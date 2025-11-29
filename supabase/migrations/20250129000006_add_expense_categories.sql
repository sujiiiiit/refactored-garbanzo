-- =============================================
-- EXPENSE CATEGORIES (master data with GST mapping)
-- =============================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  parent_category TEXT,

  -- GST mapping
  default_hsn_sac TEXT,
  default_gst_rate DECIMAL(5,2),

  -- GL mapping
  gl_code TEXT,
  gl_description TEXT,

  -- Business vs Personal
  applicable_to TEXT[] DEFAULT ARRAY['individual', 'business'],

  -- Metadata
  icon TEXT,
  color TEXT,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expense_categories_name ON expense_categories(name);
CREATE INDEX idx_expense_categories_parent ON expense_categories(parent_category);

-- Seed default Indian expense categories with GST rates
INSERT INTO expense_categories (name, parent_category, default_gst_rate, gl_code, applicable_to) VALUES
  ('Food & Dining', NULL, 5.00, '6050', ARRAY['individual', 'business']),
  ('Restaurants', 'Food & Dining', 5.00, '6050', ARRAY['individual', 'business']),
  ('Groceries', 'Food & Dining', 0.00, '6050', ARRAY['individual', 'business']),
  ('Cafe', 'Food & Dining', 5.00, '6050', ARRAY['individual', 'business']),

  ('Transportation', NULL, 5.00, '6200', ARRAY['individual', 'business']),
  ('Fuel', 'Transportation', 18.00, '6210', ARRAY['individual', 'business']),
  ('Cab/Taxi', 'Transportation', 5.00, '6200', ARRAY['individual', 'business']),
  ('Public Transport', 'Transportation', 5.00, '6200', ARRAY['individual', 'business']),

  ('Housing', NULL, 18.00, '6100', ARRAY['individual', 'business']),
  ('Rent', 'Housing', 18.00, '6100', ARRAY['individual', 'business']),
  ('Utilities', 'Housing', 18.00, '6100', ARRAY['individual', 'business']),

  ('Entertainment', NULL, 18.00, '6050', ARRAY['individual']),
  ('Movies', 'Entertainment', 18.00, '6050', ARRAY['individual']),
  ('Streaming', 'Entertainment', 18.00, '6300', ARRAY['individual']),

  ('Shopping', NULL, 18.00, '6150', ARRAY['individual', 'business']),
  ('Clothing', 'Shopping', 5.00, NULL, ARRAY['individual']),
  ('Electronics', 'Shopping', 18.00, '6150', ARRAY['individual', 'business']),

  ('Healthcare', NULL, 0.00, '6050', ARRAY['individual', 'business']),
  ('Medicines', 'Healthcare', 0.00, '6050', ARRAY['individual', 'business']),
  ('Doctor Visits', 'Healthcare', 0.00, '6050', ARRAY['individual', 'business']),

  ('Software & Tools', NULL, 18.00, '6300', ARRAY['business']),
  ('SaaS Subscriptions', 'Software & Tools', 18.00, '6300', ARRAY['business']),
  ('Cloud Services', 'Software & Tools', 18.00, '6300', ARRAY['business']),

  ('Marketing', NULL, 18.00, '6400', ARRAY['business']),
  ('Advertising', 'Marketing', 18.00, '6400', ARRAY['business']),
  ('Social Media', 'Marketing', 18.00, '6400', ARRAY['business']),

  ('Salaries', NULL, 0.00, '5000', ARRAY['business']),
  ('Full-time', 'Salaries', 0.00, '5000', ARRAY['business']),
  ('Contractors', 'Salaries', 0.00, '5010', ARRAY['business']),

  ('Office Supplies', NULL, 18.00, '6150', ARRAY['business']),
  ('Stationery', 'Office Supplies', 18.00, '6150', ARRAY['business']),

  ('Travel', NULL, 5.00, '6200', ARRAY['individual', 'business']),
  ('Flights', 'Travel', 5.00, '6200', ARRAY['individual', 'business']),
  ('Hotels', 'Travel', 18.00, '6200', ARRAY['individual', 'business']),

  ('Education', NULL, 0.00, NULL, ARRAY['individual']),
  ('Insurance', NULL, 18.00, NULL, ARRAY['individual', 'business']),
  ('Gifts', NULL, 18.00, NULL, ARRAY['individual']),
  ('Other', NULL, 18.00, NULL, ARRAY['individual', 'business'])
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE expense_categories IS 'Master expense categories with GST and GL code mappings for India';
