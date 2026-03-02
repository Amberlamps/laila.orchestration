# Configure ESLint Flat Config

## Task Details

- **Title:** Configure ESLint Flat Config
- **Status:** Complete
- **Assigned Agent:** tooling-engineer
- **Parent User Story:** [Initialize pnpm Monorepo Workspace](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** Create Root Workspace Configuration

## Description

Set up ESLint v9 using the new flat config format (`eslint.config.mjs`) at the monorepo root. The configuration should enforce strict TypeScript rules, React best practices, accessibility standards, import ordering, and Drizzle ORM-specific rules.

The flat config format replaces the legacy `.eslintrc.*` approach and uses a single exported array of configuration objects. Each object can target specific file patterns and apply different rule sets. This is ESLint v9's default and only supported configuration format.

Key plugins and rule sets to configure:

- `@typescript-eslint` with strict type-checked rules (requires `parserOptions.project` pointing to tsconfig files)
- `eslint-plugin-react` and `eslint-plugin-react-hooks` for React rules
- `eslint-plugin-jsx-a11y` for accessibility enforcement
- `eslint-plugin-import-x` (the maintained fork of eslint-plugin-import) for import ordering and validation
- `eslint-plugin-drizzle` to enforce safe Drizzle ORM query patterns
- Explicit ban on `any` type usage via `@typescript-eslint/no-explicit-any: "error"`

## Acceptance Criteria

- [ ] `eslint.config.mjs` exists at the monorepo root using flat config array format
- [ ] `@typescript-eslint/strict-type-checked` configuration is applied to all `.ts` and `.tsx` files
- [ ] `@typescript-eslint/no-explicit-any` is set to `"error"`
- [ ] `eslint-plugin-react` and `eslint-plugin-react-hooks` rules are applied to `.tsx` and `.jsx` files
- [ ] `eslint-plugin-jsx-a11y` recommended rules are enabled
- [ ] `eslint-plugin-import-x` is configured with proper TypeScript resolver and import ordering rules
- [ ] `eslint-plugin-drizzle` recommended rules are enabled for database package files
- [ ] Test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`) have relaxed rules where appropriate (e.g., allow non-null assertions)
- [ ] Configuration files (`*.config.ts`, `*.config.mjs`) are excluded from strict type-checked rules
- [ ] `pnpm lint` runs ESLint across all workspace packages without errors on an empty project
- [ ] All ESLint plugins are installed as devDependencies in the root package.json

## Technical Notes

- Use `typescript-eslint` v8+ which has native flat config support via `tseslint.config()` helper
- The `parserOptions.project` should use `true` (automatic tsconfig discovery) or reference specific tsconfig paths for each workspace
- Consider using `tseslint.configs.strictTypeChecked` as the base, then layering additional rules on top
- For `eslint-plugin-import-x`, configure the TypeScript resolver: `import-x/resolver-typescript`
- Apply Drizzle rules only to files in `packages/database` using file pattern matching in the flat config
- Ignore patterns should include `node_modules`, `dist`, `.next`, `drizzle/` (migrations), and generated files
- The flat config supports `ignores` at the top level as a global ignore configuration

## References

- **Functional Requirements:** Code quality enforcement, no-any policy
- **Design Specification:** ESLint v9 flat config, TypeScript strict rules
- **Project Setup:** Linting configuration

## Estimated Complexity

Medium — ESLint v9 flat config with type-checked rules requires careful setup of parser options and plugin compatibility. Multiple plugins need to work together, and file-pattern-based rule targeting adds configuration complexity.
