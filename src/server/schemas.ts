import { z } from 'zod';
import { LIMITS, type QuizContent } from '../shared/quiz.ts';

// Structural validation only: drafts may be incomplete (see findIssues in shared/quiz.ts).

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
const TimeLimit = z.number().int().min(LIMITS.minTimeLimitS).max(LIMITS.maxTimeLimitS);

function uniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

const OptionSchema = z.object({
  id: Id,
  body: z.string().max(LIMITS.optionLength),
  correct: z.boolean(),
});

const QuestionSchema = z.object({
  id: Id,
  kind: z.enum(['quiz', 'poll']),
  selection: z.enum(['single', 'multiple']),
  body: z.string().max(LIMITS.bodyLength),
  timeLimitS: TimeLimit.nullable(),
  options: z.array(OptionSchema).max(LIMITS.maxOptions).refine(uniqueIds, 'Option ids must be unique'),
});

export const QuizContentSchema: z.ZodType<QuizContent> = z.object({
  title: z.string().max(LIMITS.titleLength),
  description: z.string().max(LIMITS.descriptionLength),
  defaultTimeLimitS: TimeLimit,
  questions: z.array(QuestionSchema).max(LIMITS.questions).refine(uniqueIds, 'Question ids must be unique'),
});

export const SaveQuizBody = z.object({
  revision: z.number().int().positive(),
  content: QuizContentSchema,
});

export const DuplicateQuizBody = z.object({
  title: z.string().max(LIMITS.titleLength),
});

/** Contents of quiz.json in an exported quiz file. */
export const QuizFileSchema = z.object({
  format: z.literal('votehope-quiz'),
  version: z.literal(1),
  quiz: QuizContentSchema,
});
