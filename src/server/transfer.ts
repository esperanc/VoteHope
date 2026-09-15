// Quiz files: a zip with quiz.json plus the images it uses (media/<file>).
// Used for backups and for moving quizzes between VoteHope installations.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { QuizContent } from '../shared/quiz.ts';
import { MAX_IMAGE_BYTES, MEDIA_FILE, UnsupportedImageError, type ImageStore } from './images.ts';
import { QuizFileSchema } from './schemas.ts';

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const MEDIA_URL = /\/media\/([A-Za-z0-9_-]{16}\.(?:webp|svg))/g;

export class ImportError extends Error {}

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
 * Reads a quiz file (zip, or a bare quiz.json) and stores its images as new
 * uploads, rewriting the image addresses in the text to match.
 */
export async function importQuiz(file: Uint8Array, images: ImageStore): Promise<QuizContent> {
  const { json, media } = readArchive(file);
  let document: unknown;
  try {
    document = JSON.parse(json);
  } catch {
    throw new ImportError();
  }
  const parsed = QuizFileSchema.safeParse(document);
  if (!parsed.success) throw new ImportError();

  const quiz = parsed.data.quiz;
  const newUrls = new Map<string, string>();
  for (const name of referencedMedia(quiz)) {
    const data = media.get(name);
    if (!data) continue;
    try {
      newUrls.set(name, (await images.save(Buffer.from(data))).url);
    } catch (err) {
      if (err instanceof UnsupportedImageError) throw new ImportError();
      throw err;
    }
  }
  return mapMarkdown(quiz, (text) => text.replace(MEDIA_URL, (match, name: string) => newUrls.get(name) ?? match));
}

function readArchive(file: Uint8Array): { json: string; media: Map<string, Uint8Array> } {
  const isZip = file[0] === 0x50 && file[1] === 0x4b; // "PK"
  if (!isZip) return { json: strFromU8(file), media: new Map() };

  let entries: Record<string, Uint8Array>;
  let total = 0;
  try {
    entries = unzipSync(file, {
      filter(entry) {
        const wanted =
          entry.name === 'quiz.json' || (entry.name.startsWith('media/') && MEDIA_FILE.test(entry.name.slice(6)));
        if (!wanted) return false;
        total += entry.originalSize;
        if (entry.originalSize > MAX_IMAGE_BYTES || total > MAX_IMPORT_BYTES) throw new ImportError();
        return true;
      },
    });
  } catch {
    throw new ImportError();
  }

  const json = entries['quiz.json'];
  if (!json) throw new ImportError();
  const media = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (name.startsWith('media/')) media.set(name.slice(6), data);
  }
  return { json: strFromU8(json), media };
}

function markdownFields(content: QuizContent): string[] {
  return [
    content.description,
    ...content.questions.flatMap((question) => [question.body, ...question.options.map((option) => option.body)]),
  ];
}

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
