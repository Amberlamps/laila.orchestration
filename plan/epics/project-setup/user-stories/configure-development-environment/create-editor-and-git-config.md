# Create Editor and Git Config

## Task Details

- **Title:** Create Editor and Git Config
- **Status:** Not Started
- **Assigned Agent:** tooling-engineer
- **Parent User Story:** [Configure Development Environment](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None

## Description

Create editor configuration files and Git configuration files that ensure a consistent development experience across the team, regardless of individual IDE preferences. These files standardize indentation, line endings, file encoding, and Git behavior.

Additionally, configure VS Code recommended extensions and workspace settings to provide the best possible development experience for the primary IDE in the team.

## Acceptance Criteria

- [ ] `.editorconfig` exists with settings for indentation (2 spaces), charset (utf-8), end-of-line (lf), insert final newline, trim trailing whitespace
- [ ] `.editorconfig` has overrides for `*.md` (trim_trailing_whitespace = false) and `Makefile` (indent_style = tab)
- [ ] `.gitignore` exists with comprehensive entries for: `node_modules/`, `dist/`, `.next/`, `.env`, `.env.local`, `.env*.local`, `*.tsbuildinfo`, `.turbo/`, coverage reports, OS files (`.DS_Store`, `Thumbs.db`), IDE files
- [ ] `.gitattributes` exists with `* text=auto eol=lf` for consistent line endings across platforms
- [ ] `.gitattributes` marks `pnpm-lock.yaml` as binary (linguist-generated) to reduce diff noise
- [ ] `.vscode/extensions.json` exists recommending: ESLint, Prettier, Tailwind CSS IntelliSense, TypeScript, Drizzle, GitLens
- [ ] `.vscode/settings.json` exists with: format on save (Prettier as default formatter), ESLint auto-fix on save, TypeScript SDK version using workspace, Tailwind CSS settings
- [ ] All files use LF line endings

## Technical Notes

- `.editorconfig` is supported natively by most editors and via plugins for others — it provides a lowest-common-denominator configuration
- VS Code settings should enable format-on-save with Prettier as the default formatter:
  ```jsonc
  // .vscode/settings.json
  // Workspace-level VS Code settings for consistent developer experience
  {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": "explicit"
    },
    "typescript.tsdk": "node_modules/typescript/lib",
    "typescript.enablePromptUseWorkspaceTsdk": true
  }
  ```
- `.vscode/extensions.json` should use the `recommendations` array:
  ```jsonc
  {
    "recommendations": [
      "esbenp.prettier-vscode",
      "dbaeumer.vscode-eslint",
      "bradlc.vscode-tailwindcss",
      "ms-vscode.vscode-typescript-next",
      "eamodio.gitlens"
    ]
  }
  ```
- Do not include `.vscode/` in `.gitignore` — these are workspace-level settings that should be shared
- `.gitignore` should include `.env*` patterns but NOT `.env.example` (use negation: `!.env.example`)

## References

- **Functional Requirements:** Consistent developer experience
- **Design Specification:** Editor and Git configuration standards
- **Project Setup:** Development environment standardization

## Estimated Complexity

Small — Static configuration files with well-known content. No logic or integration complexity.
