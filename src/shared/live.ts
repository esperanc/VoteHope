// Live (synchronous) sessions: the presenter moves the whole class through the
// questions; phones follow over a Socket.IO connection.
import type { StudentQuestion } from './session.ts';

/** lobby → open → closed → open (next question) … → finished */
export type LivePhase = 'lobby' | 'open' | 'closed' | 'finished';

/** Answers reaching the server this long after the deadline still count (network delay). */
export const LIVE_GRACE_MS = 1000;

export interface LiveParticipant {
  id: number;
  name: string;
  /** Answered the current question. */
  answered: boolean;
  /** Has a connection open right now. */
  online: boolean;
}

/** What the presenter's (projected) screen shows. */
export interface LivePresenterView {
  phase: LivePhase;
  questionIndex: number;
  questionCount: number;
  /** The current question, options in authored order, without correct flags. */
  question: StudentQuestion | null;
  /** Server-clock ms. */
  deadline: number | null;
  serverNow: number;
  participants: LiveParticipant[];
  answeredCount: number;
  /** Times each option was chosen, once the question is closed. */
  counts: Record<string, number> | null;
}

/** What one student's phone shows. */
export interface LiveStudentView {
  phase: LivePhase;
  title: string;
  name: string;
  questionIndex: number;
  questionCount: number;
  /** While a question is open: options in this student's order. */
  question: StudentQuestion | null;
  deadline: number | null;
  serverNow: number;
  /** Answered the current question (answers are final). */
  answered: boolean;
}

/** Reply to a socket request. */
export type LiveAck = { ok: true } | { error: string };
