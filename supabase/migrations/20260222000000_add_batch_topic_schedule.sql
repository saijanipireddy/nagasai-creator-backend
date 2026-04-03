-- ============================================
-- BATCH TOPIC SCHEDULE
-- Controls per-batch topic unlock dates.
-- Once a topic is unlocked (date reached OR manual override), student can access it forever.
-- ============================================

CREATE TABLE public.batch_topic_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  unlock_date DATE NOT NULL,
  is_unlocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each topic can only have one schedule entry per batch
  UNIQUE (batch_id, topic_id)
);

-- Fast lookups: "which topics are scheduled for this batch?"
CREATE INDEX idx_bts_batch ON public.batch_topic_schedule (batch_id);

-- Fast lookups: "is this topic unlocked for this batch?"
CREATE INDEX idx_bts_batch_topic ON public.batch_topic_schedule (batch_id, topic_id);

-- Fast lookups: "which topics unlock today?"
CREATE INDEX idx_bts_unlock_date ON public.batch_topic_schedule (unlock_date);

-- Auto-update updated_at
CREATE TRIGGER update_batch_topic_schedule_updated_at
  BEFORE UPDATE ON public.batch_topic_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
