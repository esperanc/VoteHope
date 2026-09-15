import type { Question } from '../../shared/quiz.ts';
import type { ParticipantResult, SessionResults } from '../../shared/session.ts';
import { toCsv } from './csv.ts';
import { spreadsheetTime } from './format.ts';
import type { MessageKey } from './i18n.svelte.ts';

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Option letters follow the order in the editor (students saw them shuffled). */
export const LETTERS = 'ABCDEFGHIJ';

export function lettersOf(question: Question, optionIds: string[], joiner = ', '): string {
  return question.options
    .flatMap((option, i) => (optionIds.includes(option.id) ? [LETTERS[i] ?? '?'] : []))
    .join(joiner);
}

/** Number of scored (non-poll) questions. */
export function scoredTotal(questions: Question[]): number {
  return questions.filter((question) => question.kind === 'quiz').length;
}

export interface QuestionStats {
  responses: number;
  correct: number;
  /** Times each option was chosen. */
  counts: Map<string, number>;
}

export function questionStats(question: Question, participants: ParticipantResult[]): QuestionStats {
  const stats: QuestionStats = { responses: 0, correct: 0, counts: new Map() };
  for (const participant of participants) {
    const answer = participant.answers[question.id];
    if (!answer) continue;
    stats.responses++;
    if (answer.correct) stats.correct++;
    for (const id of answer.optionIds) stats.counts.set(id, (stats.counts.get(id) ?? 0) + 1);
  }
  return stats;
}

export function attemptLabel(participant: ParticipantResult): MessageKey {
  if (participant.status === 'ready') return 'results.status.ready';
  if (participant.status === 'in_progress') return 'results.status.in_progress';
  if (participant.endReason === 'time') return 'results.status.time';
  if (participant.endReason === 'closed') return 'results.status.closed';
  return 'results.status.submitted';
}

export function sortedByName(participants: ParticipantResult[], locale: string): ParticipantResult[] {
  return [...participants].sort((a, b) => a.name.localeCompare(b.name, locale));
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** One row per participant: identity, status, score, then the letters chosen for each question. */
export function resultsCsv(
  results: SessionResults,
  { separator, t, locale }: { separator: ',' | ';'; t: Translate; locale: string },
): string {
  const total = scoredTotal(results.questions);
  const header = [
    t('results.name'),
    t('results.email'),
    t('results.status'),
    t('results.started'),
    t('results.finished'),
    t('results.score'),
    t('results.total'),
    ...results.questions.map((_, i) => t('results.question', { n: i + 1 })),
  ];
  const rows = sortedByName(results.participants, locale).map((p) => [
    p.name,
    p.email ?? '',
    t(attemptLabel(p)),
    spreadsheetTime(p.startedAt),
    spreadsheetTime(p.submittedAt),
    String(p.correct),
    String(total),
    ...results.questions.map((question) => {
      const answer = p.answers[question.id];
      return answer ? lettersOf(question, answer.optionIds, '+') : '';
    }),
  ]);
  return toCsv([header, ...rows], separator);
}
