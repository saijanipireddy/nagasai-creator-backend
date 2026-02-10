-- ============================================
-- NAGA CREATOR LMS - Supabase Database Setup
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================
-- Architecture: Express backend uses service_role key (bypasses RLS)
-- Auth: Managed by Express backend with JWT + bcrypt
-- ============================================

-- 1. ADMINS TABLE (replaces MongoDB Admin model)
CREATE TABLE public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_admins_email ON public.admins (email);

-- 2. COURSES TABLE
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'FaBook',
  color TEXT NOT NULL DEFAULT '#e94560',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_courses_sort ON public.courses (sort_order);
CREATE INDEX idx_courses_published ON public.courses (is_published);

-- 3. TOPICS TABLE
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  video_url TEXT DEFAULT '',
  pdf_url TEXT DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_topics_course ON public.topics (course_id);
CREATE INDEX idx_topics_course_sort ON public.topics (course_id, sort_order);
CREATE INDEX idx_topics_published ON public.topics (is_published);

-- 4. PRACTICE QUESTIONS TABLE
CREATE TABLE public.practice_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  question TEXT NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_practice_topic ON public.practice_questions (topic_id);
CREATE INDEX idx_practice_topic_sort ON public.practice_questions (topic_id, sort_order);

-- 5. CODING PRACTICES TABLE (one per topic)
CREATE TABLE public.coding_practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL UNIQUE REFERENCES public.topics(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'javascript',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  reference_image TEXT DEFAULT '',
  image_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  starter_code TEXT NOT NULL DEFAULT '',
  expected_output TEXT NOT NULL DEFAULT '',
  hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coding_topic ON public.coding_practices (topic_id);

-- 6. VIEW: courses with topic count
CREATE OR REPLACE VIEW public.courses_with_topic_count AS
SELECT
  c.*,
  COALESCE(t.topic_count, 0) AS total_topics
FROM public.courses c
LEFT JOIN (
  SELECT course_id, COUNT(*) AS topic_count
  FROM public.topics
  GROUP BY course_id
) t ON t.course_id = c.id
ORDER BY c.sort_order;

-- ============================================
-- TRIGGERS: auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_admins_updated_at
  BEFORE UPDATE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_coding_practices_updated_at
  BEFORE UPDATE ON public.coding_practices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- RLS: Disabled for these tables
-- The Express backend uses the service_role key which bypasses RLS.
-- This is secure because only the backend can access the DB directly.
-- ============================================

-- ============================================
-- DONE! Verify by checking:
-- 1. Tables: admins, courses, topics, practice_questions, coding_practices
-- 2. View: courses_with_topic_count
-- 3. Function: update_updated_at
-- ============================================
