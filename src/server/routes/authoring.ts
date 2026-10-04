import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodError } from 'zod';
import { contentOf } from '../../shared/quiz.ts';
import type { AdminAuth } from '../auth.ts';
import { MAX_IMAGE_BYTES, UnsupportedImageError, type ImageStore } from '../images.ts';
import type { QuizStore } from '../quizzes.ts';
import { DuplicateQuizBody, QuizContentSchema, SaveQuizBody } from '../schemas.ts';
import { exportQuiz, ImportError, importQuiz, MAX_IMPORT_BYTES } from '../transfer.ts';

interface Deps {
  auth: AdminAuth;
  quizzes: QuizStore;
  images: ImageStore;
  mediaDir: string;
}

// Large enough for 200 questions with long texts.
const QUIZ_BODY_LIMIT = 5 * 1024 * 1024;

export function authoringRoutes({ auth, quizzes, images, mediaDir }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', auth.requireAdmin);

    app.get('/quizzes', async () => quizzes.list());

    app.post('/quizzes', { bodyLimit: QUIZ_BODY_LIMIT }, async (request, reply) => {
      const body = QuizContentSchema.safeParse(request.body);
      if (!body.success) return invalid(reply, body.error);
      return reply.code(201).send(quizzes.create(body.data));
    });

    app.get('/quizzes/:id', async (request, reply) => {
      return quizzes.get(quizId(request)) ?? notFound(reply);
    });

    app.put('/quizzes/:id', { bodyLimit: QUIZ_BODY_LIMIT }, async (request, reply) => {
      const body = SaveQuizBody.safeParse(request.body);
      if (!body.success) return invalid(reply, body.error);
      const result = quizzes.update(quizId(request), body.data.revision, body.data.content);
      if (result.status === 'not_found') return notFound(reply);
      if (result.status === 'conflict') {
        return reply.code(409).send({ error: 'conflict', revision: result.quiz.revision });
      }
      return { revision: result.quiz.revision, updatedAt: result.quiz.updatedAt };
    });

    app.delete('/quizzes/:id', async (request, reply) => {
      if (!quizzes.remove(quizId(request))) return notFound(reply);
      return reply.code(204).send();
    });

    app.post('/quizzes/:id/duplicate', async (request, reply) => {
      const body = DuplicateQuizBody.safeParse(request.body);
      if (!body.success) return invalid(reply, body.error);
      const quiz = quizzes.get(quizId(request));
      if (!quiz) return notFound(reply);
      return reply.code(201).send(quizzes.create({ ...contentOf(quiz), title: body.data.title }));
    });

    app.get('/quizzes/:id/export', async (request, reply) => {
      const quiz = quizzes.get(quizId(request));
      if (!quiz) return notFound(reply);
      const zip = exportQuiz(contentOf(quiz), mediaDir);
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', attachment(`${quiz.title.trim() || 'quiz'}.zip`))
        .send(Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength));
    });

    app.post('/quizzes/import', async (request, reply) => {
      const data = await readUpload(request, reply, MAX_IMPORT_BYTES);
      if (!data) return reply;
      try {
        return reply.code(201).send(quizzes.create(await importQuiz(data, images)));
      } catch (err) {
        if (err instanceof ImportError) return reply.code(400).send({ error: 'invalid_file', problems: err.problems });
        throw err;
      }
    });

    app.post('/images', async (request, reply) => {
      const data = await readUpload(request, reply, MAX_IMAGE_BYTES);
      if (!data) return reply;
      try {
        return reply.code(201).send(await images.save(data));
      } catch (err) {
        if (err instanceof UnsupportedImageError) return reply.code(415).send({ error: 'unsupported_image' });
        throw err;
      }
    });
  };
}

function quizId(request: FastifyRequest): number {
  const id = Number((request.params as { id?: string }).id);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: 'not_found' });
}

function invalid(reply: FastifyReply, error: ZodError) {
  const details = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return reply.code(400).send({ error: 'invalid_request', details });
}

/** Reads the single uploaded file, or sends an error response and returns null. */
async function readUpload(request: FastifyRequest, reply: FastifyReply, maxBytes: number): Promise<Buffer | null> {
  const file = request.isMultipart() ? await request.file({ limits: { fileSize: maxBytes, files: 1 } }) : undefined;
  if (!file) {
    await reply.code(400).send({ error: 'no_file' });
    return null;
  }
  try {
    return await file.toBuffer();
  } catch (err) {
    if (err instanceof request.server.multipartErrors.RequestFileTooLargeError) {
      await reply.code(413).send({ error: 'file_too_large' });
      return null;
    }
    throw err;
  }
}

/** Content-Disposition with an ASCII fallback plus the UTF-8 name (RFC 6266). */
function attachment(filename: string): string {
  const safe = filename.replace(/[\\/"]/g, '_');
  const ascii = safe.normalize('NFKD').replace(/[^\x20-\x7e]/g, '') || 'quiz.zip';
  const utf8 = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
