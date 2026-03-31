-- ============================================
-- Batches & Enrollment System
-- ============================================

-- 1. Batches table
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batches_active ON public.batches (is_active);

-- 2. Batch-Course mapping (which courses belong to a batch)
CREATE TABLE public.batch_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, course_id)
);

CREATE INDEX idx_batch_courses_batch ON public.batch_courses (batch_id);
CREATE INDEX idx_batch_courses_course ON public.batch_courses (course_id);

-- 3. Student-Batch enrollment (which students belong to a batch)
CREATE TABLE public.student_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'free')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, batch_id)
);

CREATE INDEX idx_student_batches_student ON public.student_batches (student_id);
CREATE INDEX idx_student_batches_batch ON public.student_batches (batch_id);
CREATE INDEX idx_student_batches_active ON public.student_batches (is_active, payment_status);

-- Auto-update triggers
CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_student_batches_updated_at
  BEFORE UPDATE ON public.student_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
