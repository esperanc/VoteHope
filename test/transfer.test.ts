import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../src/server/config.ts';
import { countIncompleteQuestions, type Quiz } from '../src/shared/quiz.ts';
import type { ImportProblem } from '../src/shared/transfer.ts';
import { adminCookies, makeApp, multipartFile, sampleQuiz } from './helpers.ts';

let app: FastifyInstance;
let config: Config;
let cookies: Record<string, string>;

beforeEach(async () => {
  ({ app, config } = await makeApp());
  cookies = await adminCookies(app);
});

afterEach(() => app.close());

function png(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: '#123456' } }).png().toBuffer();
}

async function uploadImage(): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/admin/images', cookies, ...multipartFile('a.png', await png()) });
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

async function imported(name: string, data: Uint8Array): Promise<Quiz> {
  const response = await importFile(name, data);
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

async function problemsOf(name: string, data: Uint8Array): Promise<ImportProblem[]> {
  const response = await importFile(name, data);
  expect(response.statusCode).toBe(400);
  expect(response.json().error).toBe('invalid_file');
  return response.json().problems;
}

const json = (value: unknown) => strToU8(JSON.stringify(value));
const storedImages = () => readdirSync(config.mediaDir).length;

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

    const copy = await imported('quiz.zip', exported.rawPayload);
    expect(copy.id).not.toBe(quiz.id);
    expect(copy.title).toBe('Cálculo I');

    const newUrl = copy.questions[0]!.body.match(/\/media\/[\w-]+\.webp/)![0];
    expect(newUrl).not.toBe(imageUrl);
    expect(copy.questions[0]!.options[0]!.body).toBe(`![small](${newUrl})`);
    expect((await app.inject({ method: 'GET', url: newUrl })).statusCode).toBe(200);

    // Everything except the image addresses is unchanged.
    const strip = (q: Quiz) => JSON.stringify(q.questions).replaceAll(/\/media\/[\w-]+\.webp/g, 'IMG');
    expect(strip(copy)).toBe(strip(quiz));
  });

  it('imports a bare quiz.json', async () => {
    const quiz = sampleQuiz();
    const copy = await imported('quiz.json', json({ format: 'votehope-quiz', version: 1, quiz }));
    expect(copy.questions).toEqual(quiz.questions);
  });

  it('refuses files that are not quizzes, saying why', async () => {
    const cases: [Uint8Array, ImportProblem['code']][] = [
      [strToU8('not a quiz'), 'not_a_quiz'],
      [strToU8('[1, 2]'), 'not_a_quiz'],
      [json({ format: 'something-else', version: 1, quiz: sampleQuiz() }), 'not_a_quiz'],
      [zipSync({ 'readme.txt': strToU8('hello') }), 'no_quiz_file'],
      [zipSync({ 'a.md': strToU8('# A'), 'b.md': strToU8('# B') }), 'no_quiz_file'], // which one?
      [zipSync({ 'quiz.json': strToU8('{ broken') }), 'json'],
      [new Uint8Array([0x50, 0x4b, 1, 2, 3]), 'bad_zip'],
    ];
    for (const [data, code] of cases) {
      expect((await problemsOf('file.zip', data)).map((problem) => problem.code)).toEqual([code]);
    }
  });
});

describe('quizzes written by hand', () => {
  it('fills in everything that has an obvious default', async () => {
    const quiz = await imported(
      'quiz.json',
      json({
        title: 'Derivadas',
        questions: [
          { body: 'Derivada de $x^2$?', options: [{ body: '$x$' }, { body: '$2x$', correct: true }] },
          { body: 'Contínuas?', options: [{ body: 'a', correct: true }, { body: 'b', correct: true }, { body: 'c' }] },
          { kind: 'poll', body: 'Gostou?', timeLimitS: 20, options: [{ body: 'Sim' }, { body: 'Não' }] },
        ],
      }),
    );
    expect(quiz).toMatchObject({ title: 'Derivadas', description: '', defaultTimeLimitS: 30 });
    const [first, second, poll] = quiz.questions;
    expect(first).toMatchObject({ kind: 'quiz', selection: 'single', timeLimitS: null });
    expect(first!.options.map((option) => option.correct)).toEqual([false, true]);
    expect(second!.selection).toBe('multiple'); // two correct options
    expect(poll).toMatchObject({ kind: 'poll', selection: 'single', timeLimitS: 20 });

    expect(new Set(quiz.questions.map((question) => question.id)).size).toBe(3);
    for (const question of quiz.questions) {
      expect(new Set(question.options.map((option) => option.id)).size).toBe(question.options.length);
    }
    expect(countIncompleteQuestions(quiz)).toBe(0);
  });

  it('keeps the ids a file gives, and refuses repeated ones', async () => {
    const options = [{ body: 'a', correct: true }, { body: 'b' }];
    const quiz = await imported('quiz.json', json({ title: 't', questions: [{ id: 'q1', body: 'x', options }, { body: 'y', options }] }));
    expect(quiz.questions[0]!.id).toBe('q1');
    expect(quiz.questions[1]!.id).not.toBe('q1');

    const problems = await problemsOf('quiz.json', json({ title: 't', questions: [{ id: 'q', body: 'x', options }, { id: 'q', body: 'y', options }] }));
    expect(problems).toEqual([expect.objectContaining({ code: 'field', path: ['questions'] })]);
  });

  it('says where each mistake is, all of them at once', async () => {
    const problems = await problemsOf(
      'quiz.json',
      json({
        title: 'x',
        questions: [
          // '\t' is a tab: what JSON makes of \theta typed with one backslash.
          { body: 'ok $\theta$', options: [{ body: 'a' }, { body: 'b', correct: 'yes' }] },
          { kind: 'pol', options: [] },
        ],
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        { code: 'escape', path: ['questions', 0, 'body'], command: '\\theta' },
        expect.objectContaining({ code: 'field', path: ['questions', 0, 'options', 1, 'correct'] }),
        expect.objectContaining({ code: 'field', path: ['questions', 1, 'kind'] }),
        expect.objectContaining({ code: 'field', path: ['questions', 1, 'body'] }),
      ]),
    );
  });

  it('gives the line and column of JSON mistakes', async () => {
    const [problem] = await problemsOf('quiz.json', strToU8('{\n  "title": "x"\n  "questions": []\n}'));
    expect(problem).toEqual({ code: 'json', message: expect.stringContaining('line 3 column 3') });
  });

  it('catches LaTeX commands whose single backslash JSON read as an escape', async () => {
    // As typed in a text editor: one backslash each. JSON turns \t, \f and \n into
    // control characters without complaint, so these would show up broken.
    const file = String.raw`{"title": "t", "questions": [{"body": "$\theta$ e $\frac{1}{2}$",
      "options": [{"body": "$a \times b$", "correct": true}, {"body": "$\nabla f$"}]}]}`;
    expect(await problemsOf('quiz.json', strToU8(file))).toEqual([
      { code: 'escape', path: ['questions', 0, 'body'], command: '\\theta' },
      { code: 'escape', path: ['questions', 0, 'options', 0, 'body'], command: '\\times' },
      { code: 'escape', path: ['questions', 0, 'options', 1, 'body'], command: '\\nabla' },
    ]);

    // Doubled backslashes are right, and ordinary line breaks (also Windows ones) are fine.
    const fixed = String.raw`{"title": "t", "questions": [{"body": "$\\theta$ e $\\frac{1}{2}$\nnova linha\r\nfim",
      "options": [{"body": "$a \\times b$", "correct": true}, {"body": "$\\nabla f$"}]}]}`;
    const quiz = await imported('quiz.json', strToU8(fixed));
    expect(quiz.questions[0]!.body).toBe('$\\theta$ e $\\frac{1}{2}$\nnova linha\nfim');
  });

  it('takes images by their own names, from a folder compressed in Finder', async () => {
    const image = await png();
    const zip = zipSync({
      'Meu quiz/quiz.json': json({
        title: 'Com imagem',
        questions: [
          {
            body: 'Veja:\n\n![gráfico](media/grafico.png)',
            options: [{ body: '![a](./media/a-1.PNG)', correct: true }, { body: '![b](/media/grafico.png)' }],
          },
        ],
      }),
      'Meu quiz/media/grafico.png': image,
      'Meu quiz/media/a-1.PNG': image,
      'Meu quiz/media/unused.png': image,
      '__MACOSX/Meu quiz/._quiz.json': strToU8('Finder metadata'),
    });
    const before = storedImages();
    const [question] = (await imported('Meu quiz.zip', zip)).questions;

    const url = question!.body.match(/\/media\/[\w-]{16}\.webp/)![0];
    expect(question!.body).toBe(`Veja:\n\n![gráfico](${url})`);
    expect(question!.options[1]!.body).toBe(`![b](${url})`);
    expect(question!.options[0]!.body).toMatch(/^!\[a\]\(\/media\/[\w-]{16}\.webp\)$/);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    expect(storedImages()).toBe(before + 2); // the unused one is left out
  });

  it('names the images it cannot find, and stores none of the others', async () => {
    const zip = zipSync({
      'quiz.json': json({
        title: 't',
        questions: [{ body: '![x](media/here.png) ![y](media/missing.png)', options: [{ body: 'a' }, { body: 'b' }] }],
      }),
      'media/here.png': await png(),
    });
    const before = storedImages();
    expect(await problemsOf('quiz.zip', zip)).toEqual([{ code: 'missing_image', name: 'missing.png' }]);
    expect(storedImages()).toBe(before);
  });

  it('refuses images it cannot read', async () => {
    const zip = zipSync({
      'quiz.json': json({ title: 't', questions: [{ body: '![x](media/fake.png)', options: [{ body: 'a' }, { body: 'b' }] }] }),
      'media/fake.png': strToU8('not really a picture'),
    });
    expect(await problemsOf('quiz.zip', zip)).toEqual([{ code: 'bad_image', name: 'fake.png' }]);
  });

  it('keeps pointing at images already stored on this server', async () => {
    const url = await uploadImage();
    const name = url.split('/').pop()!;
    const quiz = await imported(
      'quiz.json',
      json({ title: 't', questions: [{ body: `![x](${url}) ![y](media/${name})`, options: [{ body: 'a' }, { body: 'b' }] }] }),
    );
    expect(quiz.questions[0]!.body).toBe(`![x](${url}) ![y](${url})`);
  });
});

describe('quizzes written in Markdown', () => {
  const derivatives = [
    '# Derivadas {tempo=45}',
    '',
    '## Qual é a derivada de $x^2$?',
    '',
    '- [ ] $x$',
    '- [x] $2x$',
    '- [ ] $\\frac{x^3}{3}$',
    '',
    '## Quão seguro você se sente? {tempo=20}',
    '',
    '- Muito',
    '- Ainda não',
  ].join('\n');

  it('imports a Markdown file uploaded on its own, formulas untouched', async () => {
    const quiz = await imported('derivadas.md', strToU8(derivatives));
    expect(quiz).toMatchObject({ title: 'Derivadas', defaultTimeLimitS: 45 });
    const [question, poll] = quiz.questions;
    expect(question).toMatchObject({ kind: 'quiz', selection: 'single', timeLimitS: null });
    expect(question!.options.map((option) => [option.body, option.correct])).toEqual([
      ['$x$', false],
      ['$2x$', true],
      ['$\\frac{x^3}{3}$', false],
    ]);
    expect(poll).toMatchObject({ kind: 'poll', timeLimitS: 20 });
    expect(countIncompleteQuestions(quiz)).toBe(0);
  });

  it('finds the Markdown file in a zip, with its images', async () => {
    const zip = zipSync({
      'Derivadas/derivadas.md': strToU8(derivatives.replace('?\n', '?\n\n![gráfico](media/f.png)\n')),
      'Derivadas/media/f.png': await png(),
    });
    const [question] = (await imported('Derivadas.zip', zip)).questions;
    expect(question!.body).toMatch(/^Qual é a derivada de \$x\^2\$\?\n\n!\[gráfico\]\(\/media\/[\w-]{16}\.webp\)$/);
  });

  it('says on which line each mistake is', async () => {
    const problems = await problemsOf('quiz.md', strToU8('# T\n\n## A {tmpo=20}\n\n- [x] a\n- b\n'));
    expect(problems).toEqual([
      { code: 'md_setting', line: 3, setting: 'tmpo=20' },
      { code: 'md_mixed_options', line: 5 },
    ]);
  });

  it('still applies the limits of the editor', async () => {
    const options = Array.from({ length: 11 }, (_, i) => `- [ ] opção ${i + 1}`).join('\n');
    const problems = await problemsOf('quiz.md', strToU8(`# T\n\n## Demais?\n\n${options}\n`));
    expect(problems).toEqual([expect.objectContaining({ code: 'field', path: ['questions', 0, 'options'] })]);
  });

  it('asks for UTF-8 when the file was saved in another encoding', async () => {
    // As an older Windows Notepad saves it: "ç" and "ã" as single Windows-1252 bytes.
    const latin1 = Buffer.from('# Questões\n\n## Ação?\n\n- [x] sim\n- [ ] não\n', 'latin1');
    expect(await problemsOf('quiz.md', latin1)).toEqual([{ code: 'encoding' }]);
  });
});

describe('quiz file examples in the READMEs', () => {
  for (const file of ['README.md', 'README.pt.md']) {
    it(`${file}: every Markdown and JSON example imports as a quiz ready to run`, async () => {
      const text = readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');
      const examples = [...text.matchAll(/```(markdown|json)\n([\s\S]*?)```/g)];
      expect(examples.map((match) => match[1]).sort()).toEqual(['json', 'markdown']);
      for (const [, format, example] of examples) {
        const quiz = await imported(`quiz.${format === 'json' ? 'json' : 'md'}`, strToU8(example!));
        expect(countIncompleteQuestions(quiz)).toBe(0);
      }
    });
  }
});
