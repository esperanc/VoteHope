import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.ts';

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version: applied } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (applied > migrations.length) {
    throw new Error(
      `Database schema version ${applied} is newer than this program supports (${migrations.length}).`,
    );
  }
  for (let version = applied; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
