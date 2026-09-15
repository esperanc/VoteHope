import { describe, expect, it } from 'vitest';
import en from '../src/client/i18n/en.ts';
import { toCsv } from '../src/client/lib/csv.ts';
import { spreadsheetTime } from '../src/client/lib/format.ts';
import { resultsCsv } from '../src/client/lib/results.ts';
import type { SessionResults } from '../src/shared/session.ts';
import { sampleQuiz } from './helpers.ts';

const t = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));

describe('toCsv', () => {
  it('starts with a byte-order mark and ends every line with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']], ',')).toBe('﻿a,b\r\nc,d\r\n');
  });

  it('quotes cells containing separators, quotes or line breaks', () => {
    expect(toCsv([['x;y', 'say "hi"', 'two\nlines', 'plain']], ';')).toBe(
      '﻿"x;y";"say ""hi""";"two\nlines";plain\r\n',
    );
  });

  it('neutralizes cells that a spreadsheet would run as formulas', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '@a', 'ok']], ',')).toBe(`﻿"'=HYPERLINK(""x"")",'+1,'@a,ok\r\n`);
  });
});

describe('resultsCsv', () => {
  it('writes one row per participant, by name, with the letters they chose', () => {
    const quiz = sampleQuiz(); // Q1: single answer a / b (correct); Q2: poll x / y
    const [single, poll] = quiz.questions;
    const started = '2026-09-15T12:00:00.000Z';
    const finished = '2026-09-15T12:07:00.000Z';
    const results: SessionResults = {
      session: { title: 'Sample', code: '123456' } as SessionResults['session'],
      questions: quiz.questions,
      participants: [
        {
          id: 2,
          name: 'Bia',
          email: null,
          status: 'in_progress',
          endReason: null,
          joinedAt: started,
          startedAt: started,
          submittedAt: null,
          correct: 0,
          answered: 1,
          answers: { [poll!.id]: { optionIds: ['y', 'x'], correct: null } },
        },
        {
          id: 1,
          name: 'Ana',
          email: 'ana@escola.br',
          status: 'finished',
          endReason: 'submitted',
          joinedAt: started,
          startedAt: started,
          submittedAt: finished,
          correct: 1,
          answered: 1,
          answers: { [single!.id]: { optionIds: ['b'], correct: true } },
        },
      ],
    };

    const lines = resultsCsv(results, { separator: ';', t, locale: 'en' }).slice(1).trimEnd().split('\r\n');
    expect(lines).toEqual([
      'Name;Email;Status;Started;Finished;Score;Total;Q1;Q2',
      `Ana;ana@escola.br;Submitted;${spreadsheetTime(started)};${spreadsheetTime(finished)};1;1;B;`,
      `Bia;;Answering;${spreadsheetTime(started)};;0;1;;A+B`,
    ]);
  });
});
