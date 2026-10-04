import { describe, expect, it } from 'vitest';
import { parseMarkdownQuiz } from '../src/server/markdownQuiz.ts';

const parse = (lines: string[]) => parseMarkdownQuiz(lines.join('\n'));

describe('Markdown quizzes', () => {
  it('reads the title, the description, the questions and their options', () => {
    const result = parse([
      '# Derivadas {tempo=45}',
      '',
      'Para começar a aula.',
      '',
      '## Observe o gráfico {time=20}',
      '',
      '![Gráfico de f](media/f.png)',
      '',
      'Onde $f$ é decrescente?',
      '',
      '- [ ] $(-\\infty, 0)$',
      '- [x] $(0, 2)$',
      '  e só ali',
      '',
      '---',
      '<!-- a note for whoever edits this file -->',
      '',
      '## Quais tópicos você gostou? {múltipla}',
      '',
      '1. Limites',
      '2. Derivadas',
    ]);
    expect(result).toEqual({
      problems: [],
      quiz: {
        title: 'Derivadas',
        defaultTimeLimitS: 45,
        description: 'Para começar a aula.',
        questions: [
          {
            body: 'Observe o gráfico\n\n![Gráfico de f](media/f.png)\n\nOnde $f$ é decrescente?',
            timeLimitS: 20,
            kind: 'quiz',
            options: [
              { body: '$(-\\infty, 0)$', correct: false },
              { body: '$(0, 2)$\ne só ali', correct: true },
            ],
          },
          {
            // Options without boxes: a poll.
            body: 'Quais tópicos você gostou?',
            selection: 'multiple',
            kind: 'poll',
            options: [
              { body: 'Limites', correct: false },
              { body: 'Derivadas', correct: false },
            ],
          },
        ],
      },
    });
  });

  it('keeps formulas exactly as typed, single backslashes and all', () => {
    const result = parse(['# T', '## Calcule $\\frac{1}{2} + \\theta \\neq \\nabla f$', '- [x] $a \\times b$', '- [ ] b']);
    const [question] = result!.quiz.questions as { body: string; options: { body: string }[] }[];
    expect(question!.body).toBe('Calcule $\\frac{1}{2} + \\theta \\neq \\nabla f$');
    expect(question!.options[0]!.body).toBe('$a \\times b$');
  });

  it('leaves braces that are not settings in the text', () => {
    const result = parse(['# T', '## Qual é o menor elemento de {3, 1, 2}', '- [x] 1', '- [ ] 2']);
    expect(result!.problems).toEqual([]);
    expect(result!.quiz.questions).toEqual([expect.objectContaining({ body: 'Qual é o menor elemento de {3, 1, 2}' })]);
  });

  it('starts a question with what follows a bare "##", such as a picture', () => {
    const result = parse(['# T', '##', '', '![f](media/f.png)', '', 'Qual é o máximo?', '', '- [x] 1', '- [ ] 2']);
    expect(result!.quiz.questions).toEqual([expect.objectContaining({ body: '![f](media/f.png)\n\nQual é o máximo?' })]);
  });

  it('reports mistakes with their line numbers, top to bottom', () => {
    const result = parse([
      '# T {multiple}', // 1: not a setting for the whole quiz
      '## A {tmpo=20}', // 2: misspelt
      '- [x] a', // 3: boxes and…
      '- b', // 4: …a plain item
      '',
      'Explicação depois.', // 6: after the options
      '## B {time=3}', // 7: under 5 seconds
      '- [x] a',
      '# Outro título', // 9
    ]);
    expect(result!.problems).toEqual([
      { code: 'md_setting', line: 1, setting: 'multiple' },
      { code: 'md_setting', line: 2, setting: 'tmpo=20' },
      { code: 'md_mixed_options', line: 3 },
      { code: 'md_after_options', line: 6 },
      { code: 'md_setting', line: 7, setting: 'time=3' },
      { code: 'md_extra_title', line: 9 },
    ]);
  });

  it('needs a title, and is not a quiz at all without headings', () => {
    expect(parseMarkdownQuiz('Algum texto.\n\n## A\n- [x] a')).toEqual({ quiz: {}, problems: [{ code: 'md_no_title' }] });
    expect(parseMarkdownQuiz('apenas anotações\n- a\n- b')).toBeNull();
  });
});
