import type { DatabaseSync } from 'node:sqlite';
import { countIncompleteQuestions, type Question, type Quiz, type QuizContent, type QuizSummary } from '../shared/quiz.ts';

interface QuizRow {
  id: number;
  title: string;
  description: string;
  default_time_limit_s: number;
  questions_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    defaultTimeLimitS: row.default_time_limit_s,
    questions: JSON.parse(row.questions_json) as Question[],
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type UpdateResult =
  | { status: 'ok'; quiz: Quiz }
  | { status: 'not_found' }
  | { status: 'conflict'; quiz: Quiz };

export function createQuizStore(db: DatabaseSync) {
  const selectOne = db.prepare('SELECT * FROM quizzes WHERE id = ?');
  const selectAll = db.prepare('SELECT * FROM quizzes ORDER BY updated_at DESC, id DESC');
  const insert = db.prepare(
    'INSERT INTO quizzes (title, description, default_time_limit_s, questions_json) VALUES (?, ?, ?, ?)',
  );
  const update = db.prepare(`
    UPDATE quizzes
    SET title = ?, description = ?, default_time_limit_s = ?, questions_json = ?,
        revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND revision = ?`);
  const remove = db.prepare('DELETE FROM quizzes WHERE id = ?');

  function get(id: number): Quiz | undefined {
    const row = selectOne.get(id) as unknown as QuizRow | undefined;
    return row && toQuiz(row);
  }

  return {
    get,

    list(): QuizSummary[] {
      return (selectAll.all() as unknown as QuizRow[]).map((row) => {
        const questions = JSON.parse(row.questions_json) as Question[];
        return {
          id: row.id,
          title: row.title,
          questionCount: questions.length,
          incompleteCount: countIncompleteQuestions({ questions }),
          updatedAt: row.updated_at,
        };
      });
    },

    create(content: QuizContent): Quiz {
      const { lastInsertRowid } = insert.run(
        content.title,
        content.description,
        content.defaultTimeLimitS,
        JSON.stringify(content.questions),
      );
      return get(Number(lastInsertRowid))!;
    },

    /** Saves only if `revision` is still current, so edits from another window are never overwritten. */
    update(id: number, revision: number, content: QuizContent): UpdateResult {
      const { changes } = update.run(
        content.title,
        content.description,
        content.defaultTimeLimitS,
        JSON.stringify(content.questions),
        id,
        revision,
      );
      const quiz = get(id);
      if (!quiz) return { status: 'not_found' };
      return Number(changes) > 0 ? { status: 'ok', quiz } : { status: 'conflict', quiz };
    },

    remove(id: number): boolean {
      return Number(remove.run(id).changes) > 0;
    },
  };
}

export type QuizStore = ReturnType<typeof createQuizStore>;
