import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/server/db.ts';
import { migrations } from '../src/server/migrations.ts';
import { tempDir } from './helpers.ts';

describe('database', () => {
  it('applies all migrations once and can be reopened', () => {
    const file = path.join(tempDir(), 'test.db');
    openDatabase(file).close();
    const db = openDatabase(file);
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(user_version).toBe(migrations.length);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(['answers', 'images', 'participants', 'quizzes', 'sessions']);
    db.close();
  });

  it('keeps sessions when their quiz is deleted, and cascades session deletion', () => {
    const db = openDatabase(':memory:');
    const quiz = db.prepare(`INSERT INTO quizzes (title) VALUES ('Q')`).run();
    const session = db
      .prepare(`INSERT INTO sessions (quiz_id, code, mode, status, quiz_snapshot_json) VALUES (?, '1', 'sync', 'lobby', '{}')`)
      .run(quiz.lastInsertRowid);
    const participant = db
      .prepare(`INSERT INTO participants (session_id, name, name_key, token_hash) VALUES (?, 'Ana', 'ana', 't')`)
      .run(session.lastInsertRowid);
    db.prepare(`INSERT INTO answers (session_id, participant_id, question_id, option_ids_json) VALUES (?, ?, 'q1', '[]')`).run(
      session.lastInsertRowid,
      participant.lastInsertRowid,
    );

    db.prepare('DELETE FROM quizzes').run();
    expect(db.prepare('SELECT quiz_id FROM sessions').get()).toEqual({ quiz_id: null });

    expect(() =>
      db.prepare(`INSERT INTO participants (session_id, name, name_key, token_hash) VALUES (999, 'X', 'x', 'u')`).run(),
    ).toThrow(/FOREIGN KEY/);

    db.prepare('DELETE FROM sessions').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM answers').get()).toEqual({ n: 0 });
    db.close();
  });

  it('allows a name to be reused in a session once its participant is removed', () => {
    const db = openDatabase(':memory:');
    const session = db
      .prepare(`INSERT INTO sessions (code, mode, status, quiz_snapshot_json) VALUES ('123456', 'sync', 'lobby', '{}')`)
      .run();
    const join = db.prepare(`INSERT INTO participants (session_id, name, name_key, token_hash) VALUES (?, 'Ana', 'ana', ?)`);
    const first = join.run(session.lastInsertRowid, 't1');
    expect(() => join.run(session.lastInsertRowid, 't2')).toThrow(/UNIQUE/);
    db.prepare('UPDATE participants SET removed = 1 WHERE id = ?').run(first.lastInsertRowid);
    expect(() => join.run(session.lastInsertRowid, 't3')).not.toThrow();
    db.close();
  });
});
