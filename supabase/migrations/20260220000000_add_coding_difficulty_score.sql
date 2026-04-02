-- Add difficulty level and max score to coding practices
ALTER TABLE public.coding_practices
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'easy',
  ADD COLUMN IF NOT EXISTS max_score INTEGER NOT NULL DEFAULT 100;
