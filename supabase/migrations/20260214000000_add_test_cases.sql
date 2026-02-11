-- Add test_script (JS assertions for web challenges) and test_cases (input/output pairs for non-web)
ALTER TABLE public.coding_practices
  ADD COLUMN IF NOT EXISTS test_script TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS test_cases JSONB NOT NULL DEFAULT '[]'::jsonb;
