import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/server/app.ts';
import { loadConfig } from '../src/server/config.ts';
import { openDatabase } from '../src/server/db.ts';

export const TEST_PASSWORD = 'correct horse battery staple';

export function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'votehope-test-'));
}

export async function makeApp(env: Record<string, string> = {}) {
  const config = loadConfig({ ADMIN_PASSWORD: TEST_PASSWORD, DATA_DIR: tempDir(), ...env });
  const db = openDatabase(':memory:');
  const app = await buildApp(config, db);
  return { app, db, config };
}
