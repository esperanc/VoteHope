# VoteHope — working notes

- `SPEC.md` is the source of truth for product decisions; update it when a decision changes.
- Server TypeScript runs directly on Node (type stripping), with no build step:
  relative imports need `.ts` extensions, and only erasable syntax is allowed
  (no enums, namespaces or constructor parameter properties). `erasableSyntaxOnly` enforces this.
- TypeScript is pinned to 6.x because svelte-check does not support TS 7 yet.
- Database is the built-in `node:sqlite`. Schema changes are new entries appended to
  `src/server/migrations.ts`; never edit an entry that may have been applied.
- Every UI string goes in both `src/client/i18n/en.ts` and `pt.ts` (pt is type-checked
  against en). pt is Brazilian Portuguese.
- API errors are `{ error: "<code>" }`; the client translates codes into messages.
- Verify with `npm run check && npm test && npm run build`.
