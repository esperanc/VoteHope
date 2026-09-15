import { describe, expect, it } from 'vitest';
import { countIncompleteQuestions, findIssues, newQuestion, type Question } from '../src/shared/quiz.ts';
import { sampleQuiz } from './helpers.ts';

function question(overrides: Partial<Question>): Question {
  return {
    ...newQuestion(),
    body: 'Question?',
    options: [
      { id: 'a', body: 'A', correct: true },
      { id: 'b', body: 'B', correct: false },
    ],
    ...overrides,
  };
}

function codes(q: Question): string[] {
  return findIssues({ questions: [q] }).map((issue) => issue.code);
}

describe('findIssues', () => {
  it('accepts a complete quiz', () => {
    expect(findIssues(sampleQuiz())).toEqual([]);
  });

  it('reports an empty quiz', () => {
    expect(findIssues({ questions: [] })).toEqual([{ code: 'noQuestions' }]);
  });

  it('reports a brand-new question as incomplete', () => {
    expect(codes(newQuestion())).toEqual(['emptyBody', 'emptyOption', 'emptyOption', 'emptyOption', 'emptyOption', 'noCorrect']);
  });

  it('requires at least two options', () => {
    expect(codes(question({ options: [{ id: 'a', body: 'A', correct: true }] }))).toEqual(['tooFewOptions']);
  });

  it('flags repeated option texts', () => {
    const q = question({
      options: [
        { id: 'a', body: ' Same ', correct: true },
        { id: 'b', body: 'Same', correct: false },
      ],
    });
    expect(findIssues({ questions: [q] })).toEqual([{ code: 'duplicateOption', questionId: q.id, optionId: 'b' }]);
  });

  it('checks correct options according to the question type', () => {
    const none = [
      { id: 'a', body: 'A', correct: false },
      { id: 'b', body: 'B', correct: false },
    ];
    const both = none.map((o) => ({ ...o, correct: true }));
    expect(codes(question({ options: none }))).toEqual(['noCorrect']);
    expect(codes(question({ options: both }))).toEqual(['singleNeedsOneCorrect']);
    expect(codes(question({ selection: 'multiple', options: both }))).toEqual([]);
    expect(codes(question({ kind: 'poll', options: none }))).toEqual([]);
    expect(codes(question({ kind: 'poll', options: both }))).toEqual(['pollHasCorrect']);
  });

  it('counts questions, not issues', () => {
    expect(countIncompleteQuestions({ questions: [newQuestion(), newQuestion(), question({})] })).toBe(2);
  });
});
