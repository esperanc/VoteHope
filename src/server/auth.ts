import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.ts';

// ---- Password hashing -------------------------------------------------------
// Format: scrypt:N:r:p:salt:hash (base64url). Colons rather than "$" so the hash
// can be pasted into .env files and docker-compose without escaping.

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join(':');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || salt === undefined || hash === undefined) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 };
  if (![params.N, params.r, params.p].every(Number.isSafeInteger)) return false;
  const expected = Buffer.from(hash, 'base64url');
  try {
    const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, params);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// ---- Admin session cookie ---------------------------------------------------

export const ADMIN_COOKIE = 'vh_admin';
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export interface AdminAuth {
  /** Secret for signing cookies; pass to @fastify/cookie. */
  cookieSecret: string;
  verify(password: string): Promise<boolean>;
  isAdmin(request: FastifyRequest): boolean;
  startSession(reply: FastifyReply): void;
  endSession(reply: FastifyReply): void;
  requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void>;
}

export function createAdminAuth(config: Config): AdminAuth {
  const storedHash = config.adminPasswordHash ?? hashPassword(config.adminPassword!);

  // The signing key depends on the configured password, so changing the password
  // logs out every existing session. A plain password is hashed with a fresh salt
  // on each start, so it is fingerprinted separately to keep the key stable.
  const passwordFingerprint =
    config.adminPasswordHash ?? createHash('sha256').update(config.adminPassword!).digest('base64url');
  const cookieSecret = createHmac('sha256', config.sessionSecret).update(passwordFingerprint).digest('base64url');

  function isAdmin(request: FastifyRequest): boolean {
    const raw = request.cookies[ADMIN_COOKIE];
    if (!raw) return false;
    const { valid, value } = request.unsignCookie(raw);
    if (!valid || value === null) return false;
    const issuedAt = Number(value);
    return Number.isFinite(issuedAt) && Date.now() - issuedAt < SESSION_MAX_AGE_S * 1000;
  }

  return {
    cookieSecret,
    verify: (password) => verifyPassword(password, storedHash),
    isAdmin,
    startSession(reply) {
      reply.setCookie(ADMIN_COOKIE, String(Date.now()), {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        path: '/',
        maxAge: SESSION_MAX_AGE_S,
      });
    },
    endSession(reply) {
      reply.clearCookie(ADMIN_COOKIE, { path: '/' });
    },
    async requireAdmin(request, reply) {
      if (!isAdmin(request)) return reply.code(401).send({ error: 'unauthorized' });
    },
  };
}
