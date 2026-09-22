# VoteHope — working notes

- `SPEC.md` is the source of truth for product decisions; update it when a decision changes.
- Server TypeScript runs directly on Node (type stripping), with no build step:
  relative imports need `.ts` extensions, and only erasable syntax is allowed
  (no enums, namespaces or constructor parameter properties). `erasableSyntaxOnly` enforces this.
- TypeScript is pinned to 6.x because svelte-check does not support TS 7 yet.
- Database is the built-in `node:sqlite`. Schema changes are new entries appended to
  `src/server/migrations.ts`; never edit an entry that may have been applied.
- Quiz content types, limits and completeness checks live in `src/shared/quiz.ts` (used by
  both server and client). The server validates structure with zod (`src/server/schemas.ts`);
  incomplete drafts are allowed and reported as issues, never rejected.
- Every UI string goes in both `src/client/i18n/en.ts` and `pt.ts` (pt is type-checked
  against en). pt is Brazilian Portuguese.
- API errors are `{ error: "<code>" }`; the client translates codes into messages.
- Svelte: never name a prop or variable `state` in a component that uses `$state` (the
  compiler treats `$state` as a store read of it).
- Students authenticate with a per-session token (`Authorization: Bearer`), kept in
  localStorage by `src/client/lib/play.ts`. Anything sent to students must not reveal
  correct options (`StudentQuestion` has no `correct` field; tests check the JSON).
- Server logic takes `now` as a parameter and routes pass `Date.now()`, so tests can
  freeze time with `vi.spyOn(Date, 'now')`.
- Live sessions: `src/server/live.ts` runs them over Socket.IO. Their state lives in
  `sessions.phase / question_index / deadline_ms` (so a restart resumes), and every change
  pushes complete views to the presenter and to each student (no incremental messages).
  `test/live.test.ts` uses real sockets against a listening server.
- Verify with `npm run check && npm test && npm run build`.
