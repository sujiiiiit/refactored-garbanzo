-- =============================================
-- RUNWAY PREDICTIONS (for business entities)
-- =============================================

-- Enable TimescaleDB extension for time-series data
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE IF NOT EXISTS runway_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id),

  -- Snapshot date
  prediction_date DATE NOT NULL,

  -- Current state
  current_cash_balance DECIMAL(12,2),
  monthly_revenue DECIMAL(12,2),
  monthly_burn DECIMAL(12,2),

  -- Predictions
  predicted_runway_months DECIMAL(5,2),
  predicted_zero_date DATE,
  confidence_interval JSONB,

  -- Scenario analysis
  scenarios JSONB,
  assumptions JSONB,

  -- Recommendations
  recommended_actions JSONB,

  -- Model metadata
  model_version TEXT,
  prediction_metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runway_predictions_entity ON runway_predictions(entity_id, prediction_date DESC);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('runway_predictions', 'prediction_date', if_not_exists => TRUE);

-- =============================================
-- BURN RATE HISTORY (time-series data)
-- =============================================

CREATE TABLE IF NOT EXISTS burn_rate_history (
  time TIMESTAMPTZ NOT NULL,
  entity_id UUID NOT NULL REFERENCES entities(id),

  daily_burn DECIMAL(12,2),
  weekly_burn DECIMAL(12,2),
  monthly_burn DECIMAL(12,2),

  category_breakdown JSONB,

  PRIMARY KEY (time, entity_id)
);

CREATE INDEX idx_burn_rate_entity ON burn_rate_history(entity_id, time DESC);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('burn_rate_history', 'time', if_not_exists => TRUE);

-- =============================================
-- CASHFLOW OPTIMIZATION (cross-entity balances)
-- =============================================

CREATE TABLE IF NOT EXISTS cashflow_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Involved entities
  entity_ids UUID[] NOT NULL,

  -- Current state
  current_balances JSONB,
  total_idle_cash DECIMAL(12,2),

  -- Optimization suggestion
  suggested_transfers JSONB,
  total_savings DECIMAL(12,2),
  implementation_complexity TEXT CHECK (implementation_complexity IN ('low', 'medium', 'high')),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'rejected')),
  approved_by UUID REFERENCES profiles(id),
  executed_at TIMESTAMPTZ,

  -- Agent metadata
  generated_by TEXT,
  generation_metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cashflow_optimizations_status ON cashflow_optimizations(status);
CREATE INDEX idx_cashflow_optimizations_created ON cashflow_optimizations(created_at DESC);

-- =============================================
-- MIS REPORTS (auto-generated management reports)
-- =============================================

CREATE TABLE IF NOT EXISTS mis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id),

  report_type TEXT CHECK (report_type IN ('monthly', 'quarterly', 'yearly', 'custom')),
  report_period DATERANGE NOT NULL,

  -- Report data
  summary_metrics JSONB NOT NULL,
  category_analysis JSONB,
  gst_summary JSONB,
  vendor_analysis JSONB,

  -- File outputs
  pdf_url TEXT,
  excel_url TEXT,

  -- Status
  generation_status TEXT DEFAULT 'pending' CHECK (
    generation_status IN ('pending', 'generating', 'completed', 'failed')
  ),
  generated_at TIMESTAMPTZ,

  -- Metadata
  generated_by TEXT DEFAULT 'mis_agent',
  generation_metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mis_reports_entity ON mis_reports(entity_id, created_at DESC);
CREATE INDEX idx_mis_reports_period ON mis_reports USING GIST (report_period);

-- Row Level Security
ALTER TABLE runway_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE burn_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_optimizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY runway_predictions_select_policy ON runway_predictions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM entity_members WHERE entity_id = runway_predictions.entity_id AND user_id = auth.uid())
  );

CREATE POLICY burn_rate_history_select_policy ON burn_rate_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM entity_members WHERE entity_id = burn_rate_history.entity_id AND user_id = auth.uid())
  );

CREATE POLICY mis_reports_select_policy ON mis_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM entity_members WHERE entity_id = mis_reports.entity_id AND user_id = auth.uid())
  );

COMMENT ON TABLE runway_predictions IS 'AI-generated runway predictions for business entities';
COMMENT ON TABLE burn_rate_history IS 'Time-series burn rate data (TimescaleDB hypertable)';
COMMENT ON TABLE cashflow_optimizations IS 'Cross-entity cashflow optimization recommendations';
COMMENT ON TABLE mis_reports IS 'Auto-generated Management Information System reports';
