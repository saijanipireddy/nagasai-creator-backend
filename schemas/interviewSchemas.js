import { z } from 'zod';

export const grantAccessSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  skills: z.array(z.string().min(1).max(100).trim()).min(1, 'At least one skill is required').max(20),
  maxAttempts: z.number().int().min(1).max(10).optional().default(1),
  expiresInDays: z.number().int().min(1).max(90).optional().default(7),
});

export const sendMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000),
});
