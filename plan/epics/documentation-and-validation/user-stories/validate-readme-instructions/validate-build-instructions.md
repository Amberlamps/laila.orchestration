# Validate Build Instructions

## Task Details

- **Title:** Validate Build Instructions
- **Status:** Not Started
- **Assigned Agent:** build-engineer
- **Parent User Story:** [Validate README.md Instructions](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None (depends on User Story 1: Generate Comprehensive README.md)

## Description

Run the build commands documented in the README and verify they complete with zero errors and produce the expected output artifacts. This validates both the README accuracy and the build system's correctness.

### Validation Steps

```bash
# Step 1: Clean install (simulate a new developer)
rm -rf node_modules
pnpm install --frozen-lockfile

# Step 2: Run the full build
pnpm build:all

# Step 3: Verify Next.js build output
# Expected: .next/ directory with pages and API routes compiled
ls -la .next/

# Step 4: Verify OpenNext output
# Expected: .open-next/ directory with server function and assets
ls -la .open-next/

# Step 5: Verify Lambda function bundles
# Expected: dist/ directory in each function with handler.js
ls -la functions/timeout-checker/dist/
ls -la functions/dag-reconciler/dist/
ls -la functions/audit-archiver/dist/
ls -la functions/status-propagation/dist/

# Step 6: Verify individual package builds
pnpm --filter @laila/timeout-checker build
pnpm --filter @laila/dag-reconciler build

# Step 7: Record results
# All commands must exit with code 0
# All expected artifacts must exist
```

### Success Criteria

- `pnpm install --frozen-lockfile` exits with code 0
- `pnpm build:all` exits with code 0 with no error output
- `.next/` directory exists with compiled pages
- `.open-next/` directory exists with server function and assets
- Each `functions/*/dist/handler.js` file exists
- Individual package builds work via `--filter`

## Acceptance Criteria

- [ ] `pnpm install --frozen-lockfile` succeeds without errors
- [ ] `pnpm build:all` completes with exit code 0
- [ ] Next.js build produces expected output in `.next/`
- [ ] OpenNext build produces expected output in `.open-next/`
- [ ] All four Lambda function bundles exist in their `dist/` directories
- [ ] Individual package build commands from the README work correctly
- [ ] Build time is reasonable (under 5 minutes on CI runner)
- [ ] No TypeScript errors during build
- [ ] No warnings that indicate potential issues

## Technical Notes

- The validation should be run from a clean state (after `rm -rf node_modules`) to simulate a new developer's experience.
- Build artifacts are not committed to Git. They are produced on each build and deployed via CI/CD.
- If any build command fails, determine whether the README is wrong (fix the documentation) or the build is broken (fix the code/config).

## References

- **README Section:** Building (from Task: Write Installation and Development Guide)
- **Build Tools:** Next.js, OpenNext, tsup

## Estimated Complexity

Low — Running documented commands and verifying output. The main effort is in fixing any issues discovered during validation.
