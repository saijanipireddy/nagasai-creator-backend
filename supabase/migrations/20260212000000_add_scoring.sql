-- ============================================
-- SCORING SYSTEM: practice_scores, coding_submissions, leaderboard view
-- ============================================

-- 1. PRACTICE SCORES TABLE (MCQ scores per student per topic)
CREATE TABLE public.practice_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, topic_id)
);

CREATE INDEX idx_practice_scores_student ON public.practice_scores (student_id);
CREATE INDEX idx_practice_scores_topic ON public.practice_scores (topic_id);

CREATE TRIGGER update_practice_scores_updated_at
  BEFORE UPDATE ON public.practice_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. CODING SUBMISSIONS TABLE (coding results per student per topic)
CREATE TABLE public.coding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL DEFAULT false,
  code TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'javascript',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, topic_id)
);

CREATE INDEX idx_coding_submissions_student ON public.coding_submissions (student_id);
CREATE INDEX idx_coding_submissions_topic ON public.coding_submissions (topic_id);

CREATE TRIGGER update_coding_submissions_updated_at
  BEFORE UPDATE ON public.coding_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. LEADERBOARD VIEW
-- practice points = sum of percentages across topics
-- coding points = 100 per passed challenge
-- total = practice + coding
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  s.id AS student_id,
  s.name AS student_name,
  COALESCE(p.practice_points, 0) AS practice_points,
  COALESCE(c.coding_points, 0) AS coding_points,
  COALESCE(p.practice_points, 0) + COALESCE(c.coding_points, 0) AS total_points
FROM public.students s
LEFT JOIN (
  SELECT student_id, ROUND(SUM(percentage))::INTEGER AS practice_points
  FROM public.practice_scores
  GROUP BY student_id
) p ON p.student_id = s.id
LEFT JOIN (
  SELECT student_id, COUNT(*) FILTER (WHERE passed = true) * 100 AS coding_points
  FROM public.coding_submissions
  GROUP BY student_id
) c ON c.student_id = s.id
WHERE COALESCE(p.practice_points, 0) + COALESCE(c.coding_points, 0) > 0
ORDER BY total_points DESC;
