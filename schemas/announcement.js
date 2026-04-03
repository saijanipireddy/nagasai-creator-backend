import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').trim(),
  content: z.string().min(1, 'Content is required').max(5000, 'Content too long').trim(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  batchId: z.string().uuid('Invalid batch ID').nullable().optional(),
});

export const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  content: z.string().min(1).max(5000).trim().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  isActive: z.boolean().optional(),
});
