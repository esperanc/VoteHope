// Live sessions: the presenter moves the class through the questions and every
// connected phone follows. The server holds the state (in the database, so a
// restart resumes it) and owns the clock: questions close by themselves once
// their time, plus a small allowance for network delay, has passed.
//
// Every change is pushed as a complete view, so a phone that reconnects (screen
// locked, Wi-Fi hiccup) simply receives the current state; nothing is replayed.
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { LIVE_GRACE_MS, type LiveAck, type LivePresenterView, type LiveStudentView } from '../shared/live.ts';
import { LIMITS, type Question } from '../shared/quiz.ts';
import type { StudentQuestion } from '../shared/session.ts';
import { PlayError, timeLimitMs, type Participant, type Session, type SessionStore } from './sessions.ts';

type SocketData =
  | { role: 'presenter'; sessionId: number }
  | { role: 'student'; sessionId: number; participantId: number };

const room = {
  presenters: (sessionId: number) => `presenters:${sessionId}`,
  students: (sessionId: number) => `students:${sessionId}`,
  participant: (participantId: number) => `participant:${participantId}`,
};

const AnswerPayload = z.object({
  questionId: z.string().max(32),
  optionIds: z.array(z.string().max(32)).max(LIMITS.maxOptions),
});

type Action = 'start' | 'close' | 'next' | 'end';

/** The question as projected: authored option order, without correct flags. */
function projected(question: Question): StudentQuestion {
  return {
    id: question.id,
    kind: question.kind,
    selection: question.selection,
    body: question.body,
    options: question.options.map(({ id, body }) => ({ id, body })),
  };
}

export function createLiveEngine(sessions: SessionStore, logError: (error: unknown) => void) {
  let io: Server | undefined;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  /** Open connections per participant (a phone may briefly have two while reconnecting). */
  const connections = new Map<number, number>();

  function currentQuestion(session: Session): Question | undefined {
    const { phase, questionIndex } = session.live;
    return phase === 'open' || phase === 'closed' ? session.quiz.questions[questionIndex] : undefined;
  }

  // ---- Views ------------------------------------------------------------------

  function presenterView(session: Session, now: number): LivePresenterView {
    const question = currentQuestion(session);
    const answers = question ? sessions.answersForQuestion(session, question.id) : new Map<number, string[]>();
    let counts: Record<string, number> | null = null;
    if (question && session.live.phase === 'closed') {
      counts = Object.fromEntries(question.options.map((option) => [option.id, 0]));
      for (const optionIds of answers.values()) for (const id of optionIds) counts[id] = (counts[id] ?? 0) + 1;
    }
    return {
      phase: session.live.phase ?? 'lobby',
      questionIndex: session.live.questionIndex,
      questionCount: session.quiz.questions.length,
      question: question ? projected(question) : null,
      deadline: session.live.phase === 'open' ? session.live.deadline : null,
      serverNow: now,
      participants: sessions.participants(session).map((p) => ({
        id: p.id,
        name: p.name,
        answered: answers.has(p.id),
        online: (connections.get(p.id) ?? 0) > 0,
      })),
      answeredCount: answers.size,
      counts,
    };
  }

  function studentView(session: Session, participant: Participant, now: number): LiveStudentView {
    const question = currentQuestion(session);
    const open = session.live.phase === 'open' && question !== undefined;
    return {
      phase: session.live.phase ?? 'lobby',
      title: session.quiz.title,
      name: participant.name,
      questionIndex: session.live.questionIndex,
      questionCount: session.quiz.questions.length,
      question: open ? sessions.studentQuestion(session, participant, question) : null,
      deadline: open ? session.live.deadline : null,
      serverNow: now,
      answered: question ? sessions.hasAnswered(participant, question.id) : false,
    };
  }

  function sendToPresenters(session: Session): void {
    io?.to(room.presenters(session.id)).emit('state', presenterView(session, Date.now()));
  }

  function sendToStudent(session: Session, participant: Participant): void {
    io?.to(room.participant(participant.id)).emit('state', studentView(session, participant, Date.now()));
  }

  /** Everyone gets the new state; each student their own version of it. */
  function broadcast(sessionId: number): void {
    const session = sessions.get(sessionId);
    if (!session || !io) return;
    sendToPresenters(session);
    for (const participant of sessions.participants(session)) sendToStudent(session, participant);
  }

  // ---- The session's course ---------------------------------------------------

  /** Closes the question once its time and the allowance for late answers have passed. */
  function schedule(session: Session): void {
    clearTimeout(timers.get(session.id));
    const { phase, deadline, questionIndex } = session.live;
    if (phase !== 'open' || deadline === null) return;
    const delay = Math.max(0, deadline + LIVE_GRACE_MS - Date.now());
    timers.set(
      session.id,
      setTimeout(() => closeIfDue(session.id, questionIndex), delay),
    );
  }

  function closeIfDue(sessionId: number, questionIndex: number): void {
    const session = sessions.get(sessionId);
    if (!session || session.live.phase !== 'open' || session.live.questionIndex !== questionIndex) return;
    if (Date.now() < (session.live.deadline ?? 0) + LIVE_GRACE_MS) return schedule(session);
    sessions.setLive(session, 'closed', questionIndex, session.live.deadline, Date.now());
    broadcast(sessionId);
  }

  function openQuestion(session: Session, index: number, now: number): void {
    const question = session.quiz.questions[index];
    if (!question) return finish(session, now);
    const deadline = now + timeLimitMs(session.quiz, question);
    schedule(sessions.setLive(session, 'open', index, deadline, now));
    broadcast(session.id);
  }

  function finish(session: Session, now: number): void {
    clearTimeout(timers.get(session.id));
    timers.delete(session.id);
    sessions.endLive(session, now);
    broadcast(session.id);
  }

  const actions: Record<Action, (session: Session, now: number) => void> = {
    start(session, now) {
      if (session.live.phase !== 'lobby') throw new PlayError(409, 'wrong_phase');
      openQuestion(session, 0, now);
    },
    close(session, now) {
      if (session.live.phase !== 'open') throw new PlayError(409, 'wrong_phase');
      clearTimeout(timers.get(session.id));
      const deadline = Math.min(session.live.deadline ?? now, now);
      sessions.setLive(session, 'closed', session.live.questionIndex, deadline, now);
      broadcast(session.id);
    },
    next(session, now) {
      // After the last question, "next" finishes the quiz.
      if (session.live.phase !== 'closed') throw new PlayError(409, 'wrong_phase');
      openQuestion(session, session.live.questionIndex + 1, now);
    },
    end(session, now) {
      if (session.live.phase !== 'finished') finish(session, now);
    },
  };

  function answer(session: Session, participant: Participant, questionId: string, optionIds: string[], now: number): void {
    const question = currentQuestion(session);
    if (session.live.phase !== 'open' || !question || question.id !== questionId) throw new PlayError(409, 'not_open');
    if (now > (session.live.deadline ?? 0) + LIVE_GRACE_MS) throw new PlayError(409, 'time_up');
    sessions.saveLiveAnswer(session, participant, question, optionIds, now);
    sendToPresenters(session);
    sendToStudent(session, participant);
  }

  // ---- Connections ----------------------------------------------------------------

  function authenticate(socket: Socket, isAdmin: (cookieHeader: string | undefined) => boolean): SocketData {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    if (auth.role === 'presenter') {
      if (!isAdmin(socket.handshake.headers.cookie)) throw new PlayError(401, 'unauthorized');
      const session = sessions.get(Number(auth.sessionId));
      if (!session || session.mode !== 'sync') throw new PlayError(404, 'not_found');
      return { role: 'presenter', sessionId: session.id };
    }
    if (auth.role === 'student') {
      const session = typeof auth.code === 'string' ? sessions.getByCode(auth.code) : undefined;
      if (!session || session.mode !== 'sync') throw new PlayError(404, 'not_found');
      const participant = typeof auth.token === 'string' ? sessions.authenticate(session, auth.token) : undefined;
      if (!participant) throw new PlayError(401, 'invalid_token');
      return { role: 'student', sessionId: session.id, participantId: participant.id };
    }
    throw new PlayError(401, 'unauthorized');
  }

  /** Runs a request and replies { ok } or { error: code }. */
  function respond(ack: unknown, action: () => void): void {
    let result: LiveAck;
    try {
      action();
      result = { ok: true };
    } catch (err) {
      if (!(err instanceof PlayError)) logError(err);
      result = { error: err instanceof PlayError ? err.code : 'unexpected' };
    }
    if (typeof ack === 'function') ack(result);
  }

  /** Lets clients estimate the difference between their clock and the server's. */
  function clock(ack: unknown): void {
    if (typeof ack === 'function') ack(Date.now());
  }

  function onPresenter(socket: Socket, sessionId: number): void {
    void socket.join(room.presenters(sessionId));
    const session = sessions.get(sessionId);
    if (session) socket.emit('state', presenterView(session, Date.now()));
    socket.on('clock', clock);
    for (const action of ['start', 'close', 'next', 'end'] as const) {
      socket.on(action, (ack: unknown) =>
        respond(ack, () => {
          const current = sessions.get(sessionId);
          if (!current) throw new PlayError(404, 'not_found');
          actions[action](current, Date.now());
        }),
      );
    }
  }

  function onStudent(socket: Socket, sessionId: number, participantId: number): void {
    void socket.join([room.students(sessionId), room.participant(participantId)]);
    connections.set(participantId, (connections.get(participantId) ?? 0) + 1);
    const session = sessions.get(sessionId);
    const participant = session && sessions.participant(session, participantId);
    if (session && participant) {
      socket.emit('state', studentView(session, participant, Date.now()));
      sendToPresenters(session);
    }

    socket.on('clock', clock);
    socket.on('answer', (payload: unknown, ack: unknown) =>
      respond(ack, () => {
        const parsed = AnswerPayload.safeParse(payload);
        if (!parsed.success) throw new PlayError(400, 'invalid_request');
        const current = sessions.get(sessionId);
        const me = current && sessions.participant(current, participantId);
        if (!current || !me) throw new PlayError(404, 'not_found');
        answer(current, me, parsed.data.questionId, parsed.data.optionIds, Date.now());
      }),
    );
    socket.on('disconnect', () => {
      const remaining = (connections.get(participantId) ?? 1) - 1;
      if (remaining > 0) connections.set(participantId, remaining);
      else connections.delete(participantId);
      const current = sessions.get(sessionId);
      if (current) sendToPresenters(current);
    });
  }

  return {
    /** Serves live sessions on this Socket.IO server; presenters are recognized by their login cookie. */
    attach(server: Server, isAdmin: (cookieHeader: string | undefined) => boolean): void {
      io = server;
      server.use((socket, next) => {
        try {
          socket.data = authenticate(socket, isAdmin);
          next();
        } catch (err) {
          next(new Error(err instanceof PlayError ? err.code : 'unauthorized'));
        }
      });
      server.on('connection', (socket) => {
        const data = socket.data as SocketData;
        if (data.role === 'presenter') onPresenter(socket, data.sessionId);
        else onStudent(socket, data.sessionId, data.participantId);
      });
      // Questions open when the server stopped close now if their time has passed,
      // or keep running on the same clock.
      for (const session of sessions.liveSessionsWithOpenQuestion()) closeIfDue(session.id, session.live.questionIndex);
    },

    /** The participant list changed (someone joined). */
    participantsChanged(sessionId: number): void {
      const session = sessions.get(sessionId);
      if (session) sendToPresenters(session);
    },

    /** A participant was deleted: their phone goes back to the join form. */
    participantRemoved(sessionId: number, participantId: number): void {
      io?.to(room.participant(participantId)).emit('removed');
      io?.in(room.participant(participantId)).disconnectSockets(true);
      connections.delete(participantId);
      this.participantsChanged(sessionId);
    },

    /** The session was deleted. */
    sessionDeleted(sessionId: number): void {
      clearTimeout(timers.get(sessionId));
      timers.delete(sessionId);
      io?.to(room.students(sessionId)).emit('session_deleted');
      io?.in(room.students(sessionId)).disconnectSockets(true);
      io?.in(room.presenters(sessionId)).disconnectSockets(true);
    },

    /** Ends a live session from outside the presenter screen (the session page). */
    end(session: Session): void {
      actions.end(session, Date.now());
    },

    stop(): void {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

export type LiveEngine = ReturnType<typeof createLiveEngine>;
