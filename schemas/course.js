import { z } from 'zod';

export const createCourseSchema = z.object({
  name: z.string().min(1, 'Course name is required').max(200, 'Name too long').trim(),
  description: z.string().max(5000).optional().default(''),
  icon: z.string().max(100).optional().default('FaBook'),
  color: z.string().max(20).optional().default('#e94560'),
  order: z.number().int().min(0).optional().default(0),
  isPublished: z.boolean().optional().default(false),
});

export const updateCourseSchema = createCourseSchema.partial();

export const reorderCoursesSchema = z.object({
  courses: z.array(
    z.object({
      id: z.string().uuid('Invalid course ID'),
      order: z.number().int().min(0),
    })
  ).min(1, 'At least one course required'),
});
