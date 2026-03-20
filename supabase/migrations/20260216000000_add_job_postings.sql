-- Job Postings table for Jobs Board feature
CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  designation TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  company_logo TEXT DEFAULT '',
  company_linkedin TEXT DEFAULT '',
  apply_link TEXT NOT NULL,
  job_type TEXT DEFAULT 'full-time',
  location TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  posted_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active jobs listing
CREATE INDEX idx_job_postings_active ON job_postings (is_active, created_at DESC);
