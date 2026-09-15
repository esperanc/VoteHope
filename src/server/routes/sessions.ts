import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { findIssues } from '../../shared/quiz.ts';
import { SESSION_LIMITS, type AsyncSettings } from '../../shared/session.ts';
import type { AdminAuth } from '../auth.ts';
import type { QuizStore } from '../quizzes.ts';
import type { Session, SessionStore } from '../sessions.ts';

interface Deps {
  auth: AdminAuth;
  quizzes: QuizStore;
  sessions: SessionStore;
  /** Configured base URL for join links; null means "the address the presenter is using". */
  publicUrl: string | null;
}

const Timestamp = z.iso.datetime().nullable();

function datesInOrder(settings: { opensAt?: string | null; closesAt?: string | null }): boolean {
  return !settings.opensAt || !settings.closesAt || Date.parse(settings.opensAt) < Date.parse(settings.closesAt);
}

const AsyncSettingsSchema: z.ZodType<AsyncSettings> = z
  .object({
    timerMode: z.enum(['none', 'total', 'perQuestion']),
    totalMinutes: z.number().int().min(1).max(SESSION_LIMITS.maxTotalMinutes).nullable(),
    shuffleQuestions: z.boolean(),
    opensAt: Timestamp,
    closesAt: Timestamp,
    showScore: z.boolean(),
    email: z.enum(['hidden', 'optional', 'required']),
  })
  .refine((s) => s.timerMode !== 'total' || s.totalMinutes !== null, 'totalMinutes is required for a total timer')
  .refine(datesInOrder, 'opensAt must be before closesAt');

const CreateSessionBody = z.object({
  quizId: z.number().int().positive(),
  mode: z.literal('async'),
  settings: AsyncSettingsSchema,
});

const UpdateSessionBody = z.object({
  opensAt: Timestamp.optional(),
  closesAt: Timestamp.optional(),
  showScore: z.boolean().optional(),
  closed: z.boolean().optional(),
});

export function sessionRoutes({ auth, quizzes, sessions, publicUrl }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', auth.requireAdmin);

    const joinBase = (request: FastifyRequest) => publicUrl ?? `${request.protocol}://${request.host}`;

    function load(request: FastifyRequest, reply: FastifyReply): Session | null {
      const id = Number((request.params as { id?: string }).id);
      const session = Number.isSafeInteger(id) && id > 0 ? sessions.get(id) : undefined;
      if (!session) {
        void reply.code(404).send({ error: 'not_found' });
        return null;
      }
      return session;
    }

    app.get('/sessions', async (request) => {
      const quizId = Number((request.query as { quizId?: string }).quizId);
      return sessions.list(Date.now(), Number.isSafeInteger(quizId) && quizId > 0 ? quizId : undefined);
    });

    app.post('/sessions', async (request, reply) => {
      const body = CreateSessionBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
      const quiz = quizzes.get(body.data.quizId);
      if (!quiz) return reply.code(404).send({ error: 'not_found' });
      if (findIssues(quiz).length > 0) return reply.code(409).send({ error: 'quiz_incomplete' });
      const session = sessions.create(quiz, body.data.settings);
      return reply.code(201).send(sessions.detail(session, Date.now(), joinBase(request)));
    });

    app.get('/sessions/:id', async (request, reply) => {
      const session = load(request, reply);
      return session && sessions.detail(session, Date.now(), joinBase(request));
    });

    app.patch('/sessions/:id', async (request, reply) => {
      const session = load(request, reply);
      if (!session) return reply;
      const body = UpdateSessionBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
      const { closed, ...changes } = body.data;
      if (!datesInOrder({ ...session.settings, ...changes })) return reply.code(400).send({ error: 'invalid_request' });

      const now = Date.now();
      let updated = sessions.update(session, changes);
      if (closed !== undefined) updated = sessions.setClosed(updated, closed, now);
      return sessions.detail(updated, now, joinBase(request));
    });

    app.delete('/sessions/:id', async (request, reply) => {
      const session = load(request, reply);
      if (!session) return reply;
      sessions.remove(session.id);
      return reply.code(204).send();
    });

    app.get('/sessions/:id/results', async (request, reply) => {
      const session = load(request, reply);
      return session && sessions.results(session, Date.now(), joinBase(request));
    });

    app.get('/sessions/:id/qr.svg', async (request, reply) => {
      const session = load(request, reply);
      if (!session) return reply;
      const svg = await QRCode.toString(`${joinBase(request)}/j/${session.code}`, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      return reply.header('content-type', 'image/svg+xml').header('cache-control', 'no-store').send(svg);
    });

    app.delete('/sessions/:id/participants/:participantId', async (request, reply) => {
      const session = load(request, reply);
      if (!session) return reply;
      const participantId = Number((request.params as { participantId?: string }).participantId);
      if (!sessions.removeParticipant(session, participantId)) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    });
  };
}
