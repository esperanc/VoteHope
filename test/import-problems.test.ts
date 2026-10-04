import { describe, expect, it } from 'vitest';
import en from '../src/client/i18n/en.ts';
import pt from '../src/client/i18n/pt.ts';
import { describeProblem, whereIs } from '../src/client/lib/transfer.ts';

const translator =
  (dictionary: typeof en) =>
  (key: keyof typeof en, params: Record<string, string | number> = {}) =>
    dictionary[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));

const t = translator(en);

describe('import problems as sentences', () => {
  it('counts questions and options from 1', () => {
    expect(whereIs(['questions', 2, 'options', 0, 'correct'], t)).toBe('Question 3 › option 1 › correct');
    expect(whereIs(['questions', 0], t)).toBe('Question 1');
    expect(whereIs(['title'], translator(pt))).toBe('title');
    expect(whereIs(['questions', 4, 'body'], translator(pt))).toBe('Pergunta 5 › body');
  });

  it('shows a lost backslash together with the fix', () => {
    const text = describeProblem({ code: 'escape', path: ['questions', 0, 'body'], command: '\\theta' }, t);
    expect(text).toContain('Question 1 › body: “\\theta”');
    expect(text).toContain('Write “\\\\theta”');
  });

  it('leaves out the place when a problem concerns the whole file', () => {
    expect(describeProblem({ code: 'field', path: [], message: 'Invalid input' }, t)).toBe('Invalid input');
  });
});
