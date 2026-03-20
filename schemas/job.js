import { z } from 'zod';

export const createJobSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200).trim(),
  designation: z.string().min(1, 'Designation is required').max(200).trim(),
  description: z.string().max(5000).optional().default(''),
  companyLogo: z.string().max(2000).optional().default(''),
  companyLinkedin: z.string().max(2000).optional().default(''),
  applyLink: z.string().url('Apply link must be a valid URL').max(2000),
  jobType: z.enum(['full-time', 'part-time', 'internship', 'contract', 'remote']).optional().default('full-time'),
  location: z.string().max(200).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

export const updateJobSchema = createJobSchema.partial();
