import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { newQuestion, type Quiz, type QuizSummary } from '../src/shared/quiz.ts';
import { adminCookies, makeApp, sampleQuiz } from './helpers.ts';

let app: FastifyInstance;
let cookies: Record<string, string>;

beforeEach(async () => {
  ({ app } = await makeApp());
  cookies = await adminCookies(app);
});

afterEach(() => app.close());

function request(method: InjectOptions['method'], url: string, payload?: unknown) {
  return app.inject({ method, url, cookies, ...(payload === undefined ? {} : { payload: payload as object }) });
}

async function createQuiz(content = sampleQuiz()): Promise<Quiz> {
  const response = await request('POST', '/api/admin/quizzes', content);
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe('quiz authoring API', () => {
  it('requires the admin login', async () => {
    const routes: [InjectOptions['method'], string][] = [
      ['GET', '/api/admin/quizzes'],
      ['POST', '/api/admin/quizzes'],
      ['GET', '/api/admin/quizzes/1'],
      ['PUT', '/api/admin/quizzes/1'],
      ['DELETE', '/api/admin/quizzes/1'],
      ['POST', '/api/admin/quizzes/1/duplicate'],
      ['GET', '/api/admin/quizzes/1/export'],
      ['POST', '/api/admin/quizzes/import'],
      ['POST', '/api/admin/images'],
    ];
    for (const [method, url] of routes) {
      const response = await app.inject({ method, url });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('creates, reads, lists and deletes a quiz', async () => {
    const content = sampleQuiz();
    const created = await createQuiz(content);
    expect(created).toMatchObject({ id: expect.any(Number), revision: 1, ...content });

    const fetched = await request('GET', `/api/admin/quizzes/${created.id}`);
    expect(fetched.json()).toEqual(created);

    const list: QuizSummary[] = (await request('GET', '/api/admin/quizzes')).json();
    expect(list).toEqual([
      { id: created.id, title: 'Sample', questionCount: 2, incompleteCount: 0, updatedAt: created.updatedAt },
    ]);

    expect((await request('DELETE', `/api/admin/quizzes/${created.id}`)).statusCode).toBe(204);
    expect((await request('GET', `/api/admin/quizzes/${created.id}`)).statusCode).toBe(404);
    expect((await request('DELETE', `/api/admin/quizzes/${created.id}`)).statusCode).toBe(404);
  });

  it('saves with the current revision and rejects stale ones', async () => {
    const quiz = await createQuiz();
    const content = { ...sampleQuiz(), title: 'Renamed' };

    const saved = await request('PUT', `/api/admin/quizzes/${quiz.id}`, { revision: 1, content });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBe(2);

    const stale = await request('PUT', `/api/admin/quizzes/${quiz.id}`, { revision: 1, content: sampleQuiz() });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'conflict', revision: 2 });

    const current: Quiz = (await request('GET', `/api/admin/quizzes/${quiz.id}`)).json();
    expect(current.title).toBe('Renamed');
    expect(current.revision).toBe(2);
  });

  it('accepts incomplete drafts and reports them in the list', async () => {
    await createQuiz({ title: '', description: '', defaultTimeLimitS: 30, questions: [newQuestion(), newQuestion()] });
    const [summary]: QuizSummary[] = (await request('GET', '/api/admin/quizzes')).json();
    expect(summary).toMatchObject({ title: '', questionCount: 2, incompleteCount: 2 });
  });

  it('rejects structurally invalid quizzes', async () => {
    const base = sampleQuiz();
    const [first] = base.questions;
    const invalid = [
      { ...base, defaultTimeLimitS: 3 },
      { ...base, title: 'x'.repeat(201) },
      { ...base, questions: [{ ...first!, kind: 'essay' }] },
      { ...base, questions: [first, first] },
      {
        ...base,
        questions: [{ ...first!, options: Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, body: 'x', correct: false })) }],
      },
      { ...base, questions: [{ ...first!, options: [{ id: 'bad id!', body: 'x', correct: false }] }] },
    ];
    for (const content of invalid) {
      const response = await request('POST', '/api/admin/quizzes', content);
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('invalid_request');
    }
  });

  it('duplicates a quiz under a new title', async () => {
    const quiz = await createQuiz();
    const response = await request('POST', `/api/admin/quizzes/${quiz.id}/duplicate`, { title: 'Sample (copy)' });
    expect(response.statusCode).toBe(201);
    const copy: Quiz = response.json();
    expect(copy.id).not.toBe(quiz.id);
    expect(copy.title).toBe('Sample (copy)');
    expect(copy.questions).toEqual(quiz.questions);
  });

  it('answers 404 for unknown or malformed ids', async () => {
    for (const url of ['/api/admin/quizzes/999', '/api/admin/quizzes/abc', '/api/admin/quizzes/-1']) {
      expect((await request('GET', url)).statusCode).toBe(404);
    }
  });
});
