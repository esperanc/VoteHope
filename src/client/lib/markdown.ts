import MarkdownIt from 'markdown-it';
import markdownItKatexModule from '@vscode/markdown-it-katex';
import katex from 'katex';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';

// The plugin is CommonJS: depending on the loader, its function is either the
// default export itself or that export's `.default`.
const markdownItKatex =
  (markdownItKatexModule as unknown as { default?: typeof markdownItKatexModule }).default ?? markdownItKatexModule;

// Raw HTML is disabled: question text is Markdown only. Single line breaks are
// kept, which is what people typing a question expect.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.use(markdownItKatex, { katex, throwOnError: false });

// Links open in a new tab, so students never navigate away from the quiz.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName.toLowerCase() === 'a') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Renders question text (Markdown with $…$ and $$…$$ formulas) to sanitized HTML. */
export function renderMarkdown(source: string): string {
  // Sanitizing matters for quizzes imported from someone else's file.
  return DOMPurify.sanitize(md.render(source), { USE_PROFILES: { html: true, mathMl: true, svg: true } });
}
