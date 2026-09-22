import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Server as SocketServer } from 'socket.io';
import type { Config } from './config.ts';
import { createAdminAuth } from './auth.ts';
import { createImageStore, SWEEP_INTERVAL_MS } from './images.ts';
import { createLiveEngine } from './live.ts';
import { createQuizStore } from './quizzes.ts';
import { createSessionStore } from './sessions.ts';
import { adminRoutes } from './routes/admin.ts';
import { authoringRoutes } from './routes/authoring.ts';
import { playRoutes } from './routes/play.ts';
import { sessionRoutes } from './routes/sessions.ts';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(config: Config, db: DatabaseSync, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: config.trustProxy });
  const auth = createAdminAuth(config);
  const quizzes = createQuizStore(db);
  const images = createImageStore(db, config.mediaDir);
  const sessions = createSessionStore(db);
  const live = createLiveEngine(sessions, (error) => app.log.error(error));

  await app.register(cookie, { secret: auth.cookieSecret });
  await app.register(rateLimit, { global: false });
  await app.register(multipart);

  app.get('/api/health', async () => {
    db.prepare('SELECT 1').get();
    return { ok: true };
  });
  await app.register(adminRoutes(auth), { prefix: '/api/admin' });
  await app.register(authoringRoutes({ auth, quizzes, images, mediaDir: config.mediaDir }), { prefix: '/api/admin' });
  await app.register(sessionRoutes({ auth, quizzes, sessions, live, publicUrl: config.publicUrl }), {
    prefix: '/api/admin',
  });
  await app.register(playRoutes(sessions, live), { prefix: '/api' });

  // Live sessions: the presenter screen and the phones stay connected over Socket.IO.
  const io = new SocketServer(app.server, { serveClient: false });
  live.attach(io, (cookieHeader) => auth.isAdminCookieHeader(app, cookieHeader));

  // Images nothing refers to any more are cleaned up now and then; recent uploads
  // are spared, so an image pasted into an unsaved draft survives.
  function sweepImages(): void {
    try {
      const removed = images.sweep(Date.now());
      if (removed > 0) app.log.info(`Deleted ${removed} unused image(s).`);
    } catch (err) {
      app.log.error(err);
    }
  }
  sweepImages();
  const sweepTimer = setInterval(sweepImages, SWEEP_INTERVAL_MS);
  sweepTimer.unref(); // never keeps the process alive

  app.addHook('preClose', async () => {
    clearInterval(sweepTimer);
    live.stop();
    io.disconnectSockets(true);
    io.engine.close();
  });

  // Uploaded images are public: students' phones load them. File names are
  // random and never reused, so they can be cached forever. The sandboxing CSP
  // keeps scripts inside uploaded SVGs from running if one is opened directly.
  await app.register(fastifyStatic, {
    root: config.mediaDir,
    prefix: '/media/',
    index: false,
    // reply.sendFile must come from the client instance below: these headers
    // (sandbox CSP, permanent caching) would break the app page.
    decorateReply: false,
    cacheControl: false,
    setHeaders(reply) {
      reply.header('cache-control', 'public, max-age=31536000, immutable');
      reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      reply.header('x-content-type-options', 'nosniff');
    },
  });

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
    const isPage = request.method === 'GET' && !/^\/(api|media)\//.test(request.url);
    if (hasClient && isPage) {
      // Client-side routes (/admin, /j/123456, …) all load the same page.
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
