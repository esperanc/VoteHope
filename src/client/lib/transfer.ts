// Turns the problems the server found in an imported quiz file into sentences.

import type { ImportProblem, ProblemPath } from '../../shared/transfer.ts';
import type { MessageKey } from './i18n.svelte.ts';

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** "Question 3 › option 2 › correct" for ['questions', 2, 'options', 1, 'correct']. */
export function whereIs(path: ProblemPath, t: Translate): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
    const index = path[i + 1];
    if ((key === 'questions' || key === 'options') && typeof index === 'number') {
      parts.push(t(key === 'questions' ? 'import.question' : 'import.option', { n: index + 1 }));
      i++;
    } else {
      parts.push(String(key));
    }
  }
  return parts.join(' › ');
}

export function describeProblem(problem: ImportProblem, t: Translate): string {
  switch (problem.code) {
    case 'not_a_quiz':
      return t('import.notAQuiz');
    case 'encoding':
      return t('import.encoding');
    case 'json':
      return t('import.json', { message: problem.message });
    case 'field': {
      const where = whereIs(problem.path, t);
      return where ? `${where}: ${problem.message}` : problem.message;
    }
    case 'escape':
      return t('import.escape', {
        where: whereIs(problem.path, t),
        command: problem.command,
        doubled: `\\${problem.command}`,
      });
    case 'md_no_title':
      return t('import.mdNoTitle');
    case 'md_extra_title':
      return t('import.mdExtraTitle', { line: problem.line });
    case 'md_after_options':
      return t('import.mdAfterOptions', { line: problem.line });
    case 'md_mixed_options':
      return t('import.mdMixedOptions', { line: problem.line });
    case 'md_setting':
      return t('import.mdSetting', { line: problem.line, setting: problem.setting });
    case 'bad_zip':
      return t('import.badZip');
    case 'no_quiz_file':
      return t('import.noQuizFile');
    case 'missing_image':
      return t('import.missingImage', { name: problem.name });
    case 'bad_image':
      return t('import.badImage', { name: problem.name });
    case 'too_large':
      return t('import.tooLarge', { name: problem.name });
  }
}
