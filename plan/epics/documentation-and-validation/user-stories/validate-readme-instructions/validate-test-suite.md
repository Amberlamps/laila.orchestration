# Validate Test Suite

## Task Details

- **Title:** Validate Test Suite
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Validate README.md Instructions](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None (depends on User Story 1: Generate Comprehensive README.md)

## Description

Run the test commands documented in the README and verify all tests pass. Additionally, run the coverage command and verify coverage meets the documented 90% threshold across all packages.

### Validation Steps

```bash
# Step 1: Run all tests
pnpm test

# Step 2: Verify exit code is 0 (all tests pass)
echo $?  # Must be 0

# Step 3: Run tests with coverage
pnpm test:coverage

# Step 4: Verify coverage meets 90% threshold
# Check the coverage summary for:
# - Lines: >= 90%
# - Branches: >= 90%
# - Functions: >= 90%
# - Statements: >= 90%

# Step 5: Run individual package tests (as documented in README)
pnpm --filter @laila/timeout-checker test
pnpm --filter @laila/dag-reconciler test
pnpm --filter @laila/domain test

# Step 6: Verify no any types in test code
# Tests must use properly typed mocks (vi.fn<ReturnType>() instead of vi.fn() as any)
```

### Success Criteria

- `pnpm test` exits with code 0 (all tests pass)
- `pnpm test:coverage` reports >= 90% on all metrics
- Individual package test commands work
- No test uses `any` type for mocks or assertions

## Acceptance Criteria

- [ ] `pnpm test` exits with code 0
- [ ] All tests pass (zero failures, zero errors)
- [ ] `pnpm test:coverage` exits with code 0
- [ ] Line coverage is >= 90%
- [ ] Branch coverage is >= 90%
- [ ] Function coverage is >= 90%
- [ ] Statement coverage is >= 90%
- [ ] Individual package test commands work via `--filter`
- [ ] No `any` types are used in test code
- [ ] No flaky tests (run the suite 3 times, all 3 pass)

## Technical Notes

- The coverage threshold is configured in `vitest.config.ts` at the root level. If the threshold is not met, `pnpm test:coverage` should exit with a non-zero code.
- Flaky test detection: run the test suite multiple times to verify determinism. Common causes of flakiness: time-dependent tests without `vi.useFakeTimers()`, tests that depend on execution order, and tests with async race conditions.
- Coverage reports are generated in multiple formats: terminal summary (for quick review) and HTML (for detailed analysis).

## References

- **README Section:** Testing (from Task: Write Testing and Quality Guide)
- **Test Framework:** vitest (https://vitest.dev/)
- **Coverage:** vitest built-in coverage via v8 or istanbul

## Estimated Complexity

Low — Running documented commands and verifying output. Fixing failing tests or improving coverage may increase the effort.
