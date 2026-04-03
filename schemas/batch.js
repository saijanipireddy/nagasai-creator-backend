import { z } from 'zod';

export const createBatchSchema = z.object({
  name: z.string().min(1, 'Batch name is required').max(200, 'Name too long').trim(),
  description: z.string().max(2000).optional().default(''),
});

export const updateBatchSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const assignCoursesSchema = z.object({
  courseIds: z.array(z.string().uuid('Invalid course ID')).min(1, 'At least one course required').max(50),
});

export const enrollStudentsSchema = z.object({
  studentIds: z.array(z.string().uuid('Invalid student ID')).min(1, 'At least one student required').max(200),
  paymentStatus: z.enum(['pending', 'paid', 'free']).optional().default('paid'),
});

export const updateEnrollmentSchema = z.object({
  isActive: z.boolean().optional(),
  paymentStatus: z.enum(['pending', 'paid', 'free']).optional(),
});

export const onboardStudentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
  email: z.string().email('Invalid email address').max(255).trim().toLowerCase(),
  phone: z.string().max(20).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
});

export const practiceScoreSchema = z.object({
  topicId: z.string().uuid('Invalid topic ID'),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
});

export const markCompleteSchema = z.object({
  topicId: z.string().uuid('Invalid topic ID'),
  itemType: z.enum(['video', 'ppt', 'practice', 'codingPractice']),
});

/* ---- Topic Schedule Schemas ---- */

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((val) => !isNaN(Date.parse(val)), 'Invalid date');

export const autoScheduleSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  startDate: dateString,
  topicsPerDay: z.number().int().min(1).max(10).optional().default(1),
});

export const manualUnlockSchema = z.object({
  topicId: z.string().uuid('Invalid topic ID'),
  unlock: z.boolean(),
});

export const bulkScheduleSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  schedule: z.array(z.object({
    topicId: z.string().uuid('Invalid topic ID'),
    unlockDate: dateString,
  })).min(1, 'At least one topic required').max(200),
});
