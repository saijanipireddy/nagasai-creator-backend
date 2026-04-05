-- Add proctoring data column to interviews table
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS proctoring_data JSONB NOT NULL DEFAULT '{"warnings":[],"tabSwitchCount":0,"fullscreenExitCount":0,"faceNotDetectedCount":0,"copyPasteAttempts":0,"totalWarnings":0}';
