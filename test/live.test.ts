import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as connect, type Socket } from 'socket.io-client';
import { buildApp } from '../src/server/app.ts';
import { loadConfig } from '../src/server/config.ts';
import { openDatabase } from '../src/server/db.ts';
import { LIVE_GRACE_MS, type LiveAck, type LivePresenterView, type LiveStudentView } from '../src/shared/live.ts';
import type { Quiz, QuizContent } from '../src/shared/quiz.ts';
import type { SessionDetail, SessionResults } from '../src/shared/session.ts';
import { adminCookies, makeApp, sampleQuiz, tempDir, TEST_PASSWORD } from './helpers.ts';

let app: FastifyInstance | undefined;
let url = '';
let cookies: Record<string, string> = {};
const sockets: Socket[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets.splice(0)) socket.disconnect();
  await app?.close();
  app = undefined;
});

async function createLiveSession(target: FastifyInstance, content: QuizContent = sampleQuiz()) {
  const quiz: Quiz = (await target.inject({ method: 'POST', url: '/api/admin/quizzes', cookies, payload: content })).json();
  const response = await target.inject({
    method: 'POST',
    url: '/api/admin/sessions',
    cookies,
    payload: { quizId: quiz.id, mode: 'sync', settings: { email: 'hidden' } },
  });
  expect(response.statusCode).toBe(201);
  return { quiz, session: response.json() as SessionDetail };
}

/** A listening server (sockets need a real one) with a live session of the sample quiz. */
async function setup(content?: QuizContent) {
  ({ app } = await makeApp());
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  cookies = await adminCookies(app);
  return createLiveSession(app, content);
}

function open(auth: object, headers: Record<string, string> = {}): Socket {
  const socket = connect(url, { auth, extraHeaders: headers, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  return socket;
}

function presenter(sessionId: number): Socket {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return open({ role: 'presenter', sessionId }, { cookie });
}

async function student(code: string, name: string) {
  const response = await app!.inject({ method: 'POST', url: `/api/join/${code}`, payload: { name } });
  const { token } = response.json() as { token: string };
  return { token, socket: open({ role: 'student', code, token }) };
}

/** The next 'state' message that matches. */
function nextState<T>(socket: Socket, matches: (state: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve) => {
    const listener = (state: T) => {
      if (!matches(state)) return;
      socket.off('state', listener);
      resolve(state);
    };
    socket.on('state', listener);
  });
}

function refusal(socket: Socket): Promise<string> {
  return new Promise((resolve) => socket.once('connect_error', (error) => resolve(error.message)));
}

function send(socket: Socket, event: string, ...args: unknown[]): Promise<LiveAck> {
  return socket.timeout(2000).emitWithAck(event, ...args);
}

describe('live sessions', () => {
  it('lets only the logged-in presenter and joined students connect', async () => {
    const { session } = await setup();
    expect(await refusal(open({ role: 'presenter', sessionId: session.id }))).toBe('unauthorized');
    expect(await refusal(open({ role: 'student', code: session.code, token: 'not-a-token' }))).toBe('invalid_token');
    const otherCode = session.code === '000000' ? '000001' : '000000';
    expect(await refusal(open({ role: 'student', code: otherCode, token: 'x' }))).toBe('not_found');
  });

  it('shows students arriving in the lobby', async () => {
    const { session } = await setup();
    const host = presenter(session.id);
    expect((await nextState<LivePresenterView>(host)).phase).toBe('lobby');

    const arrived = nextState<LivePresenterView>(host, (s) => s.participants.some((p) => p.name === 'Ana' && p.online));
    const ana = await student(session.code, 'Ana');
    expect(await nextState<LiveStudentView>(ana.socket)).toMatchObject({ phase: 'lobby', name: 'Ana', question: null });
    expect((await arrived).participants).toEqual([{ id: expect.any(Number), name: 'Ana', answered: false, online: true }]);
  });

  it('runs the questions one at a time and records the answers', async () => {
    const { session, quiz } = await setup();
    const [single, poll] = quiz.questions;
    const host = presenter(session.id);
    await nextState(host);
    const ana = await student(session.code, 'Ana');
    await nextState(ana.socket);

    const opened = nextState<LiveStudentView>(ana.socket, (s) => s.phase === 'open');
    expect(await send(host, 'start')).toEqual({ ok: true });
    expect(await send(host, 'start')).toEqual({ error: 'wrong_phase' });
    const first = await opened;
    expect(first.question!.id).toBe(single!.id);
    expect(first.deadline).toBeGreaterThan(Date.now());
    expect(JSON.stringify(first)).not.toContain('correct');

    const counted = nextState<LivePresenterView>(host, (s) => s.answeredCount === 1);
    expect(await send(ana.socket, 'answer', { questionId: single!.id, optionIds: ['b'] })).toEqual({ ok: true });
    expect((await counted).participants[0]!.answered).toBe(true);
    // Answers are final.
    expect(await send(ana.socket, 'answer', { questionId: single!.id, optionIds: ['a'] })).toEqual({
      error: 'already_answered',
    });

    const closed = nextState<LivePresenterView>(host, (s) => s.phase === 'closed');
    expect(await send(host, 'close')).toEqual({ ok: true });
    expect((await closed).counts).toEqual({ a: 0, b: 1 });

    const second = nextState<LiveStudentView>(ana.socket, (s) => s.phase === 'open' && s.questionIndex === 1);
    expect(await send(host, 'next')).toEqual({ ok: true });
    expect((await second).question!.id).toBe(poll!.id);
    expect(await send(ana.socket, 'answer', { questionId: single!.id, optionIds: ['b'] })).toEqual({ error: 'not_open' });

    const finished = nextState<LiveStudentView>(ana.socket, (s) => s.phase === 'finished');
    expect(await send(host, 'end')).toEqual({ ok: true });
    await finished;

    const results: SessionResults = (
      await app!.inject({ method: 'GET', url: `/api/admin/sessions/${session.id}/results`, cookies })
    ).json();
    expect(results.session).toMatchObject({ state: 'closed', livePhase: 'finished' });
    expect(results.participants).toMatchObject([{ name: 'Ana', status: 'finished', correct: 1, answered: 1 }]);
    const late = await app!.inject({ method: 'POST', url: `/api/join/${session.code}`, payload: { name: 'Late' } });
    expect(late.json()).toEqual({ error: 'closed' });
  });

  it('lets latecomers join during a question', async () => {
    const { session, quiz } = await setup();
    const host = presenter(session.id);
    await nextState(host);
    await send(host, 'start');
    const bia = await student(session.code, 'Bia');
    const view = await nextState<LiveStudentView>(bia.socket);
    expect(view).toMatchObject({ phase: 'open', questionIndex: 0, answered: false });
    expect(view.question!.id).toBe(quiz.questions[0]!.id);
  });

  it('refuses late answers and closes the question when its time is up', async () => {
    const content = sampleQuiz();
    content.questions[0]!.timeLimitS = 5;
    const { session, quiz } = await setup(content);
    const host = presenter(session.id);
    await nextState(host);
    const ana = await student(session.code, 'Ana');
    await nextState(ana.socket);

    const opened = nextState<LiveStudentView>(ana.socket, (s) => s.phase === 'open');
    await send(host, 'start');
    const { deadline } = await opened;
    expect(deadline).toBeGreaterThan(Date.now() + 4000);

    vi.spyOn(Date, 'now').mockReturnValue(deadline! + LIVE_GRACE_MS + 1);
    const late = await send(ana.socket, 'answer', { questionId: quiz.questions[0]!.id, optionIds: ['b'] });
    vi.restoreAllMocks();
    expect(late).toEqual({ error: 'time_up' });

    // Nobody presses anything: the server closes the question on its own.
    const closed = await nextState<LivePresenterView>(host, (s) => s.phase === 'closed');
    expect(closed).toMatchObject({ questionIndex: 0, answeredCount: 0 });
  }, 12_000);

  it('closes a question whose time ran out while the server was down', async () => {
    const db = openDatabase(':memory:');
    const config = loadConfig({ ADMIN_PASSWORD: TEST_PASSWORD, DATA_DIR: tempDir() });
    const first = await buildApp(config, db);
    cookies = await adminCookies(first);
    const { session } = await createLiveSession(first);
    db.prepare(`UPDATE sessions SET phase = 'open', question_index = 0, deadline_ms = ? WHERE id = ?`).run(
      Date.now() - 10_000,
      session.id,
    );
    await first.close();

    app = await buildApp(config, db);
    const detail: SessionDetail = (await app.inject({ method: 'GET', url: `/api/admin/sessions/${session.id}`, cookies })).json();
    expect(detail.livePhase).toBe('closed');
  });

  it('sends a removed student back to the join form and frees the name', async () => {
    const { session } = await setup();
    const ana = await student(session.code, 'Ana');
    await nextState(ana.socket);
    const results: SessionResults = (
      await app!.inject({ method: 'GET', url: `/api/admin/sessions/${session.id}/results`, cookies })
    ).json();

    const removed = new Promise<void>((resolve) => ana.socket.once('removed', () => resolve()));
    const response = await app!.inject({
      method: 'DELETE',
      url: `/api/admin/sessions/${session.id}/participants/${results.participants[0]!.id}`,
      cookies,
    });
    expect(response.statusCode).toBe(204);
    await removed;
    expect((await student(session.code, 'Ana')).token).toEqual(expect.any(String));
  });

  it('keeps the self-paced endpoints closed for live sessions', async () => {
    const { session } = await setup();
    const { token } = await student(session.code, 'Ana');
    const response = await app!.inject({
      method: 'GET',
      url: `/api/play/${session.code}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.json()).toEqual({ error: 'live_session' });
  });

  it('ends a live session from the session page', async () => {
    const { session } = await setup();
    const ended = await app!.inject({ method: 'PATCH', url: `/api/admin/sessions/${session.id}`, cookies, payload: { closed: true } });
    expect(ended.json()).toMatchObject({ state: 'closed', livePhase: 'finished' });
    const reopen = await app!.inject({ method: 'PATCH', url: `/api/admin/sessions/${session.id}`, cookies, payload: { closed: false } });
    expect(reopen.statusCode).toBe(400);
  });
});
