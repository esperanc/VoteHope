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

// ---- Quiz files -----------------------------------------------------------------
// A file written by hand or by a script may leave out whatever has an obvious default;
// transfer.ts fills it in. The limits are the editor's.

function uniqueGivenIds(items: { id?: string | undefined }[]): boolean {
  const ids = items.flatMap((item) => (item.id === undefined ? [] : [item.id]));
  return new Set(ids).size === ids.length;
}

const ImportedOptionSchema = z.object({
  id: Id.optional(),
  body: z.string().max(LIMITS.optionLength),
  correct: z.boolean().default(false),
});

const ImportedQuestionSchema = z.object({
  id: Id.optional(),
  kind: z.enum(['quiz', 'poll']).default('quiz'),
  /** When left out, it follows from how many options are correct. */
  selection: z.enum(['single', 'multiple']).optional(),
  body: z.string().max(LIMITS.bodyLength),
  timeLimitS: TimeLimit.nullable().default(null),
  options: z.array(ImportedOptionSchema).max(LIMITS.maxOptions).refine(uniqueGivenIds, 'Option ids must be unique'),
});

/** The quiz in quiz.json — on its own, or inside an exported file's {format, version, quiz}. */
export const ImportedQuizSchema = z.object({
  title: z.string().max(LIMITS.titleLength),
  description: z.string().max(LIMITS.descriptionLength).default(''),
  defaultTimeLimitS: TimeLimit.default(LIMITS.defaultTimeLimitS),
  questions: z
    .array(ImportedQuestionSchema)
    .max(LIMITS.questions)
    .refine(uniqueGivenIds, 'Question ids must be unique'),
});

export type ImportedQuiz = z.infer<typeof ImportedQuizSchema>;
