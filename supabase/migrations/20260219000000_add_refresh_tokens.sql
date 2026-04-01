-- ============================================
-- Refresh Tokens for JWT token rotation & revocation
-- ============================================

CREATE TABLE public.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('admin', 'student')),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_hash ON public.refresh_tokens (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens (user_id, user_type);
CREATE INDEX idx_refresh_tokens_expires ON public.refresh_tokens (expires_at);

-- Clean up expired/revoked tokens periodically (optional cron via pg_cron or app-level)
-- DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked_at IS NOT NULL;
