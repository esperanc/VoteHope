import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.ts';
import { createAdminAuth } from './auth.ts';
import { adminRoutes } from './routes/admin.ts';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(config: Config, db: DatabaseSync, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: config.trustProxy });
  const auth = createAdminAuth(config);

  await app.register(cookie, { secret: auth.cookieSecret });
  await app.register(rateLimit, { global: false });

  app.get('/api/health', async () => {
    db.prepare('SELECT 1').get();
    return { ok: true };
  });
  await app.register(adminRoutes(auth), { prefix: '/api/admin' });

  // The built single-page app. In development Vite serves it instead.
  const hasClient = existsSync(path.join(config.clientDir, 'index.html'));
  if (hasClient) {
    await app.register(fastifyStatic, {
      root: config.clientDir,
      cacheControl: false,
      setHeaders(reply, filePath) {
        const hashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
        reply.header('cache-control', hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (hasClient && request.method === 'GET' && !request.url.startsWith('/api/')) {
      // Client-side routes (/admin, /j/123456, …) all load the same page.
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
