// Sessions (runs of a quiz), shared by the server and the client.
import type { LivePhase } from './live.ts';
import type { Question, QuestionKind, SelectionMode } from './quiz.ts';

export type SessionMode = 'sync' | 'async';
export type TimerMode = 'none' | 'total' | 'perQuestion';
export type EmailMode = 'hidden' | 'optional' | 'required';

/** Settings of a self-paced (asynchronous) session. */
export interface AsyncSettings {
  timerMode: TimerMode;
  /** Minutes for the whole quiz; set when timerMode is 'total'. */
  totalMinutes: number | null;
  shuffleQuestions: boolean;
  /** ISO timestamps; null means no restriction. */
  opensAt: string | null;
  closesAt: string | null;
  /** Show students their score once they submit. */
  showScore: boolean;
  email: EmailMode;
}

export const DEFAULT_ASYNC_SETTINGS: AsyncSettings = {
  timerMode: 'none',
  totalMinutes: null,
  shuffleQuestions: true,
  opensAt: null,
  closesAt: null,
  showScore: true,
  email: 'optional',
};

export const SESSION_LIMITS = {
  nameLength: 40,
  emailLength: 254,
  maxTotalMinutes: 600,
} as const;

/** Answers reaching the server this long after a deadline still count (network delay). */
export const GRACE_MS = 2000;

/** Whether students can answer: not yet, now, or no longer (closed by hand or by its closing time). */
export type SessionState = 'scheduled' | 'open' | 'closed';

export interface SessionSummary {
  id: number;
  code: string;
  mode: SessionMode;
  /** Null when the quiz has since been deleted (the session keeps its own copy). */
  quizId: number | null;
  title: string;
  state: SessionState;
  createdAt: string;
  participantCount: number;
  submittedCount: number;
}

export interface SessionDetail extends SessionSummary {
  settings: AsyncSettings;
  joinUrl: string;
  questionCount: number;
  /** Closed by the presenter, as opposed to by its closing time. */
  closedManually: boolean;
  /** Live sessions only. */
  livePhase: LivePhase | null;
}

/** What a student sees before joining. */
export interface JoinInfo {
  code: string;
  mode: SessionMode;
  title: string;
  description: string;
  state: SessionState;
  opensAt: string | null;
  closesAt: string | null;
  questionCount: number;
  timerMode: TimerMode;
  totalMinutes: number | null;
  email: EmailMode;
}

/** A question as sent to students: options in this student's order, and never which is correct. */
export interface StudentQuestion {
  id: string;
  kind: QuestionKind;
  selection: SelectionMode;
  body: string;
  options: { id: string; body: string }[];
}

export type AttemptStatus = 'ready' | 'in_progress' | 'finished';
export type EndReason = 'submitted' | 'time' | 'closed';

export interface PlayState {
  info: JoinInfo;
  name: string;
  status: AttemptStatus;
  /** Server clock (ms) when this state was produced; deadlines are on the server clock. */
  serverNow: number;
  deadline: number | null;
  /** While in progress: every question in this student's order, or only the current one (timer per question). */
  questions: StudentQuestion[];
  questionCount: number;
  /** Position of the current question (timer per question). */
  index: number;
  answers: Record<string, string[]>;
  endReason: EndReason | null;
  /** Only when finished and the session shows scores. `total` counts quiz questions (polls are not scored). */
  score: { correct: number; total: number } | null;
}

export interface AnswerResult {
  optionIds: string[];
  /** Null for polls. */
  correct: boolean | null;
}

export interface ParticipantResult {
  id: number;
  name: string;
  email: string | null;
  status: AttemptStatus;
  endReason: EndReason | null;
  joinedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  correct: number;
  answered: number;
  answers: Record<string, AnswerResult>;
}

export interface SessionResults {
  session: SessionDetail;
  /** The session's copy of the questions, in authored order, including correct options. */
  questions: Question[];
  participants: ParticipantResult[];
}

/** Trims a participant's name and collapses runs of whitespace. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Names differing only in case or accents count as the same name. */
export function nameKey(name: string): string {
  return cleanName(name).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
