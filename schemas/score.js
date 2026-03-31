import { z } from 'zod';

export const codingScoreSchema = z.object({
  topicId: z.string().uuid('Invalid topic ID'),
  passed: z.boolean(),
  code: z.string().max(50_000).optional().default(''),
  output: z.string().max(50_000).optional().default(''),
  language: z.string().max(30).optional().default('javascript'),
});

export const codingSubmitSchema = z.object({
  topicId: z.string().uuid('Invalid topic ID'),
  code: z.string().min(1, 'Code is required').max(50_000, 'Code too large'),
  language: z.string().max(30).optional(),
  testResults: z.array(z.string()).max(50).optional(),
});

export const practiceAttemptSchema = z.object({
  topicId: z.string().uuid('Invalid topic ID'),
  answers: z.array(
    z.object({
      questionIndex: z.number().int().min(0),
      selectedOption: z.number().int().min(0),
      correctOption: z.number().int().min(0),
      question: z.string().optional(),
      options: z.array(z.string()).optional(),
    })
  ).min(1, 'At least one answer required').max(200),
  timeTakenSeconds: z.number().int().min(0).max(86400).optional(),
});
