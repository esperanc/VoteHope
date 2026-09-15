import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  /**
   * Base URL for join links and QR codes, without trailing slash. When unset, links
   * use the address the presenter's browser is using (fine on a local network).
   */
  publicUrl: string | null;
  dataDir: string;
  /** Uploaded images (inside dataDir). */
  mediaDir: string;
  /** Built front end (dist/client). Served only if it exists. */
  clientDir: string;
  /** Set when running behind a reverse proxy (Caddy, nginx) so client IPs are read correctly. */
  trustProxy: boolean;
  secureCookies: boolean;
  adminPassword: string | undefined;
  adminPasswordHash: string | undefined;
  sessionSecret: string;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError(`PORT must be a valid port number (got "${env.PORT}").`);
  }

  const adminPassword = env.ADMIN_PASSWORD || undefined;
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH || undefined;
  if (!adminPassword && !adminPasswordHash) {
    throw new ConfigError(
      'Set ADMIN_PASSWORD, or ADMIN_PASSWORD_HASH (generate one with "npm run hash-password").',
    );
  }

  const dataDir = path.resolve(env.DATA_DIR ?? 'data');
  const mediaDir = path.join(dataDir, 'media');
  mkdirSync(mediaDir, { recursive: true });

  const publicUrl = env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/+$/, '') : null;

  return {
    port,
    host: env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
    publicUrl,
    dataDir,
    mediaDir,
    clientDir: path.resolve(import.meta.dirname, '../../dist/client'),
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    secureCookies: publicUrl?.startsWith('https://') ?? false,
    adminPassword,
    adminPasswordHash,
    sessionSecret: env.SESSION_SECRET || loadOrCreateSecret(dataDir),
  };
}

/** Keeps admin logins valid across restarts without requiring the operator to set a secret. */
function loadOrCreateSecret(dataDir: string): string {
  const file = path.join(dataDir, 'session-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
