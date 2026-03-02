# Validate README.md Instructions — Tasks

## User Story Summary

- **Title:** Validate README.md Instructions
- **Description:** Run every command documented in the README.md and verify it works correctly. This validation ensures the README is not aspirational documentation — every instruction has been tested and produces the expected result. Each validation task focuses on a specific category of commands.
- **Status:** Not Started
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Total Tasks:** 6
- **Dependencies:** Generate Comprehensive README.md (User Story 1)

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Validate Build Instructions](./validate-build-instructions.md) | Run build commands from README, verify zero errors and expected output | Not Started | build-engineer | None |
| [Validate Type Checking](./validate-type-checking.md) | Run type check command, verify zero type errors across all packages | Not Started | build-engineer | None |
| [Validate Test Suite](./validate-test-suite.md) | Run test command, verify all tests pass and coverage meets 90% threshold | Not Started | qa-expert | None |
| [Validate Dev Server Startup](./validate-dev-server-startup.md) | Run dev server, verify startup and URL accessibility | Not Started | qa-expert | None |
| [Validate Linting and Formatting](./validate-linting-and-formatting.md) | Run lint and format commands, verify zero errors/warnings | Not Started | code-reviewer | None |
| [Validate Deployment Dry Run](./validate-deployment-dry-run.md) | Run terraform plan (no apply), verify plan completes without errors | Not Started | deployment-engineer | None |

## Dependency Graph

```
Validate Build Instructions       (independent)
Validate Type Checking            (independent)
Validate Test Suite               (independent)
Validate Dev Server Startup       (independent)
Validate Linting and Formatting   (independent)
Validate Deployment Dry Run       (independent)
```

All six tasks are independent and can run in parallel. Each validates a different category of README instructions.

## Suggested Implementation Order

1. **Phase 1 (all parallel):** All six validation tasks can run concurrently. Each is a standalone verification of a specific README section.

## Validation Protocol

Each validation task follows the same protocol:
1. Read the corresponding README section
2. Execute every command exactly as documented
3. Verify the expected output/result
4. If a command fails: fix the README or fix the underlying issue
5. Document the validation result (pass/fail with details)
