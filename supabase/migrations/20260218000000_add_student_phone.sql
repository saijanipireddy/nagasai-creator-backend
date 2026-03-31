-- Add phone column to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone TEXT;
