import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Quiz } from '../src/shared/quiz.ts';
import { adminCookies, makeApp, multipartFile, sampleQuiz } from './helpers.ts';

let app: FastifyInstance;
let cookies: Record<string, string>;

beforeEach(async () => {
  ({ app } = await makeApp());
  cookies = await adminCookies(app);
});

afterEach(() => app.close());

async function uploadImage(): Promise<string> {
  const data = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#123456' } }).png().toBuffer();
  const response = await app.inject({ method: 'POST', url: '/api/admin/images', cookies, ...multipartFile('a.png', data) });
  return response.json().url;
}

async function createQuizWithImage(): Promise<{ quiz: Quiz; imageUrl: string }> {
  const imageUrl = await uploadImage();
  const content = sampleQuiz();
  content.title = 'Cálculo I';
  content.questions[0]!.body = `Look at this:\n\n![graph](${imageUrl})`;
  content.questions[0]!.options[0]!.body = `![small](${imageUrl})`;
  const quiz: Quiz = (await app.inject({ method: 'POST', url: '/api/admin/quizzes', cookies, payload: content })).json();
  return { quiz, imageUrl };
}

function importFile(name: string, data: Uint8Array) {
  return app.inject({ method: 'POST', url: '/api/admin/quizzes/import', cookies, ...multipartFile(name, data) });
}

describe('quiz export and import', () => {
  it('exports a zip with the quiz and the images it uses', async () => {
    const { quiz, imageUrl } = await createQuizWithImage();
    const response = await app.inject({ method: 'GET', url: `/api/admin/quizzes/${quiz.id}/export`, cookies });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Calculo I.zip"; filename*=UTF-8''C%C3%A1lculo%20I.zip`,
    );

    const files = unzipSync(new Uint8Array(response.rawPayload));
    expect(Object.keys(files).sort()).toEqual(['media/' + imageUrl.split('/').pop(), 'quiz.json']);
    const document = JSON.parse(strFromU8(files['quiz.json']!));
    expect(document).toMatchObject({ format: 'votehope-quiz', version: 1, quiz: { title: 'Cálculo I' } });
  });

  it('imports an exported quiz as a new quiz with its own copy of the images', async () => {
    const { quiz, imageUrl } = await createQuizWithImage();
    const exported = await app.inject({ method: 'GET', url: `/api/admin/quizzes/${quiz.id}/export`, cookies });

    const response = await importFile('quiz.zip', exported.rawPayload);
    expect(response.statusCode).toBe(201);
    const imported: Quiz = response.json();
    expect(imported.id).not.toBe(quiz.id);
    expect(imported.title).toBe('Cálculo I');

    const newUrl = imported.questions[0]!.body.match(/\/media\/[\w-]+\.webp/)![0];
    expect(newUrl).not.toBe(imageUrl);
    expect(imported.questions[0]!.options[0]!.body).toBe(`![small](${newUrl})`);
    expect((await app.inject({ method: 'GET', url: newUrl })).statusCode).toBe(200);

    // Everything except the image addresses is unchanged.
    const strip = (q: Quiz) => JSON.stringify(q.questions).replaceAll(/\/media\/[\w-]+\.webp/g, 'IMG');
    expect(strip(imported)).toBe(strip(quiz));
  });

  it('imports a bare quiz.json', async () => {
    const quiz = sampleQuiz();
    const json = strToU8(JSON.stringify({ format: 'votehope-quiz', version: 1, quiz }));
    const response = await importFile('quiz.json', json);
    expect(response.statusCode).toBe(201);
    expect(response.json().questions).toEqual(quiz.questions);
  });

  it('rejects files that are not VoteHope quizzes', async () => {
    const cases = [
      strToU8('not a quiz'),
      strToU8(JSON.stringify({ format: 'something-else', version: 1, quiz: sampleQuiz() })),
      zipSync({ 'readme.txt': strToU8('hello') }),
      zipSync({ 'quiz.json': strToU8('{ broken') }),
      new Uint8Array([0x50, 0x4b, 1, 2, 3]),
    ];
    for (const data of cases) {
      const response = await importFile('file.zip', data);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_file' });
    }
  });
});
