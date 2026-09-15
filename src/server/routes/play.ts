// Student endpoints. Joining returns a secret token; the student's browser sends
// it as "Authorization: Bearer <token>" on every later request.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LIMITS } from '../../shared/quiz.ts';
import { PlayError, type SessionStore } from '../sessions.ts';

const JoinBody = z.object({
  name: z.string().max(200),
  email: z.string().max(400).optional(),
});

const AnswerBody = z.object({
  optionIds: z.array(z.string().max(32)).max(LIMITS.maxOptions),
});

const NextBody = z.object({
  from: z.number().int().min(0),
});

const CODE = /^\d{6}$/;

// A whole classroom usually shares one public IP address, so this only stops
// someone hammering the server (e.g. guessing codes).
const rateLimit = { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } };

export function playRoutes(sessions: SessionStore): FastifyPluginAsync {
  return async (app) => {
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof PlayError) return reply.code(error.status).send({ error: error.code });
      throw error;
    });

    function sessionFor(request: FastifyRequest) {
      const { code } = request.params as { code: string };
      const session = CODE.test(code) ? sessions.getByCode(code) : undefined;
      if (!session) throw new PlayError(404, 'not_found');
      return session;
    }

    function attemptFor(request: FastifyRequest) {
      const session = sessionFor(request);
      const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
      const participant = token ? sessions.authenticate(session, token) : undefined;
      if (!participant) throw new PlayError(401, 'invalid_token');
      return { session, participant };
    }

    function parse<T>(schema: z.ZodType<T>, body: unknown): T {
      const result = schema.safeParse(body);
      if (!result.success) throw new PlayError(400, 'invalid_request');
      return result.data;
    }

    app.get('/join/:code', rateLimit, async (request) => sessions.joinInfo(sessionFor(request), Date.now()));

    app.post('/join/:code', rateLimit, async (request, reply) => {
      const { name, email } = parse(JoinBody, request.body);
      const token = sessions.join(sessionFor(request), name, email ?? '', Date.now());
      return reply.code(201).send({ token });
    });

    app.get('/play/:code', async (request) => {
      const { session, participant } = attemptFor(request);
      return sessions.playState(session, participant, Date.now());
    });

    app.post('/play/:code/start', async (request) => {
      const { session, participant } = attemptFor(request);
      const now = Date.now();
      return sessions.playState(session, sessions.start(session, participant, now), now);
    });

    app.put('/play/:code/answers/:questionId', async (request) => {
      const { session, participant } = attemptFor(request);
      const { optionIds } = parse(AnswerBody, request.body);
      const { questionId } = request.params as { questionId: string };
      sessions.answer(session, participant, questionId, optionIds, Date.now());
      return { saved: true };
    });

    app.post('/play/:code/next', async (request) => {
      const { session, participant } = attemptFor(request);
      const { from } = parse(NextBody, request.body);
      const now = Date.now();
      return sessions.playState(session, sessions.next(session, participant, from, now), now);
    });

    app.post('/play/:code/submit', async (request) => {
      const { session, participant } = attemptFor(request);
      const now = Date.now();
      return sessions.playState(session, sessions.submit(session, participant, now), now);
    });
  };
}
