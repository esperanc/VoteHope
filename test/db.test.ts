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
    expect(tables).toEqual(['answers', 'images', 'options', 'participants', 'questions', 'quizzes', 'sessions']);
    db.close();
  });

  it('enforces foreign keys and cascades quiz deletion', () => {
    const db = openDatabase(':memory:');
    const quiz = db.prepare(`INSERT INTO quizzes (title) VALUES ('Q')`).run();
    const question = db
      .prepare(`INSERT INTO questions (quiz_id, position, kind, selection) VALUES (?, 0, 'quiz', 'single')`)
      .run(quiz.lastInsertRowid);
    db.prepare(`INSERT INTO options (question_id, position, is_correct) VALUES (?, 0, 1)`).run(
      question.lastInsertRowid,
    );

    expect(() =>
      db.prepare(`INSERT INTO questions (quiz_id, position, kind, selection) VALUES (999, 0, 'quiz', 'single')`).run(),
    ).toThrow(/FOREIGN KEY/);

    db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.lastInsertRowid);
    expect(db.prepare('SELECT COUNT(*) AS n FROM options').get()).toEqual({ n: 0 });
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
