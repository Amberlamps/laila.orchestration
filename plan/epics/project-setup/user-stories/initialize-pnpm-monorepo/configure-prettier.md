# Configure Prettier

## Task Details

- **Title:** Configure Prettier
- **Status:** Complete
- **Assigned Agent:** tooling-engineer
- **Parent User Story:** [Initialize pnpm Monorepo Workspace](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** Create Root Workspace Configuration

## Description

Set up Prettier v3 at the monorepo root for consistent code formatting across all workspace packages. The configuration should include the Tailwind CSS plugin for automatic class sorting in JSX/TSX files.

Prettier v3 is ESM-first and uses a `.prettierrc` (JSON) or `prettier.config.mjs` (ESM) configuration file. The configuration should establish consistent formatting rules that the entire team follows, eliminating formatting debates in code reviews.

The Tailwind CSS plugin (`prettier-plugin-tailwindcss`) automatically sorts Tailwind utility classes in the recommended order, improving readability and reducing merge conflicts caused by arbitrary class ordering.

## Acceptance Criteria

- [ ] `.prettierrc` (or `prettier.config.mjs`) exists at the monorepo root
- [ ] `printWidth` is set to `100`
- [ ] `singleQuote` is set to `true`
- [ ] `trailingComma` is set to `"all"`
- [ ] `semi` is set to `true` (explicit semicolons)
- [ ] `tabWidth` is set to `2`
- [ ] `useTabs` is set to `false`
- [ ] `prettier-plugin-tailwindcss` is configured in the `plugins` array
- [ ] `.prettierignore` exists and excludes `node_modules`, `dist`, `.next`, `pnpm-lock.yaml`, `drizzle/`, and generated files
- [ ] `pnpm format` runs Prettier write mode across the workspace
- [ ] `pnpm format:check` runs Prettier check mode (for CI) and returns non-zero exit code on unformatted files
- [ ] Prettier and ESLint do not conflict (ESLint formatting rules are disabled via `eslint-config-prettier` or equivalent)
- [ ] All Prettier dependencies are installed as devDependencies in the root package.json

## Technical Notes

- Install `prettier`, `prettier-plugin-tailwindcss` as root devDependencies
- Ensure `eslint-config-prettier` (or the flat config equivalent) is included in the ESLint configuration to disable rules that conflict with Prettier
- The Tailwind CSS plugin requires `tailwindcss` to be installed to resolve the config; it will work correctly once the web app package with Tailwind is scaffolded
- Use `prettier --write .` for formatting and `prettier --check .` for CI validation
- Consider adding `arrowParens: "always"` for consistency with TypeScript generic syntax
- Prettier v3 supports `.prettierrc` in JSON format — no need for ESM config unless plugins require dynamic configuration

## References

- **Functional Requirements:** Consistent code formatting
- **Design Specification:** Prettier v3, Tailwind CSS class sorting
- **Project Setup:** Formatting configuration

## Estimated Complexity

Small — Standard Prettier configuration with minimal decision-making. The Tailwind plugin is a drop-in addition. Primary concern is ensuring ESLint/Prettier compatibility.
