import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../src/server/config.ts';
import { adminCookies, makeApp, multipartFile } from './helpers.ts';

let app: FastifyInstance;
let config: Config;
let cookies: Record<string, string>;

beforeEach(async () => {
  ({ app, config } = await makeApp());
  cookies = await adminCookies(app);
});

afterEach(() => app.close());

function uploadImage(filename: string, data: Buffer, type?: string) {
  return app.inject({ method: 'POST', url: '/api/admin/images', cookies, ...multipartFile(filename, data, type) });
}

function png(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#0f766e' } }).png().toBuffer();
}

describe('image uploads', () => {
  it('scales large images down and stores them as WebP', async () => {
    const response = await uploadImage('big.png', await png(2400, 1200), 'image/png');
    expect(response.statusCode).toBe(201);
    const { url, width, height } = response.json();
    expect(url).toMatch(/^\/media\/[\w-]{16}\.webp$/);
    expect({ width, height }).toEqual({ width: 1600, height: 800 });
    expect(existsSync(path.join(config.mediaDir, path.basename(url)))).toBe(true);

    const media = await app.inject({ method: 'GET', url });
    expect(media.statusCode).toBe(200);
    expect(media.headers['content-type']).toBe('image/webp');
    expect(media.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(media.headers['content-security-policy']).toContain('sandbox');
    expect((await sharp(media.rawPayload).metadata()).width).toBe(1600);
  });

  it('keeps small images at their size', async () => {
    const response = await uploadImage('small.png', await png(300, 200));
    expect(response.json()).toMatchObject({ width: 300, height: 200 });
  });

  it('keeps SVG as vector, served sandboxed', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><script>alert(1)</script><rect width="120" height="60"/></svg>',
    );
    const response = await uploadImage('diagram.svg', svg, 'image/svg+xml');
    expect(response.statusCode).toBe(201);
    const { url, width, height } = response.json();
    expect(url).toMatch(/\.svg$/);
    expect({ width, height }).toEqual({ width: 120, height: 60 });

    const media = await app.inject({ method: 'GET', url });
    expect(media.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(media.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
  });

  it('rejects files that are not images', async () => {
    const response = await uploadImage('notes.txt', Buffer.from('hello'), 'text/plain');
    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({ error: 'unsupported_image' });
  });

  it('rejects requests without a file', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/admin/images', cookies, payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'no_file' });
  });

  it('rejects files over 15 MB', async () => {
    const response = await uploadImage('huge.png', Buffer.alloc(16 * 1024 * 1024));
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'file_too_large' });
  });

  it('answers missing media with a 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/media/AAAAAAAAAAAAAAAA.webp' });
    expect(response.statusCode).toBe(404);
  });
});
