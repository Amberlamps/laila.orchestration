# Project Learnings (Agent Memory)

- [pnpm]: Use `npx pnpm` in environments where corepack isn't enabled (permission issues with `corepack enable`)
- [gitignore]: Always add node_modules/ to .gitignore when initializing a monorepo — the pre-existing .gitignore may not include it
- [eslint]: ESLint v9 flat config uses `eslint-config-prettier/flat` import path for flat config compatibility
- [monorepo]: Root package.json scripts use `pnpm -r run <script>` for recursive workspace execution
- [eslint]: Wrap numbers in `String()` inside template literals — `@typescript-eslint/restrict-template-expressions` forbids bare number interpolation
- [eslint]: Avoid single-use type parameters in generics (`@typescript-eslint/no-unnecessary-type-parameters`) — use `unknown` return + cast at call site instead of `<T>() => T`
