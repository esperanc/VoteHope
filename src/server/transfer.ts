// Quiz files: a zip with quiz.json plus the images it uses (media/<file>), or a bare
// quiz.json. They carry backups and move quizzes between installations, and they are
// also how quizzes written by hand or by a script come in — so the import fills in
// whatever has an obvious default, and says precisely what is wrong when it refuses.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { makeId, type QuizContent } from '../shared/quiz.ts';
import type { ImportProblem, ProblemPath } from '../shared/transfer.ts';
import { MAX_IMAGE_BYTES, MEDIA_URL, UnsupportedImageError, type ImageStore } from './images.ts';
import { ImportedQuizSchema, type ImportedQuiz } from './schemas.ts';

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const MAX_PROBLEMS = 200;

/** An image in the zip's media folder, under whatever plain name its author gave it. */
const IMAGE_NAME = String.raw`[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|gif|webp|svg|avif)`;
const MEDIA_ENTRY = new RegExp(`^${IMAGE_NAME}$`, 'i');
/** An image in the text: ](media/x.png), ](./media/x.png) or ](/media/x.png). */
const IMAGE_REF = new RegExp(String.raw`(\]\(\s*)(?:\.?/)?media/(${IMAGE_NAME})`, 'gi');

/**
 * What a LaTeX command written with one backslash turns into: JSON reads \t, \f, \b,
 * \r and \n as escapes, so "\theta" arrives as a tab followed by "heta". Form feeds
 * and backspaces never belong in quiz text; tabs and carriage returns count when a
 * letter follows (\times, \rho); line breaks only before a few commands that could
 * not begin a line of ordinary text (\neq, \nabla, \nu, \not).
 */
const LOST_BACKSLASH = /([\f\b]|[\t\r](?=[A-Za-z]))([A-Za-z]*)|\n(eq|abla|u|ot)(?![A-Za-z])/;
const ESCAPE_LETTER: Record<string, string> = { '\t': 't', '\f': 'f', '\b': 'b', '\r': 'r' };

export class ImportError extends Error {
  readonly problems: ImportProblem[];

  constructor(problems: ImportProblem[]) {
    super('The quiz file has problems');
    this.problems = problems.slice(0, MAX_PROBLEMS);
  }
}

export function exportQuiz(content: QuizContent, mediaDir: string): Uint8Array {
  const file = { format: 'votehope-quiz', version: 1, quiz: content };
  const files: Zippable = { 'quiz.json': strToU8(JSON.stringify(file, null, 2)) };
  for (const name of referencedMedia(content)) {
    const source = path.join(mediaDir, name);
    // Images are already compressed; storing them avoids wasted effort.
    if (existsSync(source)) files[`media/${name}`] = [readFileSync(source), { level: 0 }];
  }
  return zipSync(files, { level: 6 });
}

/**
 * Reads a quiz file and stores its images as new uploads, pointing the text at them.
 * Throws ImportError listing everything wrong with the file.
 */
export async function importQuiz(file: Uint8Array, images: ImageStore): Promise<QuizContent> {
  const { json, media } = readArchive(file);
  const content = normalize(parseQuiz(json));

  // What can be checked without storing anything comes first, so that a file with
  // mistakes leaves no images behind.
  const problems: ImportProblem[] = [];
  const names = referencedImages(content);
  for (const name of names) {
    if (!media.has(name) && !images.has(name)) problems.push({ code: 'missing_image', name });
  }
  if (problems.length > 0) throw new ImportError(problems);

  const urls = new Map<string, string>();
  for (const name of names) {
    const data = media.get(name);
    try {
      // Not in the zip means it is already on this server (checked above).
      urls.set(name, data ? (await images.save(Buffer.from(data))).url : `/media/${name}`);
    } catch (err) {
      if (!(err instanceof UnsupportedImageError)) throw err;
      problems.push({ code: 'bad_image', name });
    }
  }
  // Images stored before a bad one turned up are swept later, like any unused upload.
  if (problems.length > 0) throw new ImportError(problems);

  return mapMarkdown(content, (text) =>
    text.replace(IMAGE_REF, (match, prefix: string, name: string) => {
      const url = urls.get(name);
      return url ? prefix + url : match;
    }),
  );
}

function readArchive(file: Uint8Array): { json: string; media: Map<string, Uint8Array> } {
  const isZip = file[0] === 0x50 && file[1] === 0x4b; // "PK"
  if (!isZip) return { json: strFromU8(file), media: new Map() };

  // A first pass reads only the names: quiz.json may be at the top, or inside the one
  // folder that compressing a folder in Finder or Explorer produces.
  const names: string[] = [];
  try {
    unzipSync(file, {
      filter(entry) {
        names.push(entry.name);
        return false;
      },
    });
  } catch {
    throw new ImportError([{ code: 'bad_zip' }]);
  }
  const quizJson = names.find((name) => !name.startsWith('__MACOSX/') && /^(?:[^/]+\/)?quiz\.json$/.test(name));
  if (!quizJson) throw new ImportError([{ code: 'no_quiz_json' }]);
  const mediaPrefix = `${quizJson.slice(0, -'quiz.json'.length)}media/`;

  const problems: ImportProblem[] = [];
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(file, {
      filter(entry) {
        const isImage = entry.name.startsWith(mediaPrefix) && MEDIA_ENTRY.test(entry.name.slice(mediaPrefix.length));
        if (entry.name !== quizJson && !isImage) return false;
        total += entry.originalSize;
        if ((isImage && entry.originalSize > MAX_IMAGE_BYTES) || total > MAX_IMPORT_BYTES) {
          problems.push({ code: 'too_large', name: entry.name });
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new ImportError([{ code: 'bad_zip' }]);
  }
  if (problems.length > 0) throw new ImportError(problems);

  const media = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (name !== quizJson) media.set(name.slice(mediaPrefix.length), data);
  }
  return { json: strFromU8(entries[quizJson]!), media };
}

function parseQuiz(json: string): ImportedQuiz {
  const text = json.replace(/^﻿/, ''); // a byte-order mark, as some Windows editors write
  if (!text.trimStart().startsWith('{')) throw new ImportError([{ code: 'not_a_quiz' }]);
  let document: Record<string, unknown>;
  try {
    document = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    throw new ImportError([{ code: 'json', message: (err as Error).message }]);
  }

  // Exported files wrap the quiz with a format marker; files written by hand need not.
  let quiz: unknown = document;
  if ('format' in document) {
    if (document.format !== 'votehope-quiz' || document.version !== 1) {
      throw new ImportError([{ code: 'not_a_quiz' }]);
    }
    quiz = document.quiz;
  }

  // Lost backslashes are looked for in every string of the raw file, so they are
  // reported together with any other mistake rather than only once those are fixed.
  const problems = lostBackslashes(quiz);
  const parsed = ImportedQuizSchema.safeParse(quiz);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key));
      problems.push({ code: 'field', path, message: issue.message });
    }
  }
  if (!parsed.success || problems.length > 0) throw new ImportError(problems);
  return parsed.data;
}

/** Fills in what a file may leave out: ids, and whether students pick one option or more. */
function normalize(quiz: ImportedQuiz): QuizContent {
  // Windows line endings would otherwise look like lost backslashes.
  const text = (value: string) => value.replace(/\r\n/g, '\n');
  const questionIds = new Set(quiz.questions.flatMap((question) => (question.id ? [question.id] : [])));
  return {
    title: text(quiz.title),
    description: text(quiz.description),
    defaultTimeLimitS: quiz.defaultTimeLimitS,
    questions: quiz.questions.map((question) => {
      const optionIds = new Set(question.options.flatMap((option) => (option.id ? [option.id] : [])));
      const correct = question.options.filter((option) => option.correct).length;
      return {
        id: question.id ?? unusedId(questionIds),
        kind: question.kind,
        selection: question.selection ?? (correct > 1 ? 'multiple' : 'single'),
        body: text(question.body),
        timeLimitS: question.timeLimitS,
        options: question.options.map((option) => ({
          id: option.id ?? unusedId(optionIds),
          body: text(option.body),
          correct: option.correct,
        })),
      };
    }),
  };
}

function unusedId(taken: Set<string>): string {
  let id = makeId();
  while (taken.has(id)) id = makeId();
  taken.add(id);
  return id;
}

/** Strings anywhere in the file in which JSON swallowed a LaTeX command's backslash. */
function lostBackslashes(value: unknown, path: ProblemPath = [], problems: ImportProblem[] = []): ImportProblem[] {
  if (typeof value === 'string') {
    const match = LOST_BACKSLASH.exec(value);
    if (match) {
      const command = match[1] ? `\\${ESCAPE_LETTER[match[1]] ?? ''}${match[2]}` : `\\n${match[3]}`;
      problems.push({ code: 'escape', path, command });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => lostBackslashes(item, [...path, index], problems));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) lostBackslashes(item, [...path, key], problems);
  }
  return problems;
}

function markdownFields(content: QuizContent): string[] {
  return [
    content.description,
    ...content.questions.flatMap((question) => [question.body, ...question.options.map((option) => option.body)]),
  ];
}

/** Images a quiz file shows, by the name they have in its media folder. */
function referencedImages(content: QuizContent): Set<string> {
  const names = new Set<string>();
  for (const text of markdownFields(content)) {
    for (const match of text.matchAll(IMAGE_REF)) names.add(match[2]!);
  }
  return names;
}

/** Stored images a quiz shows, for exporting. */
function referencedMedia(content: QuizContent): Set<string> {
  const names = new Set<string>();
  for (const text of markdownFields(content)) {
    for (const match of text.matchAll(MEDIA_URL)) names.add(match[1]!);
  }
  return names;
}

function mapMarkdown(content: QuizContent, map: (text: string) => string): QuizContent {
  return {
    ...content,
    description: map(content.description),
    questions: content.questions.map((question) => ({
      ...question,
      body: map(question.body),
      options: question.options.map((option) => ({ ...option, body: map(option.body) })),
    })),
  };
}
