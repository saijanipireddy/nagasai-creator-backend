-- ============================================
-- PRACTICE ATTEMPTS: track every MCQ practice attempt with full answer data
-- ============================================

CREATE TABLE public.practice_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  time_taken_seconds INTEGER NOT NULL DEFAULT 0,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, topic_id, attempt_number)
);

CREATE INDEX idx_practice_attempts_student ON public.practice_attempts (student_id);
CREATE INDEX idx_practice_attempts_topic ON public.practice_attempts (topic_id);
CREATE INDEX idx_practice_attempts_student_topic ON public.practice_attempts (student_id, topic_id);
