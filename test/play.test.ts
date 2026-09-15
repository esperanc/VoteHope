import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { newQuestion, type Quiz, type QuizContent } from '../src/shared/quiz.ts';
import {
  DEFAULT_ASYNC_SETTINGS,
  GRACE_MS,
  type AsyncSettings,
  type PlayState,
  type SessionDetail,
  type SessionResults,
} from '../src/shared/session.ts';
import { adminCookies, makeApp, sampleQuiz } from './helpers.ts';

let app: FastifyInstance | undefined;
let cookies: Record<string, string>;
let clock = 0;

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

/** Freezes Date.now (the server's clock) so timers can be stepped through. */
function freezeTime(at = Date.parse('2026-09-15T12:00:00Z')) {
  clock = at;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
}

const advance = (ms: number) => (clock += ms);

/** The sample quiz (one single-answer question, one poll) plus a question with two correct options. */
function richQuiz(): QuizContent {
  const quiz = sampleQuiz();
  const multiple = newQuestion();
  multiple.selection = 'multiple';
  multiple.body = 'Which are even?';
  multiple.options = [
    { id: 'e2', body: '2', correct: true },
    { id: 'e3', body: '3', correct: false },
    { id: 'e4', body: '4', correct: true },
  ];
  quiz.questions.push(multiple);
  return quiz;
}

async function setup(settings: Partial<AsyncSettings> = {}, content: QuizContent = richQuiz()) {
  await app?.close();
  ({ app } = await makeApp());
  cookies = await adminCookies(app);
  const quiz: Quiz = (await app.inject({ method: 'POST', url: '/api/admin/quizzes', cookies, payload: content })).json();
  const session = await createSession(quiz.id, settings);
  return { quiz, session, code: session.code };
}

async function createSession(quizId: number, settings: Partial<AsyncSettings> = {}): Promise<SessionDetail> {
  const response = await app!.inject({
    method: 'POST',
    url: '/api/admin/sessions',
    cookies,
    payload: { quizId, mode: 'async', settings: { ...DEFAULT_ASYNC_SETTINGS, ...settings } },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

function join(code: string, name: string, email?: string) {
  return app!.inject({ method: 'POST', url: `/api/join/${code}`, payload: { name, ...(email === undefined ? {} : { email }) } });
}

async function joined(code: string, name = 'Ana'): Promise<string> {
  const response = await join(code, name);
  expect(response.statusCode).toBe(201);
  return response.json().token;
}

function play(code: string, token: string, method: InjectOptions['method'], path = '', payload?: object) {
  return app!.inject({
    method,
    url: `/api/play/${code}${path}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });
}

async function state(code: string, token: string): Promise<PlayState> {
  return (await play(code, token, 'GET')).json();
}

async function start(code: string, token: string): Promise<PlayState> {
  const response = await play(code, token, 'POST', '/start');
  expect(response.statusCode).toBe(200);
  return response.json();
}

function answer(code: string, token: string, questionId: string, optionIds: string[]) {
  return play(code, token, 'PUT', `/answers/${questionId}`, { optionIds });
}

describe('joining a session', () => {
  it('shows what the quiz is about, but not its questions', async () => {
    const { code } = await setup();
    const response = await app!.inject({ method: 'GET', url: `/api/join/${code}` });
    expect(response.json()).toMatchObject({
      code,
      title: 'Sample',
      state: 'open',
      questionCount: 3,
      timerMode: 'none',
      email: 'optional',
    });
    expect(response.body).not.toContain('What is');
  });

  it('answers unknown codes with 404', async () => {
    const { code } = await setup();
    for (const other of [code === '000000' ? '000001' : '000000', 'abc', '1234567']) {
      expect((await app!.inject({ method: 'GET', url: `/api/join/${other}` })).statusCode).toBe(404);
    }
  });

  it('refuses a name already taken, ignoring case, accents and spacing', async () => {
    const { code } = await setup();
    expect((await join(code, '  José   Silva ')).statusCode).toBe(201);
    const again = await join(code, 'jose silva');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'name_taken' });
  });

  it('validates names and emails according to the session', async () => {
    const { code } = await setup({ email: 'required' });
    expect((await join(code, '   ', 'a@b.co')).json()).toEqual({ error: 'invalid_name' });
    expect((await join(code, 'x'.repeat(41), 'a@b.co')).json()).toEqual({ error: 'invalid_name' });
    expect((await join(code, 'Ana')).json()).toEqual({ error: 'email_required' });
    expect((await join(code, 'Ana', 'not-an-email')).json()).toEqual({ error: 'invalid_email' });
    expect((await join(code, 'Ana', 'ana@escola.br')).statusCode).toBe(201);
  });

  it('ignores emails when the session does not ask for them', async () => {
    const { session, code } = await setup({ email: 'hidden' });
    expect((await join(code, 'Ana', 'ana@escola.br')).statusCode).toBe(201);
    const results: SessionResults = (
      await app!.inject({ method: 'GET', url: `/api/admin/sessions/${session.id}/results`, cookies })
    ).json();
    expect(results.participants[0]!.email).toBeNull();
  });

  it('is refused before the opening time and after the closing time', async () => {
    freezeTime();
    const early = await setup({ opensAt: new Date(clock + 3_600_000).toISOString() });
    expect((await join(early.code, 'Ana')).json()).toEqual({ error: 'not_open' });
    const late = await setup({ closesAt: new Date(clock - 1000).toISOString() });
    expect((await join(late.code, 'Ana')).json()).toEqual({ error: 'closed' });
  });
});

describe('answering', () => {
  it('requires the token received when joining this session', async () => {
    const { code, quiz } = await setup();
    const token = await joined(code);
    expect((await app!.inject({ method: 'GET', url: `/api/play/${code}` })).statusCode).toBe(401);
    expect((await play(code, 'not-a-token', 'GET')).statusCode).toBe(401);
    const other = await createSession(quiz.id);
    expect((await play(other.code, token, 'GET')).statusCode).toBe(401);
    expect((await play(code, token, 'GET')).statusCode).toBe(200);
  });

  it('never tells students which options are correct', async () => {
    const { code } = await setup();
    const token = await joined(code);
    const started = await start(code, token);
    expect(started.status).toBe('in_progress');
    expect(started.questions).toHaveLength(3);
    expect(JSON.stringify(started)).not.toContain('correct');
  });

  it("keeps each student's shuffled order across requests", async () => {
    const { code, quiz } = await setup();
    const token = await joined(code);
    const first = await start(code, token);
    expect((await state(code, token)).questions).toEqual(first.questions);
    expect(first.questions.map((q) => q.id).sort()).toEqual(quiz.questions.map((q) => q.id).sort());
    for (const question of first.questions) {
      const original = quiz.questions.find((q) => q.id === question.id)!;
      expect(question.options.map((o) => o.id).sort()).toEqual(original.options.map((o) => o.id).sort());
    }
  });

  it('scores all-or-nothing and leaves polls unscored', async () => {
    const { code, quiz } = await setup();
    const [single, poll, multiple] = quiz.questions;
    const token = await joined(code);
    await start(code, token);
    expect((await answer(code, token, single!.id, ['b'])).statusCode).toBe(200);
    expect((await answer(code, token, poll!.id, ['x', 'y'])).statusCode).toBe(200);
    // Only one of the two correct options: counts as wrong.
    expect((await answer(code, token, multiple!.id, ['e2'])).statusCode).toBe(200);
    const finished: PlayState = (await play(code, token, 'POST', '/submit')).json();
    expect(finished).toMatchObject({ status: 'finished', endReason: 'submitted', score: { correct: 1, total: 2 } });
  });

  it('lets students change or clear answers until they submit', async () => {
    const { code, quiz } = await setup();
    const [single, poll] = quiz.questions;
    const token = await joined(code);
    await start(code, token);
    await answer(code, token, single!.id, ['a']);
    await answer(code, token, single!.id, ['b']);
    await answer(code, token, poll!.id, ['x']);
    await answer(code, token, poll!.id, []);
    expect((await state(code, token)).answers).toEqual({ [single!.id]: ['b'] });

    await play(code, token, 'POST', '/submit');
    expect((await answer(code, token, single!.id, ['a'])).json()).toEqual({ error: 'finished' });
  });

  it('rejects answers that do not fit the question', async () => {
    const { code, quiz } = await setup();
    const single = quiz.questions[0]!;
    const token = await joined(code);
    expect((await answer(code, token, single.id, ['b'])).json()).toEqual({ error: 'not_started' });
    await start(code, token);
    expect((await answer(code, token, single.id, ['a', 'b'])).json()).toEqual({ error: 'invalid_answer' });
    expect((await answer(code, token, single.id, ['zzz'])).json()).toEqual({ error: 'invalid_answer' });
    expect((await answer(code, token, 'no-such-question', ['a'])).statusCode).toBe(404);
  });

  it('hides the score when the session says so', async () => {
    const { code } = await setup({ showScore: false });
    const token = await joined(code);
    await start(code, token);
    const finished: PlayState = (await play(code, token, 'POST', '/submit')).json();
    expect(finished.status).toBe('finished');
    expect(finished.score).toBeNull();
  });
});

describe('timers and closing', () => {
  it('ends the attempt when the total time runs out', async () => {
    freezeTime();
    const { code, quiz } = await setup({ timerMode: 'total', totalMinutes: 1 });
    const single = quiz.questions[0]!;
    const token = await joined(code);
    const started = await start(code, token);
    expect(started.deadline).toBe(clock + 60_000);

    advance(60_000 + GRACE_MS); // late, but within the allowance for network delay
    expect((await answer(code, token, single.id, ['b'])).statusCode).toBe(200);
    advance(1);
    expect((await answer(code, token, single.id, ['a'])).json()).toEqual({ error: 'finished' });
    expect(await state(code, token)).toMatchObject({
      status: 'finished',
      endReason: 'time',
      score: { correct: 1, total: 2 },
    });
  });

  it('with a timer per question, shows one question at a time', async () => {
    freezeTime();
    const { code, quiz } = await setup({ timerMode: 'perQuestion' });
    const token = await joined(code);
    const started = await start(code, token);
    expect(started.questions).toHaveLength(1);
    expect(started.deadline).toBe(clock + 30_000);
    const first = started.questions[0]!;

    const other = quiz.questions.find((q) => q.id !== first.id)!;
    expect((await answer(code, token, other.id, [])).json()).toEqual({ error: 'not_current' });

    advance(5_000);
    const second: PlayState = (await play(code, token, 'POST', '/next', { from: 0 })).json();
    expect(second.index).toBe(1);
    expect(second.deadline).toBe(clock + 30_000);
    expect(second.questions[0]!.id).not.toBe(first.id);

    // A repeated request (e.g. a retry after a network error) must not skip a question.
    expect(((await play(code, token, 'POST', '/next', { from: 0 })).json() as PlayState).index).toBe(1);

    // When a question's time runs out, the next one starts with its full time.
    advance(30_000 + GRACE_MS + 1);
    const third = await state(code, token);
    expect(third.index).toBe(2);
    expect(third.deadline).toBe(clock + 30_000);

    const done: PlayState = (await play(code, token, 'POST', '/next', { from: 2 })).json();
    expect(done).toMatchObject({ status: 'finished', endReason: 'submitted' });
  });

  it('with a timer per question, running out of time on the last question counts as timing out', async () => {
    freezeTime();
    const { code } = await setup({ timerMode: 'perQuestion' });
    const token = await joined(code);
    await start(code, token);
    await play(code, token, 'POST', '/next', { from: 0 });
    await play(code, token, 'POST', '/next', { from: 1 });
    advance(30_000); // the phone's countdown reached zero and it asks for the next screen
    const done: PlayState = (await play(code, token, 'POST', '/next', { from: 2 })).json();
    expect(done).toMatchObject({ status: 'finished', endReason: 'time' });
  });

  it('ends attempts when the closing time passes', async () => {
    freezeTime();
    const { code } = await setup({ closesAt: new Date(clock + 600_000).toISOString() });
    const token = await joined(code);
    expect((await start(code, token)).deadline).toBe(clock + 600_000);
    advance(600_000);
    expect(await state(code, token)).toMatchObject({ status: 'finished', endReason: 'closed' });
  });

  it('ends attempts in progress when the presenter closes the session', async () => {
    const { code, session } = await setup();
    const token = await joined(code);
    await start(code, token);
    const close = (closed: boolean) =>
      app!.inject({ method: 'PATCH', url: `/api/admin/sessions/${session.id}`, cookies, payload: { closed } });

    expect((await close(true)).json()).toMatchObject({ state: 'closed', closedManually: true, submittedCount: 1 });
    expect(await state(code, token)).toMatchObject({ status: 'finished', endReason: 'closed' });
    expect((await join(code, 'Bia')).json()).toEqual({ error: 'closed' });

    expect((await close(false)).json()).toMatchObject({ state: 'open', closedManually: false });
    expect((await join(code, 'Bia')).statusCode).toBe(201);
  });
});
