// Each entry is applied once, in order, and recorded in PRAGMA user_version.
// Never edit an entry that may already have been applied; append a new one instead.

const now = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const migrations: string[] = [
  `
  CREATE TABLE quizzes (
    id                   INTEGER PRIMARY KEY,
    title                TEXT    NOT NULL,
    description          TEXT    NOT NULL DEFAULT '',
    default_time_limit_s INTEGER NOT NULL DEFAULT 30,
    created_at           TEXT    NOT NULL DEFAULT ${now},
    updated_at           TEXT    NOT NULL DEFAULT ${now}
  );

  CREATE TABLE questions (
    id           INTEGER PRIMARY KEY,
    quiz_id      INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    kind         TEXT    NOT NULL CHECK (kind IN ('quiz', 'poll')),
    selection    TEXT    NOT NULL CHECK (selection IN ('single', 'multiple')),
    body_md      TEXT    NOT NULL DEFAULT '',
    time_limit_s INTEGER
  );
  CREATE INDEX questions_by_quiz ON questions(quiz_id, position);

  CREATE TABLE options (
    id          INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    body_md     TEXT    NOT NULL DEFAULT '',
    is_correct  INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1))
  );
  CREATE INDEX options_by_question ON options(question_id, position);

  CREATE TABLE images (
    id         TEXT    PRIMARY KEY,
    filename   TEXT    NOT NULL,
    mime       TEXT    NOT NULL,
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT ${now}
  );

  -- A session keeps a snapshot of the quiz, so deleting or editing the quiz
  -- never changes the results of sessions already run.
  CREATE TABLE sessions (
    id                 INTEGER PRIMARY KEY,
    quiz_id            INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
    code               TEXT    NOT NULL,
    mode               TEXT    NOT NULL CHECK (mode IN ('sync', 'async')),
    status             TEXT    NOT NULL,
    settings_json      TEXT    NOT NULL DEFAULT '{}',
    quiz_snapshot_json TEXT    NOT NULL,
    phase              TEXT,
    question_index     INTEGER,
    deadline_ms        INTEGER,
    created_at         TEXT    NOT NULL DEFAULT ${now},
    started_at         TEXT,
    ended_at           TEXT
  );
  CREATE UNIQUE INDEX sessions_open_code ON sessions(code) WHERE status <> 'finished';

  CREATE TABLE participants (
    id           INTEGER PRIMARY KEY,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    name_key     TEXT    NOT NULL,
    email        TEXT,
    token_hash   TEXT    NOT NULL UNIQUE,
    joined_at    TEXT    NOT NULL DEFAULT ${now},
    started_at   TEXT,
    submitted_at TEXT,
    removed      INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1))
  );
  CREATE UNIQUE INDEX participants_unique_name ON participants(session_id, name_key) WHERE removed = 0;

  CREATE TABLE answers (
    id              INTEGER PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id  INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    -- Refers to the question id inside the session's quiz snapshot.
    question_id     INTEGER NOT NULL,
    option_ids_json TEXT    NOT NULL,
    is_correct      INTEGER CHECK (is_correct IN (0, 1)),
    answered_at     TEXT    NOT NULL DEFAULT ${now},
    UNIQUE (participant_id, question_id)
  );
  CREATE INDEX answers_by_session ON answers(session_id, question_id);
  `,

  // Questions become a JSON document on the quiz: the editor saves whole quizzes
  // and sessions snapshot them, so separate tables bought nothing. Question ids
  // are now short strings, which answers refer to.
  `
  DROP TABLE options;
  DROP TABLE questions;
  ALTER TABLE quizzes ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE quizzes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

  DROP TABLE answers;
  CREATE TABLE answers (
    id              INTEGER PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id  INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    question_id     TEXT    NOT NULL,
    option_ids_json TEXT    NOT NULL,
    is_correct      INTEGER CHECK (is_correct IN (0, 1)),
    answered_at     TEXT    NOT NULL DEFAULT ${now},
    UNIQUE (participant_id, question_id)
  );
  CREATE INDEX answers_by_session ON answers(session_id, question_id);
  `,
];
