// What can be wrong with a quiz file being imported. The server lists every problem
// it finds and the client says where each one is, so that a file written by hand can
// be fixed without guessing.

/** A place in quiz.json, e.g. ['questions', 2, 'options', 0, 'correct']. */
export type ProblemPath = (string | number)[];

export type ImportProblem =
  /** Not a quiz: not a JSON object, or a "format" from some other program. */
  | { code: 'not_a_quiz' }
  /** quiz.json is not valid JSON; the parser's message gives the line and column. */
  | { code: 'json'; message: string }
  /** A field is missing, has the wrong type, or is too long. */
  | { code: 'field'; path: ProblemPath; message: string }
  /** A LaTeX command written with one backslash, which JSON read as an escape. */
  | { code: 'escape'; path: ProblemPath; command: string }
  | { code: 'bad_zip' }
  | { code: 'no_quiz_json' }
  | { code: 'missing_image'; name: string }
  | { code: 'bad_image'; name: string }
  | { code: 'too_large'; name: string };
