import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.ts';
import { loadConfig } from '../src/server/config.ts';
import { openDatabase } from '../src/server/db.ts';
import { tempDir } from './helpers.ts';

describe('serving the built front end', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const clientDir = tempDir();
    writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>VoteHope</title>');
    mkdirSync(path.join(clientDir, 'assets'));
    writeFileSync(path.join(clientDir, 'assets', 'index-abc123.js'), 'console.log(1)');
    const config = { ...loadConfig({ ADMIN_PASSWORD: 'x', DATA_DIR: tempDir() }), clientDir };
    app = await buildApp(config, openDatabase(':memory:'));
  });

  afterAll(() => app.close());

  it('serves index.html for client-side routes, uncached', async () => {
    for (const url of ['/', '/admin', '/admin/login?next=%2Fadmin', '/j/123456']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.headers['cache-control']).toBe('no-cache');
      // The sandbox policy is for uploaded media only; it would break the app.
      expect(response.headers['content-security-policy']).toBeUndefined();
    }
  });

  it('serves hashed assets with long-lived caching', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('still answers unknown API routes with JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
  });
});
