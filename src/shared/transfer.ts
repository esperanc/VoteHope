// What can be wrong with a quiz file being imported. The server lists every problem
// it finds and the client says where each one is, so that a file written by hand can
// be fixed without guessing.

/** A place in quiz.json, e.g. ['questions', 2, 'options', 0, 'correct']. */
export type ProblemPath = (string | number)[];

export type ImportProblem =
  /** Not a quiz: not text, a JSON "format" from some other program, Markdown with no headings… */
  | { code: 'not_a_quiz' }
  /** Not saved as UTF-8 — usually Windows-1252, from an older Windows editor. */
  | { code: 'encoding' }
  /** quiz.json is not valid JSON; the parser's message gives the line and column. */
  | { code: 'json'; message: string }
  /** A field is missing, has the wrong type, or is too long. */
  | { code: 'field'; path: ProblemPath; message: string }
  /** A LaTeX command written with one backslash, which JSON read as an escape. */
  | { code: 'escape'; path: ProblemPath; command: string }
  /** Markdown: the file does not start with a "# title" line. */
  | { code: 'md_no_title' }
  /** Markdown: a second "#" title (questions start with "##"). */
  | { code: 'md_extra_title'; line: number }
  /** Markdown: text after a question's options, which must end it. */
  | { code: 'md_after_options'; line: number }
  /** Markdown: options mixing boxes ("- [x]") and plain items ("- "). */
  | { code: 'md_mixed_options'; line: number }
  /** Markdown: a {setting} that is unknown, misplaced, or out of range. */
  | { code: 'md_setting'; line: number; setting: string }
  | { code: 'bad_zip' }
  | { code: 'no_quiz_file' }
  | { code: 'missing_image'; name: string }
  | { code: 'bad_image'; name: string }
  | { code: 'too_large'; name: string };
