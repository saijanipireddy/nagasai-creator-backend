import { z } from 'zod';

const practiceQuestionSchema = z.object({
  question: z.string().min(1, 'Question text is required').max(2000),
  options: z.array(z.string().max(1000)).min(2, 'At least 2 options').max(10),
  answer: z.number().int().min(0),
});

const codingPracticeSchema = z.object({
  language: z.string().max(30).optional().default('javascript'),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().default(''),
  referenceImage: z.string().max(2000).optional().default(''),
  imageLinks: z.array(z.string().max(2000)).max(20).optional().default([]),
  starterCode: z.string().max(50000).optional().default(''),
  expectedOutput: z.string().max(50000).optional().default(''),
  hints: z.array(z.string().max(1000)).max(20).optional().default([]),
  testScript: z.string().max(50000).optional().nullable(),
  testCases: z.array(z.object({
    input: z.string().max(10000).optional(),
    output: z.string().max(10000).optional(),
  })).max(50).optional().nullable(),
});

export const createTopicSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  title: z.string().min(1, 'Topic title is required').max(200, 'Title too long').trim(),
  order: z.number().int().min(0).optional().default(0),
  videoUrl: z.string().max(2000).optional().default(''),
  pdfUrl: z.string().max(2000).optional().default(''),
  isPublished: z.boolean().optional().default(false),
  practice: z.array(practiceQuestionSchema).max(200).optional().default([]),
  codingPractice: codingPracticeSchema.optional().nullable(),
});

export const updateTopicSchema = createTopicSchema.partial();

export const reorderTopicsSchema = z.object({
  topics: z.array(
    z.object({
      id: z.string().uuid('Invalid topic ID'),
      order: z.number().int().min(0),
    })
  ).min(1, 'At least one topic required'),
});
