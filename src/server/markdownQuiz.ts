// Quizzes written in Markdown, which is easier to write by hand than JSON: formulas
// keep their single backslashes and nothing needs quoting.
//
//   # Derivatives {time=45}              the title; settings go between braces
//   Optional description.
//
//   ## What is the derivative of $x^2$?
//   - [ ] $x$                            options with boxes; [x] marks the correct ones
//   - [x] $2x$
//
//   ## How confident do you feel? {time=20}
//   - Very                               options without boxes: a poll
//   - Not yet
//
// A question is its "##" heading plus whatever comes before its options, which are
// the list that ends it. Text is kept exactly as written; the result is shaped like a
// quiz.json and checked the same way (see transfer.ts).

import MarkdownIt from 'markdown-it';
import { LIMITS } from '../shared/quiz.ts';
import type { ImportProblem } from '../shared/transfer.ts';

// Only the block structure matters here; inline Markdown and formulas are the
// client's business. HTML is on so that <!-- comments --> are recognised and skipped.
const parser = new MarkdownIt({ html: true });

/** A top-level block of the file, by its lines (0-based, end excluded). */
interface Block {
  kind: 'heading' | 'list' | 'other';
  /** 1 for "#", 2 for "##"… (headings only). */
  depth: number;
  start: number;
  end: number;
  /** A heading's text, as typed. */
  text: string;
  /** A list's items, by their lines. */
  items: [number, number][];
}

/** Braces ending a heading: {time=20 multiple}. */
const SETTINGS = /\s*\{([^{}]*)\}\s*$/;
/** What a setting looks like, known or not. Other braces are text, like a set {1, 2, 3}. */
const SETTING_LIKE = /^\p{L}+(?:=\S*)?$/u;
const TIME = /^(?:time|tempo)=(\d+)$/i;
const MULTIPLE = /^(?:multiple|m[uú]ltipla)$/i;
/** A list item's marker, then its box: "- [x] ", "1. ", "* [ ] ". */
const ITEM = /^([ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))(?:\[([ xX])\](?:[ \t]+|$))?/;

export interface MarkdownQuiz {
  /** Shaped like a quiz.json, for ImportedQuizSchema to check. */
  quiz: Record<string, unknown>;
  problems: ImportProblem[];
}

/** Reads a Markdown quiz; null when the text has no headings, and so is not one at all. */
export function parseMarkdownQuiz(source: string): MarkdownQuiz | null {
  const lines = source.split('\n');
  const all = blocksOf(source);
  if (!all.some((block) => block.kind === 'heading')) return null;

  const [first, ...rest] = all;
  if (first?.kind !== 'heading' || first.depth !== 1) return { quiz: {}, problems: [{ code: 'md_no_title' }] };

  const problems: ImportProblem[] = [];
  const raw = (block: Block) => lines.slice(block.start, block.end).join('\n').trim();
  const lineOf = (block: Block) => block.start + 1;

  const quiz: Record<string, unknown> = {};
  const title = splitSettings(first.text);
  quiz.title = title.text;
  for (const setting of title.settings) {
    const seconds = timeOf(setting);
    if (seconds !== null) quiz.defaultTimeLimitS = seconds;
    else problems.push({ code: 'md_setting', line: lineOf(first), setting });
  }

  // What comes before the first question describes the quiz; each "##" starts one.
  const description: Block[] = [];
  const sections: { heading: Block; blocks: Block[] }[] = [];
  for (const block of rest) {
    if (block.kind === 'heading' && block.depth === 1) problems.push({ code: 'md_extra_title', line: lineOf(block) });
    else if (block.kind === 'heading' && block.depth === 2) sections.push({ heading: block, blocks: [] });
    else (sections.at(-1)?.blocks ?? description).push(block);
  }
  quiz.description = description.map(raw).join('\n\n');

  quiz.questions = sections.map(({ heading, blocks }) => {
    const question: Record<string, unknown> = {};
    const { text, settings } = splitSettings(heading.text);
    for (const setting of settings) {
      const seconds = timeOf(setting);
      if (seconds !== null) question.timeLimitS = seconds;
      else if (MULTIPLE.test(setting)) question.selection = 'multiple';
      else problems.push({ code: 'md_setting', line: lineOf(heading), setting });
    }

    // The options are the list that ends the question; anything after it is a mistake.
    const last = blocks.findLastIndex((block) => block.kind === 'list');
    const list = last >= 0 ? blocks[last] : undefined;
    const after = last >= 0 ? blocks[last + 1] : undefined;
    if (after) problems.push({ code: 'md_after_options', line: lineOf(after) });

    const body = last >= 0 ? blocks.slice(0, last) : blocks;
    question.body = [text, ...body.map(raw)].filter(Boolean).join('\n\n');

    const options = list ? list.items.map((item) => optionAt(lines, item)) : [];
    const boxed = options.filter((option) => option.correct !== null).length;
    if (list && boxed > 0 && boxed < options.length) problems.push({ code: 'md_mixed_options', line: lineOf(list) });
    // Options without boxes have nothing to mark right: the question is a poll.
    question.kind = options.length > 0 && boxed === 0 ? 'poll' : 'quiz';
    question.options = options.map((option) => ({ body: option.body, correct: option.correct === true }));
    return question;
  });

  // In the order of the file, which is how its author will go through them.
  const lineOfProblem = (problem: ImportProblem) => ('line' in problem ? problem.line : 0);
  problems.sort((a, b) => lineOfProblem(a) - lineOfProblem(b));
  return { quiz, problems };
}

function blocksOf(source: string): Block[] {
  const tokens = parser.parse(source, {});
  const blocks: Block[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.level !== 0 || token.nesting === -1 || !token.map) continue;
    // Lines of "---" between questions, and comments, are for whoever reads the file.
    if (token.type === 'hr' || (token.type === 'html_block' && token.content.trimStart().startsWith('<!--'))) continue;

    const [start, end] = token.map;
    const block: Block = { kind: 'other', depth: 0, start, end, text: '', items: [] };
    if (token.type === 'heading_open') {
      block.kind = 'heading';
      block.depth = Number(token.tag.slice(1));
      block.text = tokens[i + 1]?.content ?? '';
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      block.kind = 'list';
      for (let j = i + 1; j < tokens.length && tokens[j]!.level > 0; j++) {
        const inner = tokens[j]!;
        if (inner.type === 'list_item_open' && inner.level === 1 && inner.map) block.items.push([inner.map[0], inner.map[1]]);
      }
    }
    blocks.push(block);
  }
  return blocks;
}

/** An option's text without its marker and box, and whether the box is ticked (null: no box). */
function optionAt(lines: string[], [start, end]: [number, number]): { body: string; correct: boolean | null } {
  const [first = '', ...rest] = lines.slice(start, end);
  const match = ITEM.exec(first);
  // Continuation lines are indented to line up with the text after the marker.
  const indent = match?.[1]?.length ?? 0;
  const dedent = (line: string) => line.slice(Math.min(indent, line.length - line.trimStart().length));
  const body = [first.slice(match?.[0].length ?? 0), ...rest.map(dedent)].join('\n').trim();
  const box = match?.[2];
  return { body, correct: box === undefined ? null : box !== ' ' };
}

function splitSettings(heading: string): { text: string; settings: string[] } {
  const match = SETTINGS.exec(heading);
  const settings = match?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!match || settings.length === 0 || !settings.every((setting) => SETTING_LIKE.test(setting))) {
    return { text: heading.trim(), settings: [] };
  }
  return { text: heading.slice(0, match.index).trim(), settings };
}

/** The seconds in a time=N setting, or null when it is not one or is out of range. */
function timeOf(setting: string): number | null {
  const match = TIME.exec(setting);
  const seconds = match ? Number(match[1]) : NaN;
  return seconds >= LIMITS.minTimeLimitS && seconds <= LIMITS.maxTimeLimitS ? seconds : null;
}
