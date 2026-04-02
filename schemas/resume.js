import { z } from 'zod';

const workExperienceSchema = z.object({
  company: z.string().min(1).max(200).trim(),
  role: z.string().min(1).max(200).trim(),
  duration: z.string().min(1).max(100).trim(),
  description: z.string().max(2000).trim().optional().default(''),
});

const educationSchema = z.object({
  institution: z.string().min(1).max(200).trim(),
  degree: z.string().min(1).max(200).trim(),
  year: z.string().min(1).max(50).trim(),
  gpa: z.string().max(20).trim().optional().default(''),
});

const projectSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(2000).trim(),
  techStack: z.string().min(1).max(500).trim(),
  link: z.string().max(2000).trim().optional().default(''),
});

export const generateResumeSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200).trim(),
  email: z.string().email('Valid email required').max(200).trim(),
  phone: z.string().min(1, 'Phone is required').max(30).trim(),
  linkedinUrl: z.string().max(2000).trim().optional().default(''),
  githubUrl: z.string().max(2000).trim().optional().default(''),
  summary: z.string().min(10, 'Summary must be at least 10 characters').max(3000).trim(),
  skills: z.array(z.string().min(1).trim()).min(1, 'At least one skill required').max(50),
  experience: z.array(workExperienceSchema).max(10).optional().default([]),
  education: z.array(educationSchema).min(1, 'At least one education entry required').max(10),
  projects: z.array(projectSchema).max(10).optional().default([]),
  certifications: z.array(z.string().min(1).max(300).trim()).max(20).optional().default([]),
  targetRole: z.string().min(1, 'Target role is required').max(200).trim(),
});
