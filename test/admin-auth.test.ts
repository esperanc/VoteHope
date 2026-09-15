import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ADMIN_COOKIE, hashPassword } from '../src/server/auth.ts';
import { ConfigError, loadConfig } from '../src/server/config.ts';
import { makeApp, tempDir, TEST_PASSWORD } from './helpers.ts';

const apps: FastifyInstance[] = [];

async function newApp(env: Record<string, string> = {}) {
  const { app } = await makeApp(env);
  apps.push(app);
  return app;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function login(app: FastifyInstance, password = TEST_PASSWORD) {
  return app.inject({ method: 'POST', url: '/api/admin/login', payload: { password } });
}

function sessionCookie(response: Awaited<ReturnType<typeof login>>): string {
  const cookie = response.cookies.find((c) => c.name === ADMIN_COOKIE);
  if (!cookie) throw new Error('no session cookie set');
  return cookie.value;
}

async function isAuthenticated(app: FastifyInstance, cookie?: string): Promise<boolean> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/admin/me',
    cookies: cookie ? { [ADMIN_COOKIE]: cookie } : {},
  });
  return response.json().authenticated;
}

describe('admin login', () => {
  it('is logged out without a cookie', async () => {
    const app = await newApp();
    expect(await isAuthenticated(app)).toBe(false);
  });

  it('rejects a wrong password', async () => {
    const app = await newApp();
    const response = await login(app, 'wrong');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'wrong_password' });
    expect(response.cookies.find((c) => c.name === ADMIN_COOKIE)).toBeUndefined();
  });

  it('rejects a malformed request', async () => {
    const app = await newApp();
    const response = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { pass: 1 } });
    expect(response.statusCode).toBe(400);
  });

  it('logs in, keeps the session, and logs out', async () => {
    const app = await newApp();
    const response = await login(app);
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name === ADMIN_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(await isAuthenticated(app, cookie.value)).toBe(true);

    const logout = await app.inject({ method: 'POST', url: '/api/admin/logout' });
    const cleared = logout.cookies.find((c) => c.name === ADMIN_COOKIE)!;
    expect(cleared.value).toBe('');
  });

  it('marks the cookie Secure when served over HTTPS', async () => {
    const app = await newApp({ PUBLIC_URL: 'https://quiz.example.org' });
    const cookie = (await login(app)).cookies.find((c) => c.name === ADMIN_COOKIE)!;
    expect(cookie.secure).toBe(true);
  });

  it('rejects a tampered cookie', async () => {
    const app = await newApp();
    const cookie = sessionCookie(await login(app));
    const [, signature] = cookie.split('.');
    expect(await isAuthenticated(app, `${Date.now() + 1000}.${signature}`)).toBe(false);
  });

  it('expires sessions after 30 days', async () => {
    const app = await newApp();
    const cookie = sessionCookie(await login(app));
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
    expect(await isAuthenticated(app, cookie)).toBe(false);
  });

  it('keeps sessions across restarts with the same secret and password', async () => {
    const env = { SESSION_SECRET: 'fixed-secret' };
    const cookie = sessionCookie(await login(await newApp(env)));
    expect(await isAuthenticated(await newApp(env), cookie)).toBe(true);
  });

  it('logs everyone out when the password changes', async () => {
    const cookie = sessionCookie(await login(await newApp({ SESSION_SECRET: 'fixed-secret' })));
    const restarted = await newApp({ SESSION_SECRET: 'fixed-secret', ADMIN_PASSWORD: 'a new password' });
    expect(await isAuthenticated(restarted, cookie)).toBe(false);
  });

  it('accepts ADMIN_PASSWORD_HASH', async () => {
    const app = await newApp({ ADMIN_PASSWORD: '', ADMIN_PASSWORD_HASH: hashPassword('hashed pw') });
    expect((await login(app, 'hashed pw')).statusCode).toBe(200);
    expect((await login(app, TEST_PASSWORD)).statusCode).toBe(401);
  });

  it('rate-limits login attempts', async () => {
    const app = await newApp();
    for (let i = 0; i < 10; i++) expect((await login(app, 'wrong')).statusCode).toBe(401);
    expect((await login(app, TEST_PASSWORD)).statusCode).toBe(429);
  });
});

describe('configuration', () => {
  it('refuses to start without an admin password', () => {
    expect(() => loadConfig({ DATA_DIR: tempDir() })).toThrow(ConfigError);
  });

  it('persists a generated session secret in the data directory', () => {
    const dir = tempDir();
    const first = loadConfig({ ADMIN_PASSWORD: 'x', DATA_DIR: dir });
    const second = loadConfig({ ADMIN_PASSWORD: 'x', DATA_DIR: dir });
    expect(first.sessionSecret).toHaveLength(43);
    expect(second.sessionSecret).toBe(first.sessionSecret);
  });
});

describe('API fallback', () => {
  it('answers unknown API routes with a JSON 404', async () => {
    const app = await newApp();
    const response = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
  });

  it('reports health', async () => {
    const app = await newApp();
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true });
  });
});
