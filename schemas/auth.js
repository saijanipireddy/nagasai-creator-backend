import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
  email: z.string().email('Invalid email address').max(255).trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255).trim().toLowerCase(),
  password: z.string().min(1, 'Password is required').max(128),
});
