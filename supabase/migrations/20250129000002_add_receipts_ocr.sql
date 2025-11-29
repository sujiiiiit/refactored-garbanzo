-- =============================================
-- RECEIPTS (OCR-processed images)
-- =============================================

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id),

  -- File details
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,

  -- OCR results
  ocr_provider TEXT,
  ocr_raw_text TEXT,
  ocr_structured_data JSONB,
  ocr_confidence DECIMAL(3,2),

  -- Extracted fields (normalized)
  extracted_merchant TEXT,
  extracted_amount DECIMAL(12,2),
  extracted_date DATE,
  extracted_items JSONB,
  extracted_gst JSONB,

  -- Processing status
  processing_status TEXT DEFAULT 'pending' CHECK (
    processing_status IN ('pending', 'processing', 'completed', 'failed')
  ),
  processing_error TEXT,
  processed_at TIMESTAMPTZ,

  -- Embeddings for semantic search
  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipts_user ON receipts(user_id);
CREATE INDEX idx_receipts_status ON receipts(processing_status);
CREATE INDEX idx_receipts_embedding ON receipts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Add receipt_id to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES receipts(id);

-- Row Level Security
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_select_policy ON receipts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY receipts_insert_policy ON receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Transaction fields for OCR/Voice/SMS
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'voice', 'image', 'sms', 'bank_import', 'api'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_data JSONB;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2);

-- Add GST fields to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gst_applicable BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(12,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gst_percentage DECIMAL(5,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hsn_sac_code TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gl_code TEXT;

-- Add verification fields
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

COMMENT ON TABLE receipts IS 'OCR-processed receipt images with embeddings for semantic search';
