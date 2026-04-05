-- ============================================
-- AI INTERVIEW SYSTEM
-- ============================================

-- Interview access granted by admin to students
CREATE TABLE public.interview_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  skills TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed')),
  granted_by UUID NOT NULL REFERENCES public.admins(id),
  max_attempts INTEGER NOT NULL DEFAULT 1,
  attempts_used INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ia_student ON public.interview_access (student_id);
CREATE INDEX idx_ia_status ON public.interview_access (status);
CREATE INDEX idx_ia_student_status ON public.interview_access (student_id, status);

-- Interview sessions
CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id UUID NOT NULL REFERENCES public.interview_access(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  skills TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned')),
  conversation_history JSONB NOT NULL DEFAULT '[]',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  max_questions INTEGER NOT NULL DEFAULT 15,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interviews_student ON public.interviews (student_id);
CREATE INDEX idx_interviews_access ON public.interviews (access_id);
CREATE INDEX idx_interviews_status ON public.interviews (status);

-- Per-question responses
CREATE TABLE public.interview_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 10),
  feedback TEXT,
  skill_tested TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ir_interview ON public.interview_responses (interview_id);

-- Final interview reports
CREATE TABLE public.interview_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  overall_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  skill_scores JSONB NOT NULL DEFAULT '{}',
  strengths TEXT[] NOT NULL DEFAULT '{}',
  weaknesses TEXT[] NOT NULL DEFAULT '{}',
  recommendation TEXT NOT NULL DEFAULT 'PENDING' CHECK (recommendation IN ('STRONG_HIRE', 'HIRE', 'MAYBE', 'NO_HIRE', 'STRONG_NO_HIRE', 'PENDING')),
  detailed_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (interview_id)
);

CREATE INDEX idx_irep_student ON public.interview_reports (student_id);
CREATE INDEX idx_irep_interview ON public.interview_reports (interview_id);

-- Auto-update timestamps
CREATE TRIGGER update_interview_access_updated_at
  BEFORE UPDATE ON public.interview_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
