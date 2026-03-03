# Project Learnings (Agent Memory)

- [pnpm]: Use `npx pnpm` in environments where corepack isn't enabled (permission issues with `corepack enable`)
- [gitignore]: Always add node_modules/ to .gitignore when initializing a monorepo — the pre-existing .gitignore may not include it
- [eslint]: ESLint v9 flat config uses `eslint-config-prettier/flat` import path for flat config compatibility
- [monorepo]: Root package.json scripts use `pnpm -r run <script>` for recursive workspace execution
- [eslint]: Wrap numbers in `String()` inside template literals — `@typescript-eslint/restrict-template-expressions` forbids bare number interpolation
- [eslint]: Avoid single-use type parameters in generics (`@typescript-eslint/no-unnecessary-type-parameters`) — use `unknown` return + cast at call site instead of `<T>() => T`
- [eslint]: Don't use rest-destructuring to omit fields (e.g. `const { foo: _foo, ...rest } = obj`) — `@typescript-eslint/no-unused-vars` flags the discarded var. Instead, construct the desired object explicitly without the omitted field
- [deps]: Always add runtime dependencies to package.json before importing them — missing `react-hook-form`, `@hookform/resolvers`, or `date-fns` causes cascading `import-x/no-unresolved` and `@typescript-eslint/no-unsafe-*` errors
- [eslint/no-unnecessary-type-conversion]: Don't wrap strings in `String()` — `@typescript-eslint/no-unnecessary-type-conversion` flags redundant conversions
- [eslint/no-unnecessary-condition]: When casting with `as number`, use `as number | undefined` if the value may be undefined — otherwise `?? fallback` is flagged as unnecessary
- [eslint/no-unnecessary-condition]: Don't use `?.` on properties that are always present when the parent exists (e.g. `data?.pagination.total` not `data?.pagination?.total`)
- [testing]: When mocking `@laila/database`, include ALL imported functions (e.g. `writeAuditEvent`) — missing mocked exports become `undefined` and cause runtime TypeErrors (500s)
- [testing]: When handler response shape changes, update test assertions to match — check `data.task.status` / `data.cascading_updates.unblocked_tasks` not legacy shapes
- [query-hooks]: When adding new UI components that import hooks from `@/lib/query-hooks`, ensure the hooks are actually defined in that file — missing exports cause cascading `@typescript-eslint/no-unsafe-*` errors on every usage site
