import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.ts';
import { ADMIN_COOKIE } from '../src/server/auth.ts';
import { loadConfig } from '../src/server/config.ts';
import { openDatabase } from '../src/server/db.ts';
import { newQuestion, type QuizContent } from '../src/shared/quiz.ts';

export const TEST_PASSWORD = 'correct horse battery staple';

export function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'votehope-test-'));
}

export async function makeApp(env: Record<string, string> = {}) {
  const config = loadConfig({ ADMIN_PASSWORD: TEST_PASSWORD, DATA_DIR: tempDir(), ...env });
  const db = openDatabase(':memory:');
  const app = await buildApp(config, db);
  return { app, db, config };
}

/** Logs in and returns the cookies to pass to app.inject. */
export async function adminCookies(app: FastifyInstance): Promise<Record<string, string>> {
  const response = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: TEST_PASSWORD } });
  const cookie = response.cookies.find((c) => c.name === ADMIN_COOKIE);
  if (!cookie) throw new Error('login failed');
  return { [ADMIN_COOKIE]: cookie.value };
}

/** Builds a multipart/form-data body with one file field, for app.inject. */
export function multipartFile(filename: string, data: Buffer | Uint8Array, contentType = 'application/octet-stream') {
  const boundary = `----votehope${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** A complete quiz with one quiz question and one poll. */
export function sampleQuiz(): QuizContent {
  const question = newQuestion();
  question.body = 'What is $2 + 2$?';
  question.options = [
    { id: 'a', body: '3', correct: false },
    { id: 'b', body: '4', correct: true },
  ];
  const poll = newQuestion();
  poll.kind = 'poll';
  poll.selection = 'multiple';
  poll.body = 'Which topics did you enjoy?';
  poll.options = [
    { id: 'x', body: 'Algebra', correct: false },
    { id: 'y', body: 'Geometry', correct: false },
  ];
  return { title: 'Sample', description: '', defaultTimeLimitS: 30, questions: [question, poll] };
}
