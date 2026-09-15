import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { newQuestion, type Quiz, type QuizContent } from '../src/shared/quiz.ts';
import {
  DEFAULT_ASYNC_SETTINGS,
  type AsyncSettings,
  type SessionDetail,
  type SessionResults,
  type SessionSummary,
} from '../src/shared/session.ts';
import { adminCookies, makeApp, sampleQuiz } from './helpers.ts';

let app: FastifyInstance;
let cookies: Record<string, string>;

beforeEach(async () => {
  ({ app } = await makeApp());
  cookies = await adminCookies(app);
});

afterEach(() => app.close());

function admin(method: InjectOptions['method'], url: string, payload?: object) {
  return app.inject({ method, url: `/api/admin${url}`, cookies, ...(payload ? { payload } : {}) });
}

async function createQuiz(content: QuizContent = sampleQuiz()): Promise<Quiz> {
  return (await admin('POST', '/quizzes', content)).json();
}

function createSession(quizId: number, settings: Partial<AsyncSettings> = {}) {
  return admin('POST', '/sessions', { quizId, mode: 'async', settings: { ...DEFAULT_ASYNC_SETTINGS, ...settings } });
}

async function newSession(quizId: number): Promise<SessionDetail> {
  const response = await createSession(quizId);
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function joinAs(code: string, name: string): Promise<string> {
  return (await app.inject({ method: 'POST', url: `/api/join/${code}`, payload: { name } })).json().token;
}

function play(code: string, token: string, method: InjectOptions['method'], path: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/play/${code}${path}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });
}

describe('sessions API', () => {
  it('requires the admin login', async () => {
    const routes: [InjectOptions['method'], string][] = [
      ['GET', '/api/admin/sessions'],
      ['POST', '/api/admin/sessions'],
      ['GET', '/api/admin/sessions/1'],
      ['PATCH', '/api/admin/sessions/1'],
      ['DELETE', '/api/admin/sessions/1'],
      ['GET', '/api/admin/sessions/1/results'],
      ['GET', '/api/admin/sessions/1/qr.svg'],
      ['DELETE', '/api/admin/sessions/1/participants/1'],
    ];
    for (const [method, url] of routes) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('only runs complete quizzes', async () => {
    const quiz = await createQuiz({ ...sampleQuiz(), questions: [newQuestion()] });
    const response = await createSession(quiz.id);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'quiz_incomplete' });
  });

  it('creates a session with a join code and link', async () => {
    const quiz = await createQuiz();
    const session = await newSession(quiz.id);
    expect(session.code).toMatch(/^\d{6}$/);
    expect(session.joinUrl).toMatch(new RegExp(`^http://localhost(:80)?/j/${session.code}$`));
    expect(session).toMatchObject({
      mode: 'async',
      state: 'open',
      title: 'Sample',
      quizId: quiz.id,
      questionCount: 2,
      participantCount: 0,
      closedManually: false,
    });
  });

  it('uses PUBLIC_URL for join links when it is set', async () => {
    await app.close();
    ({ app } = await makeApp({ PUBLIC_URL: 'https://quiz.example.org/' }));
    cookies = await adminCookies(app);
    const session = await newSession((await createQuiz()).id);
    expect(session.joinUrl).toBe(`https://quiz.example.org/j/${session.code}`);
  });

  it('validates the settings', async () => {
    const quiz = await createQuiz();
    expect((await createSession(quiz.id, { timerMode: 'total', totalMinutes: null })).statusCode).toBe(400);
    expect((await createSession(quiz.id, { timerMode: 'total', totalMinutes: 0 })).statusCode).toBe(400);
    const late = { opensAt: '2026-10-02T12:00:00.000Z', closesAt: '2026-10-01T12:00:00.000Z' };
    expect((await createSession(quiz.id, late)).statusCode).toBe(400);
    expect((await createSession(9999)).statusCode).toBe(404);
  });

  it('lists sessions, optionally for one quiz, with participant counts', async () => {
    const quizA = await createQuiz();
    const quizB = await createQuiz();
    const first = await newSession(quizA.id);
    await newSession(quizA.id);
    await newSession(quizB.id);
    await joinAs(first.code, 'Ana');

    const all: SessionSummary[] = (await admin('GET', '/sessions')).json();
    expect(all).toHaveLength(3);
    const forA: SessionSummary[] = (await admin('GET', `/sessions?quizId=${quizA.id}`)).json();
    expect(forA.map((s) => s.quizId)).toEqual([quizA.id, quizA.id]);
    expect(forA.find((s) => s.id === first.id)).toMatchObject({ participantCount: 1, submittedCount: 0 });
  });

  it('keeps its own copy of the quiz when the quiz is edited or deleted', async () => {
    const quiz = await createQuiz();
    const session = await newSession(quiz.id);
    await admin('PUT', `/quizzes/${quiz.id}`, { revision: 1, content: { ...sampleQuiz(), title: 'Changed' } });
    await admin('DELETE', `/quizzes/${quiz.id}`);
    const detail: SessionDetail = (await admin('GET', `/sessions/${session.id}`)).json();
    expect(detail).toMatchObject({ title: 'Sample', quizId: null, questionCount: 2 });
  });

  it('serves a QR code of the join link', async () => {
    const session = await newSession((await createQuiz()).id);
    const response = await admin('GET', `/sessions/${session.id}/qr.svg`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/svg+xml');
    expect(response.body).toContain('<svg');
  });

  it('reports results per participant', async () => {
    const quiz = await createQuiz();
    const [single, poll] = quiz.questions;
    const session = await newSession(quiz.id);
    const ana = await joinAs(session.code, 'Ana');
    await joinAs(session.code, 'Bia');
    await play(session.code, ana, 'POST', '/start');
    await play(session.code, ana, 'PUT', `/answers/${single!.id}`, { optionIds: ['b'] });
    await play(session.code, ana, 'PUT', `/answers/${poll!.id}`, { optionIds: ['y'] });
    await play(session.code, ana, 'POST', '/submit');

    const results: SessionResults = (await admin('GET', `/sessions/${session.id}/results`)).json();
    expect(results.session).toMatchObject({ participantCount: 2, submittedCount: 1 });
    expect(results.questions).toEqual(quiz.questions);
    expect(results.participants).toMatchObject([
      {
        name: 'Ana',
        status: 'finished',
        endReason: 'submitted',
        correct: 1,
        answered: 2,
        answers: {
          [single!.id]: { optionIds: ['b'], correct: true },
          [poll!.id]: { optionIds: ['y'], correct: null },
        },
      },
      { name: 'Bia', status: 'ready', correct: 0, answered: 0, answers: {} },
    ]);
  });

  it('deletes an attempt, which frees the name', async () => {
    const session = await newSession((await createQuiz()).id);
    await joinAs(session.code, 'Ana');
    const results: SessionResults = (await admin('GET', `/sessions/${session.id}/results`)).json();
    const ana = results.participants[0]!;
    expect((await admin('DELETE', `/sessions/${session.id}/participants/${ana.id}`)).statusCode).toBe(204);
    expect((await admin('DELETE', `/sessions/${session.id}/participants/${ana.id}`)).statusCode).toBe(404);
    expect(await joinAs(session.code, 'Ana')).toEqual(expect.any(String));
  });

  it('updates the dates and score visibility', async () => {
    const session = await newSession((await createQuiz()).id);
    const closesAt = '2099-01-01T00:00:00.000Z';
    const updated: SessionDetail = (await admin('PATCH', `/sessions/${session.id}`, { closesAt, showScore: false })).json();
    expect(updated.settings).toMatchObject({ closesAt, showScore: false, timerMode: 'none' });
    const invalid = await admin('PATCH', `/sessions/${session.id}`, { opensAt: '2099-06-01T00:00:00.000Z' });
    expect(invalid.statusCode).toBe(400);
  });

  it('deletes a session', async () => {
    const session = await newSession((await createQuiz()).id);
    expect((await admin('DELETE', `/sessions/${session.id}`)).statusCode).toBe(204);
    expect((await admin('GET', `/sessions/${session.id}`)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/join/${session.code}` })).statusCode).toBe(404);
  });
});
