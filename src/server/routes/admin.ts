import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AdminAuth } from '../auth.ts';

const LoginBody = z.object({ password: z.string().min(1).max(256) });

export function adminRoutes(auth: AdminAuth): FastifyPluginAsync {
  return async (app) => {
    app.get('/me', async (request) => ({ authenticated: auth.isAdmin(request) }));

    app.post(
      '/login',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const body = LoginBody.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
        if (!(await auth.verify(body.data.password))) {
          return reply.code(401).send({ error: 'wrong_password' });
        }
        auth.startSession(reply);
        return { authenticated: true };
      },
    );

    app.post('/logout', async (_request, reply) => {
      auth.endSession(reply);
      return { authenticated: false };
    });
  };
}
