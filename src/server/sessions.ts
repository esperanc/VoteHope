import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { LivePhase } from '../shared/live.ts';
import { contentOf, type Question, type Quiz, type QuizContent } from '../shared/quiz.ts';
import { seededRandom, shuffled } from '../shared/random.ts';
import {
  cleanName,
  EMAIL_PATTERN,
  GRACE_MS,
  nameKey,
  SESSION_LIMITS,
  type AnswerResult,
  type AsyncSettings,
  type AttemptStatus,
  type EndReason,
  type JoinInfo,
  type ParticipantResult,
  type PlayState,
  type SessionDetail,
  type SessionMode,
  type SessionResults,
  type SessionState,
  type SessionSummary,
  type StudentQuestion,
} from '../shared/session.ts';

/** An error reported to the client as { error: code }. */
export class PlayError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Where a live session is; null phase for self-paced sessions. */
export interface LiveState {
  phase: LivePhase | null;
  questionIndex: number;
  /** Server-clock ms when the current question's time runs out. */
  deadline: number | null;
}

export interface Session {
  id: number;
  quizId: number | null;
  code: string;
  mode: SessionMode;
  closedManually: boolean;
  settings: AsyncSettings;
  /** The session's own copy of the quiz, taken when it was created. */
  quiz: QuizContent;
  createdAt: string;
  live: LiveState;
}

export interface Participant {
  id: number;
  name: string;
  email: string | null;
  joinedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  currentIndex: number;
  /** Server-clock ms: end of the attempt (total timer / closing time) or of the current question. */
  deadline: number | null;
  endReason: EndReason | null;
}

interface SessionRow {
  id: number;
  quiz_id: number | null;
  code: string;
  mode: SessionMode;
  status: string;
  settings_json: string;
  quiz_snapshot_json: string;
  created_at: string;
  phase: LivePhase | null;
  question_index: number | null;
  deadline_ms: number | null;
}

interface ParticipantRow {
  id: number;
  name: string;
  email: string | null;
  joined_at: string;
  started_at: string | null;
  submitted_at: string | null;
  current_index: number;
  deadline_ms: number | null;
  end_reason: EndReason | null;
}

interface AnswerRow {
  participant_id: number;
  question_id: string;
  option_ids_json: string;
  is_correct: number | null;
}

interface Counts {
  participants: number;
  submitted: number;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    quizId: row.quiz_id,
    code: row.code,
    mode: row.mode,
    closedManually: row.status === 'closed',
    settings: JSON.parse(row.settings_json) as AsyncSettings,
    quiz: JSON.parse(row.quiz_snapshot_json) as QuizContent,
    createdAt: row.created_at,
    live: { phase: row.phase, questionIndex: row.question_index ?? 0, deadline: row.deadline_ms },
  };
}

function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    joinedAt: row.joined_at,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    currentIndex: row.current_index,
    deadline: row.deadline_ms,
    endReason: row.end_reason,
  };
}

const toMs = (iso: string | null) => (iso === null ? null : Date.parse(iso));
const isoTime = (ms: number) => new Date(ms).toISOString();
const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export function sessionState(session: Session, now: number): SessionState {
  if (session.closedManually) return 'closed';
  const opensAt = toMs(session.settings.opensAt);
  const closesAt = toMs(session.settings.closesAt);
  if (opensAt !== null && now < opensAt) return 'scheduled';
  if (closesAt !== null && now >= closesAt) return 'closed';
  return 'open';
}

export function timeLimitMs(quiz: QuizContent, question: Question): number {
  return (question.timeLimitS ?? quiz.defaultTimeLimitS) * 1000;
}

/** All-or-nothing: right only if exactly the correct options were chosen. Null for polls. */
export function isCorrect(question: Question, optionIds: string[]): boolean | null {
  if (question.kind === 'poll') return null;
  const correct = question.options.filter((option) => option.correct).map((option) => option.id);
  return correct.length === optionIds.length && correct.every((id) => optionIds.includes(id));
}

/** The chosen option ids, deduplicated, if they fit the question. */
function validOptionIds(question: Question, optionIds: string[]): string[] {
  const ids = [...new Set(optionIds)];
  const known = ids.every((id) => question.options.some((option) => option.id === id));
  if (!known || (question.selection === 'single' && ids.length > 1)) throw new PlayError(400, 'invalid_answer');
  return ids;
}

function statusOf(participant: Participant): AttemptStatus {
  if (!participant.startedAt) return 'ready';
  return participant.submittedAt ? 'finished' : 'in_progress';
}

export function createSessionStore(db: DatabaseSync) {
  const summaryColumns = `
    SELECT s.*, COUNT(p.id) AS participants, COUNT(p.submitted_at) AS submitted
    FROM sessions s LEFT JOIN participants p ON p.session_id = s.id AND p.removed = 0`;
  const sql = {
    insertSession: db.prepare(`
      INSERT INTO sessions (quiz_id, code, mode, status, settings_json, quiz_snapshot_json, phase, question_index)
      VALUES (?, ?, ?, 'open', ?, ?, ?, 0)`),
    codeTaken: db.prepare('SELECT 1 FROM sessions WHERE code = ?'),
    sessionById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
    sessionByCode: db.prepare('SELECT * FROM sessions WHERE code = ?'),
    summaries: db.prepare(`${summaryColumns} GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC`),
    summariesForQuiz: db.prepare(`${summaryColumns} WHERE s.quiz_id = ? GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC`),
    counts: db.prepare(
      'SELECT COUNT(*) AS participants, COUNT(submitted_at) AS submitted FROM participants WHERE session_id = ? AND removed = 0',
    ),
    updateSettings: db.prepare('UPDATE sessions SET settings_json = ? WHERE id = ?'),
    setStatus: db.prepare('UPDATE sessions SET status = ? WHERE id = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
    setLive: db.prepare(
      'UPDATE sessions SET phase = ?, question_index = ?, deadline_ms = ?, started_at = COALESCE(started_at, ?) WHERE id = ?',
    ),
    endLive: db.prepare(
      `UPDATE sessions SET status = 'closed', phase = 'finished', deadline_ms = NULL, ended_at = ? WHERE id = ?`,
    ),
    openLive: db.prepare(`SELECT * FROM sessions WHERE mode = 'sync' AND phase = 'open'`),

    insertParticipant: db.prepare(
      'INSERT INTO participants (session_id, name, name_key, email, token_hash) VALUES (?, ?, ?, ?, ?)',
    ),
    participantByToken: db.prepare('SELECT * FROM participants WHERE session_id = ? AND token_hash = ? AND removed = 0'),
    participantById: db.prepare('SELECT * FROM participants WHERE id = ? AND session_id = ? AND removed = 0'),
    participants: db.prepare('SELECT * FROM participants WHERE session_id = ? AND removed = 0 ORDER BY joined_at, id'),
    unsettled: db.prepare(
      'SELECT * FROM participants WHERE session_id = ? AND started_at IS NOT NULL AND submitted_at IS NULL',
    ),
    sessionsWithUnsettled: db.prepare(
      'SELECT DISTINCT session_id FROM participants WHERE started_at IS NOT NULL AND submitted_at IS NULL',
    ),
    start: db.prepare(
      'UPDATE participants SET started_at = ?, current_index = 0, deadline_ms = ? WHERE id = ? AND started_at IS NULL',
    ),
    move: db.prepare('UPDATE participants SET current_index = ?, deadline_ms = ? WHERE id = ?'),
    finish: db.prepare('UPDATE participants SET submitted_at = ?, end_reason = ? WHERE id = ? AND submitted_at IS NULL'),
    finishAll: db.prepare(
      `UPDATE participants SET submitted_at = ?, end_reason = 'submitted' WHERE session_id = ? AND submitted_at IS NULL`,
    ),
    deleteParticipant: db.prepare('DELETE FROM participants WHERE id = ? AND session_id = ?'),

    answersOf: db.prepare('SELECT * FROM answers WHERE participant_id = ?'),
    answersOfSession: db.prepare('SELECT * FROM answers WHERE session_id = ?'),
    answersForQuestion: db.prepare(`
      SELECT a.* FROM answers a JOIN participants p ON p.id = a.participant_id
      WHERE a.session_id = ? AND a.question_id = ? AND p.removed = 0`),
    answerOf: db.prepare('SELECT * FROM answers WHERE participant_id = ? AND question_id = ?'),
    upsertAnswer: db.prepare(`
      INSERT INTO answers (session_id, participant_id, question_id, option_ids_json, is_correct, answered_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (participant_id, question_id) DO UPDATE SET
        option_ids_json = excluded.option_ids_json, is_correct = excluded.is_correct, answered_at = excluded.answered_at`),
    insertAnswer: db.prepare(`
      INSERT INTO answers (session_id, participant_id, question_id, option_ids_json, is_correct, answered_at)
      VALUES (?, ?, ?, ?, ?, ?)`),
    deleteAnswer: db.prepare('DELETE FROM answers WHERE participant_id = ? AND question_id = ?'),
  };

  function get(id: number): Session | undefined {
    if (!Number.isSafeInteger(id)) return undefined;
    const row = sql.sessionById.get(id) as unknown as SessionRow | undefined;
    return row && toSession(row);
  }

  function getByCode(code: string): Session | undefined {
    const row = sql.sessionByCode.get(code) as unknown as SessionRow | undefined;
    return row && toSession(row);
  }

  function newCode(): string {
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      if (!sql.codeTaken.get(code)) return code;
    }
  }

  // ---- Attempt timing (self-paced) -------------------------------------------

  /** This participant's question order: shuffled if the session says so, the same on every request. */
  function questionOrder(session: Session, participant: Participant): Question[] {
    const { questions } = session.quiz;
    if (!session.settings.shuffleQuestions) return questions;
    return shuffled(questions, seededRandom(`${session.id}:${participant.id}:questions`));
  }

  /** A question as this participant sees it: options in their own order, no correct flags. */
  function studentQuestion(session: Session, participant: Participant, question: Question): StudentQuestion {
    const options = shuffled(question.options, seededRandom(`${session.id}:${participant.id}:${question.id}`));
    return {
      id: question.id,
      kind: question.kind,
      selection: question.selection,
      body: question.body,
      options: options.map(({ id, body }) => ({ id, body })),
    };
  }

  /** Attempts never run past the session's closing time. */
  function capDeadline(session: Session, deadline: number): number {
    const closesAt = toMs(session.settings.closesAt);
    return closesAt === null ? deadline : Math.min(deadline, closesAt);
  }

  function finish(participant: Participant, reason: EndReason, at: number): Participant {
    sql.finish.run(isoTime(at), reason, participant.id);
    return { ...participant, submittedAt: isoTime(at), endReason: reason };
  }

  /** Shows question `index` with a fresh timer, or ends the attempt after the last one. */
  function moveTo(session: Session, participant: Participant, index: number, now: number, reasonIfDone: EndReason): Participant {
    const question = questionOrder(session, participant)[index];
    if (!question) return finish(participant, reasonIfDone, now);
    const deadline = capDeadline(session, now + timeLimitMs(session.quiz, question));
    sql.move.run(index, deadline, participant.id);
    return { ...participant, currentIndex: index, deadline };
  }

  /**
   * Applies what the clock decided since the participant's last request: an attempt
   * ends when the session closes or its total time runs out. With `advance`, an
   * expired question (timer per question) moves on to the next one, whose timer
   * starts now; the presenter's views pass false so they never start a question.
   */
  function settle(session: Session, participant: Participant, now: number, advance: boolean): Participant {
    if (!participant.startedAt || participant.submittedAt) return participant;
    if (sessionState(session, now) === 'closed') {
      const closesAt = toMs(session.settings.closesAt);
      return finish(participant, 'closed', closesAt !== null && closesAt < now ? closesAt : now);
    }
    if (participant.deadline === null || now <= participant.deadline + GRACE_MS) return participant;
    if (session.settings.timerMode === 'perQuestion') {
      return advance ? moveTo(session, participant, participant.currentIndex + 1, now, 'time') : participant;
    }
    return finish(participant, 'time', participant.deadline);
  }

  function settleSession(session: Session, now: number): void {
    if (session.mode === 'sync') return; // live sessions follow the presenter, not per-student clocks
    for (const row of sql.unsettled.all(session.id) as unknown as ParticipantRow[]) {
      settle(session, toParticipant(row), now, false);
    }
  }

  function toAnswer(row: AnswerRow): AnswerResult {
    return { optionIds: JSON.parse(row.option_ids_json) as string[], correct: row.is_correct === null ? null : row.is_correct === 1 };
  }

  function answersOf(participantId: number): Record<string, AnswerResult> {
    const rows = sql.answersOf.all(participantId) as unknown as AnswerRow[];
    return Object.fromEntries(rows.map((row) => [row.question_id, toAnswer(row)]));
  }

  function score(session: Session, answers: Record<string, AnswerResult>) {
    return {
      correct: Object.values(answers).filter((answer) => answer.correct === true).length,
      total: session.quiz.questions.filter((question) => question.kind === 'quiz').length,
    };
  }

  // ---- Views ------------------------------------------------------------------

  function summarize(session: Session, counts: Counts, now: number): SessionSummary {
    return {
      id: session.id,
      code: session.code,
      mode: session.mode,
      quizId: session.quizId,
      title: session.quiz.title,
      state: sessionState(session, now),
      createdAt: session.createdAt,
      participantCount: counts.participants,
      submittedCount: counts.submitted,
    };
  }

  function detail(session: Session, now: number, joinBase: string): SessionDetail {
    settleSession(session, now);
    const counts = sql.counts.get(session.id) as unknown as Counts;
    return {
      ...summarize(session, counts, now),
      settings: session.settings,
      joinUrl: `${joinBase}/j/${session.code}`,
      questionCount: session.quiz.questions.length,
      closedManually: session.closedManually,
      livePhase: session.live.phase,
    };
  }

  function joinInfo(session: Session, now: number): JoinInfo {
    const { opensAt, closesAt, timerMode, totalMinutes, email } = session.settings;
    return {
      code: session.code,
      mode: session.mode,
      title: session.quiz.title,
      description: session.quiz.description,
      state: sessionState(session, now),
      opensAt,
      closesAt,
      questionCount: session.quiz.questions.length,
      timerMode,
      totalMinutes,
      email,
    };
  }

  function assertOpen(session: Session, now: number): void {
    const state = sessionState(session, now);
    if (state !== 'open') throw new PlayError(403, state === 'scheduled' ? 'not_open' : 'closed');
  }

  return {
    get,
    getByCode,
    joinInfo,
    detail,
    studentQuestion,

    create(quiz: Quiz, settings: AsyncSettings, mode: SessionMode = 'async'): Session {
      const { lastInsertRowid } = sql.insertSession.run(
        quiz.id,
        newCode(),
        mode,
        JSON.stringify(settings),
        JSON.stringify(contentOf(quiz)),
        mode === 'sync' ? 'lobby' : null,
      );
      return get(Number(lastInsertRowid))!;
    },

    list(now: number, quizId?: number): SessionSummary[] {
      for (const { session_id } of sql.sessionsWithUnsettled.all() as { session_id: number }[]) {
        const session = get(session_id);
        if (session) settleSession(session, now);
      }
      const rows = (quizId === undefined ? sql.summaries.all() : sql.summariesForQuiz.all(quizId)) as unknown as (SessionRow &
        Counts)[];
      return rows.map((row) => summarize(toSession(row), row, now));
    },

    update(session: Session, changes: Partial<Pick<AsyncSettings, 'opensAt' | 'closesAt' | 'showScore'>>): Session {
      const settings = { ...session.settings, ...changes };
      sql.updateSettings.run(JSON.stringify(settings), session.id);
      return { ...session, settings };
    },

    setClosed(session: Session, closed: boolean, now: number): Session {
      sql.setStatus.run(closed ? 'closed' : 'open', session.id);
      const updated = { ...session, closedManually: closed };
      // Attempts in progress end now rather than whenever each student next connects.
      if (closed) settleSession(updated, now);
      return updated;
    },

    remove(id: number): boolean {
      return Number(sql.deleteSession.run(id).changes) > 0;
    },

    removeParticipant(session: Session, participantId: number): boolean {
      return Number(sql.deleteParticipant.run(participantId, session.id).changes) > 0;
    },

    // ---- Students ---------------------------------------------------------------

    /** Registers a participant and returns their secret token. */
    join(session: Session, rawName: string, rawEmail: string, now: number): string {
      assertOpen(session, now);
      const name = cleanName(rawName);
      if (!name || name.length > SESSION_LIMITS.nameLength || /\p{Cc}/u.test(name)) {
        throw new PlayError(400, 'invalid_name');
      }
      let email: string | null = rawEmail.trim() || null;
      if (session.settings.email === 'hidden') email = null;
      else if (email === null && session.settings.email === 'required') throw new PlayError(400, 'email_required');
      else if (email !== null && (email.length > SESSION_LIMITS.emailLength || !EMAIL_PATTERN.test(email))) {
        throw new PlayError(400, 'invalid_email');
      }

      const token = randomBytes(24).toString('base64url');
      try {
        const { lastInsertRowid } = sql.insertParticipant.run(session.id, name, nameKey(name), email, hashToken(token));
        // In a live session everyone takes part from the moment they join.
        if (session.mode === 'sync') sql.start.run(isoTime(now), null, lastInsertRowid);
      } catch (err) {
        if (err instanceof Error && /UNIQUE/.test(err.message)) throw new PlayError(409, 'name_taken');
        throw err;
      }
      return token;
    },

    authenticate(session: Session, token: string): Participant | undefined {
      const row = sql.participantByToken.get(session.id, hashToken(token)) as unknown as ParticipantRow | undefined;
      return row && toParticipant(row);
    },

    playState(session: Session, participant: Participant, now: number): PlayState {
      const p = settle(session, participant, now, true);
      const status = statusOf(p);
      const order = questionOrder(session, p);
      const answers = answersOf(p.id);
      let visible: Question[] = [];
      if (status === 'in_progress') {
        visible = session.settings.timerMode === 'perQuestion' ? order.slice(p.currentIndex, p.currentIndex + 1) : order;
      }
      return {
        info: joinInfo(session, now),
        name: p.name,
        status,
        serverNow: now,
        deadline: status === 'in_progress' ? p.deadline : null,
        questions: visible.map((question) => studentQuestion(session, p, question)),
        questionCount: order.length,
        index: p.currentIndex,
        answers: Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, answer.optionIds])),
        endReason: p.endReason,
        score: status === 'finished' && session.settings.showScore ? score(session, answers) : null,
      };
    },

    start(session: Session, participant: Participant, now: number): Participant {
      if (participant.startedAt) return settle(session, participant, now, true);
      assertOpen(session, now);
      const { timerMode, totalMinutes, closesAt } = session.settings;
      const first = questionOrder(session, participant)[0];
      let deadline = toMs(closesAt);
      if (timerMode === 'total' && totalMinutes) deadline = capDeadline(session, now + totalMinutes * 60_000);
      if (timerMode === 'perQuestion' && first) deadline = capDeadline(session, now + timeLimitMs(session.quiz, first));
      sql.start.run(isoTime(now), deadline, participant.id);
      return { ...participant, startedAt: isoTime(now), currentIndex: 0, deadline };
    },

    /** Saves (or, with no options, clears) an answer while the attempt is open. */
    answer(session: Session, participant: Participant, questionId: string, optionIds: string[], now: number): void {
      const p = settle(session, participant, now, true);
      if (!p.startedAt) throw new PlayError(409, 'not_started');
      if (p.submittedAt) throw new PlayError(409, 'finished');
      const question = session.quiz.questions.find((q) => q.id === questionId);
      if (!question) throw new PlayError(404, 'not_found');
      if (session.settings.timerMode === 'perQuestion' && questionOrder(session, p)[p.currentIndex]?.id !== questionId) {
        throw new PlayError(409, 'not_current');
      }
      const ids = validOptionIds(question, optionIds);
      if (ids.length === 0) {
        sql.deleteAnswer.run(p.id, questionId);
        return;
      }
      const correct = isCorrect(question, ids);
      sql.upsertAnswer.run(session.id, p.id, questionId, JSON.stringify(ids), correct === null ? null : correct ? 1 : 0, isoTime(now));
    },

    /** Timer per question: leaves question `from` for the next one. Repeating the call has no further effect. */
    next(session: Session, participant: Participant, from: number, now: number): Participant {
      const p = settle(session, participant, now, true);
      if (session.settings.timerMode !== 'perQuestion' || !p.startedAt || p.submittedAt || p.currentIndex !== from) return p;
      // Leaving the last question because its time ran out ends the attempt as timed out.
      const timedOut = p.deadline !== null && now >= p.deadline;
      return moveTo(session, p, from + 1, now, timedOut ? 'time' : 'submitted');
    },

    submit(session: Session, participant: Participant, now: number): Participant {
      const p = settle(session, participant, now, true);
      if (!p.startedAt) throw new PlayError(409, 'not_started');
      return p.submittedAt ? p : finish(p, 'submitted', now);
    },

    // ---- Live sessions ------------------------------------------------------------

    participants(session: Session): Participant[] {
      return (sql.participants.all(session.id) as unknown as ParticipantRow[]).map(toParticipant);
    },

    participant(session: Session, participantId: number): Participant | undefined {
      const row = sql.participantById.get(participantId, session.id) as unknown as ParticipantRow | undefined;
      return row && toParticipant(row);
    },

    /** Current participants' answers to one question, by participant id. */
    answersForQuestion(session: Session, questionId: string): Map<number, string[]> {
      const rows = sql.answersForQuestion.all(session.id, questionId) as unknown as AnswerRow[];
      return new Map(rows.map((row) => [row.participant_id, JSON.parse(row.option_ids_json) as string[]]));
    },

    hasAnswered(participant: Participant, questionId: string): boolean {
      return sql.answerOf.get(participant.id, questionId) !== undefined;
    },

    /** Records a live answer; answers are final. */
    saveLiveAnswer(session: Session, participant: Participant, question: Question, optionIds: string[], now: number): void {
      const ids = validOptionIds(question, optionIds);
      if (ids.length === 0) throw new PlayError(400, 'invalid_answer');
      const correct = isCorrect(question, ids);
      try {
        sql.insertAnswer.run(session.id, participant.id, question.id, JSON.stringify(ids), correct === null ? null : correct ? 1 : 0, isoTime(now));
      } catch (err) {
        if (err instanceof Error && /UNIQUE/.test(err.message)) throw new PlayError(409, 'already_answered');
        throw err;
      }
    },

    setLive(session: Session, phase: LivePhase, questionIndex: number, deadline: number | null, now: number): Session {
      sql.setLive.run(phase, questionIndex, deadline, isoTime(now), session.id);
      return { ...session, live: { phase, questionIndex, deadline } };
    },

    /** Finishes a live session: it no longer accepts participants, and everyone's attempt is complete. */
    endLive(session: Session, now: number): Session {
      sql.finishAll.run(isoTime(now), session.id);
      sql.endLive.run(isoTime(now), session.id);
      return { ...session, closedManually: true, live: { ...session.live, phase: 'finished', deadline: null } };
    },

    /** Live sessions with a question open (to resume their timers after a restart). */
    liveSessionsWithOpenQuestion(): Session[] {
      return (sql.openLive.all() as unknown as SessionRow[]).map(toSession);
    },

    // ---- Presenter ----------------------------------------------------------------

    results(session: Session, now: number, joinBase: string): SessionResults {
      const sessionDetail = detail(session, now, joinBase);
      const answersByParticipant = new Map<number, Record<string, AnswerResult>>();
      for (const row of sql.answersOfSession.all(session.id) as unknown as AnswerRow[]) {
        const answers = answersByParticipant.get(row.participant_id) ?? {};
        answers[row.question_id] = toAnswer(row);
        answersByParticipant.set(row.participant_id, answers);
      }
      const participants: ParticipantResult[] = (sql.participants.all(session.id) as unknown as ParticipantRow[])
        .map(toParticipant)
        .map((p) => {
          const answers = answersByParticipant.get(p.id) ?? {};
          return {
            id: p.id,
            name: p.name,
            email: p.email,
            status: statusOf(p),
            endReason: p.endReason,
            joinedAt: p.joinedAt,
            startedAt: p.startedAt,
            submittedAt: p.submittedAt,
            correct: score(session, answers).correct,
            answered: Object.keys(answers).length,
            answers,
          };
        });
      return { session: sessionDetail, questions: session.quiz.questions, participants };
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
