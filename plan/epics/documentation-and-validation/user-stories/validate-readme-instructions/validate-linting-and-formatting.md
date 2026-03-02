# Validate Linting and Formatting

## Task Details

- **Title:** Validate Linting and Formatting
- **Status:** Not Started
- **Assigned Agent:** code-reviewer
- **Parent User Story:** [Validate README.md Instructions](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None (depends on User Story 1: Generate Comprehensive README.md)

## Description

Run the lint and format commands documented in the README and verify zero errors and zero warnings. This validates that the codebase meets all linting standards and formatting conventions.

### Validation Steps

```bash
# Step 1: Run the linter
pnpm lint

# Step 2: Verify exit code is 0 (zero errors, zero warnings)
echo $?  # Must be 0

# Step 3: Run the format checker (without auto-fixing)
pnpm format:check

# Step 4: Verify exit code is 0 (all files are correctly formatted)
echo $?  # Must be 0

# Step 5: Verify the no-any ESLint rule is active
# Attempt to add a line with `any` type and verify lint catches it
# (manual verification step)

# Step 6: Verify pre-commit hooks are installed
ls -la .husky/pre-commit
# Expected: pre-commit hook file exists and is executable
```

### Success Criteria

- `pnpm lint` exits with code 0 (zero errors, zero warnings)
- `pnpm format:check` exits with code 0 (all files formatted)
- ESLint `no-explicit-any` rule is active and catches `any` usage
- Pre-commit hooks are installed and executable

## Acceptance Criteria

- [ ] `pnpm lint` exits with code 0
- [ ] Zero ESLint errors across all packages
- [ ] Zero ESLint warnings across all packages
- [ ] `pnpm format:check` exits with code 0
- [ ] All source files are correctly formatted by Prettier
- [ ] The `@typescript-eslint/no-explicit-any` rule is configured and enforced
- [ ] Pre-commit hook file exists at `.husky/pre-commit`
- [ ] Pre-commit hook is executable
- [ ] Running `pnpm format` makes no changes (codebase is already formatted)

## Technical Notes

- Zero warnings is important because warnings often indicate real issues that are ignored over time. The lint configuration should use `error` severity for all meaningful rules.
- `pnpm format:check` runs Prettier in check mode (returns non-zero if any file needs formatting) without modifying files. This is the same check that runs in CI.
- The pre-commit hook should run lint-staged, which only lints and formats staged files (not the entire codebase). This keeps the hook fast.
- If `pnpm format` modifies files, commit the formatting changes before marking this validation as passed.

## References

- **README Section:** Linting & Formatting (from Task: Write Testing and Quality Guide)
- **ESLint:** https://eslint.org/
- **Prettier:** https://prettier.io/
- **husky:** https://typicode.github.io/husky/

## Estimated Complexity

Low — Running lint and format commands. Fixing any issues found may require code changes across multiple files.
