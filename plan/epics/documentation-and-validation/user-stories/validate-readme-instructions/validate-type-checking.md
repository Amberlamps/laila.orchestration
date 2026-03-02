# Validate Type Checking

## Task Details

- **Title:** Validate Type Checking
- **Status:** Not Started
- **Assigned Agent:** build-engineer
- **Parent User Story:** [Validate README.md Instructions](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None (depends on User Story 1: Generate Comprehensive README.md)

## Description

Run the type check command documented in the README and verify zero TypeScript errors across all packages in the monorepo. This validates that the entire codebase compiles cleanly under strict TypeScript settings.

### Validation Steps

```bash
# Step 1: Run type check across all packages
pnpm typecheck

# Step 2: Verify exit code is 0
echo $?  # Must be 0

# Step 3: Run type check on individual packages (as documented in README)
pnpm --filter @laila/timeout-checker typecheck
pnpm --filter @laila/dag-reconciler typecheck
pnpm --filter @laila/audit-archiver typecheck
pnpm --filter @laila/status-propagation typecheck
pnpm --filter @laila/shared typecheck
pnpm --filter @laila/domain typecheck
pnpm --filter @laila/logger typecheck
pnpm --filter @laila/metrics typecheck

# Step 4: Verify no `any` types exist in the codebase
# (enforced by @typescript-eslint/no-explicit-any ESLint rule)
```

### Success Criteria

- `pnpm typecheck` exits with code 0
- Zero TypeScript errors reported
- All individual package type checks pass
- No `any` types in source or test code

## Acceptance Criteria

- [ ] `pnpm typecheck` exits with code 0
- [ ] Zero type errors are reported across all packages
- [ ] Individual package type checks work via the documented `--filter` syntax
- [ ] Strict mode is verified as enabled (`strict: true` in `tsconfig.json`)
- [ ] `noUncheckedIndexedAccess` is verified as enabled
- [ ] No `any` types exist in the codebase (verified via ESLint or grep)

## Technical Notes

- `pnpm typecheck` runs `tsc --noEmit` in every package. This is faster than a full build because it skips code generation.
- Strict mode includes: `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`, `alwaysStrict`.
- `noUncheckedIndexedAccess` adds `| undefined` to array/object index access. This catches a common source of runtime errors at compile time.

## References

- **README Section:** Type Checking (from Task: Write Testing and Quality Guide)
- **TypeScript Configuration:** `tsconfig.json` and `tsconfig.base.json`

## Estimated Complexity

Low — Running a single command and verifying the output. If type errors exist, fixing them may increase complexity.
