// Quiz documents, shared by the server (storage, validation) and the client (editor, rendering).
// Question and option text is Markdown with $…$ / $$…$$ formulas.

export type QuestionKind = 'quiz' | 'poll';
export type SelectionMode = 'single' | 'multiple';

export interface QuizOption {
  id: string;
  body: string;
  /** Always false for polls. */
  correct: boolean;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  selection: SelectionMode;
  body: string;
  /** Overrides the quiz's default time limit when set. */
  timeLimitS: number | null;
  options: QuizOption[];
}

export interface QuizContent {
  title: string;
  description: string;
  defaultTimeLimitS: number;
  questions: Question[];
}

export interface Quiz extends QuizContent {
  id: number;
  /** Incremented on every save; used to detect edits from another window. */
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizSummary {
  id: number;
  title: string;
  questionCount: number;
  /** Questions that have at least one issue (see findIssues). */
  incompleteCount: number;
  updatedAt: string;
}

export const LIMITS = {
  titleLength: 200,
  descriptionLength: 2000,
  bodyLength: 10_000,
  optionLength: 2000,
  questions: 200,
  minOptions: 2,
  maxOptions: 10,
  minTimeLimitS: 5,
  maxTimeLimitS: 600,
  defaultTimeLimitS: 30,
} as const;

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Short random id for questions and options (unique within a quiz). */
export function makeId(): string {
  // getRandomValues, unlike randomUUID, also works on plain-HTTP pages (e.g. a LAN address).
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte & 63]).join('');
}

export function newOption(): QuizOption {
  return { id: makeId(), body: '', correct: false };
}

export function newQuestion(): Question {
  return {
    id: makeId(),
    kind: 'quiz',
    selection: 'single',
    body: '',
    timeLimitS: null,
    options: [newOption(), newOption(), newOption(), newOption()],
  };
}

export function duplicateQuestion(question: Question): Question {
  return { ...question, id: makeId(), options: question.options.map((option) => ({ ...option, id: makeId() })) };
}

export function contentOf(quiz: QuizContent): QuizContent {
  const { title, description, defaultTimeLimitS, questions } = quiz;
  return { title, description, defaultTimeLimitS, questions };
}

// ---- Completeness ------------------------------------------------------------
// Drafts may be incomplete (they are auto-saved while being typed), so these are
// reported as issues rather than rejected. A quiz with issues cannot be run.

export type IssueCode =
  | 'noQuestions'
  | 'emptyBody'
  | 'tooFewOptions'
  | 'emptyOption'
  | 'duplicateOption'
  | 'noCorrect'
  | 'singleNeedsOneCorrect'
  | 'pollHasCorrect';

export interface Issue {
  code: IssueCode;
  questionId?: string;
  optionId?: string;
}

export function findIssues(quiz: Pick<QuizContent, 'questions'>): Issue[] {
  const issues: Issue[] = [];
  if (quiz.questions.length === 0) issues.push({ code: 'noQuestions' });

  for (const question of quiz.questions) {
    const questionId = question.id;
    if (!question.body.trim()) issues.push({ code: 'emptyBody', questionId });
    if (question.options.length < LIMITS.minOptions) issues.push({ code: 'tooFewOptions', questionId });

    const seen = new Set<string>();
    for (const option of question.options) {
      const text = option.body.trim();
      if (!text) issues.push({ code: 'emptyOption', questionId, optionId: option.id });
      else if (seen.has(text)) issues.push({ code: 'duplicateOption', questionId, optionId: option.id });
      seen.add(text);
    }

    const correct = question.options.filter((option) => option.correct).length;
    if (question.kind === 'poll') {
      if (correct > 0) issues.push({ code: 'pollHasCorrect', questionId });
    } else if (correct === 0) {
      issues.push({ code: 'noCorrect', questionId });
    } else if (question.selection === 'single' && correct > 1) {
      issues.push({ code: 'singleNeedsOneCorrect', questionId });
    }
  }
  return issues;
}

export function countIncompleteQuestions(quiz: Pick<QuizContent, 'questions'>): number {
  return new Set(findIssues(quiz).flatMap((issue) => (issue.questionId ? [issue.questionId] : []))).size;
}
