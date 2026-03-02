# Add Spec Freshness CI Check

## Task Details

- **Title:** Add Spec Freshness CI Check
- **Status:** Complete
- **Assigned Agent:** devops-engineer
- **Parent User Story:** [Create OpenAPI Specification](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** Configure Type Generation Pipeline, Configure Spectral Linting

## Description

Create a CI step that validates the generated TypeScript types in `packages/api-spec/generated/` are up-to-date with the OpenAPI specification. This prevents situations where a developer modifies `openapi.yaml` but forgets to regenerate the types, causing a drift between the spec and the TypeScript types used in the codebase.

The check works by re-running the generation script and comparing the output with the committed generated files. If there is any difference, the CI check fails with a clear message instructing the developer to run the generation command.

## Acceptance Criteria

- [ ] `packages/api-spec/scripts/check-freshness.sh` (or equivalent) exists
- [ ] The script re-runs type generation into a temporary location
- [ ] The script compares the temporary output with the committed `generated/` directory
- [ ] If files differ, the script exits with a non-zero code and prints a clear error message: "Generated types are out of date. Run `pnpm --filter @laila/api-spec generate` and commit the result."
- [ ] If files match, the script exits with code 0 and prints a success message
- [ ] `packages/api-spec/package.json` includes a `check:freshness` script that runs the check
- [ ] The CI workflow (`.github/workflows/ci.yml`) includes a step that runs the freshness check
- [ ] The freshness check correctly detects changes to schema definitions, path operations, and component additions/removals
- [ ] The check works reliably in CI (no false positives from line ending differences or timestamps in generated files)

## Technical Notes

- Freshness check script approach:

  ```bash
  #!/bin/bash
  # packages/api-spec/scripts/check-freshness.sh
  # Verifies that generated TypeScript types match the current OpenAPI spec
  # Fails if the developer modified openapi.yaml without regenerating types
  set -euo pipefail

  TEMP_DIR=$(mktemp -d)
  GENERATED_DIR="$(dirname "$0")/../generated"

  # Re-generate types into temp directory
  npx openapi-typescript "$(dirname "$0")/../openapi.yaml" -o "$TEMP_DIR/api.ts"

  # Compare with committed generated files
  if ! diff -q "$TEMP_DIR/api.ts" "$GENERATED_DIR/api.ts" > /dev/null 2>&1; then
    echo "ERROR: Generated types are out of date!"
    echo "The OpenAPI spec has been modified but types were not regenerated."
    echo ""
    echo "Fix: Run 'pnpm --filter @laila/api-spec generate' and commit the result."
    echo ""
    diff "$GENERATED_DIR/api.ts" "$TEMP_DIR/api.ts" || true
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  rm -rf "$TEMP_DIR"
  echo "Generated types are up to date."
  ```

- Alternative approach using Git: run generation, then check `git diff --exit-code generated/` to detect uncommitted changes
- The `--exit-code` flag on `diff` returns non-zero if differences are found, making it ideal for CI checks
- Ensure the check handles line ending normalization (use `diff --strip-trailing-cr` or normalize before comparing)
- The generated file should not include timestamps or environment-specific content that would cause false positives
- This check should run after the Spectral lint step to avoid checking generated types from an invalid spec

## References

- **Functional Requirements:** API contract integrity, drift prevention
- **Design Specification:** CI validation, contract-first enforcement
- **Project Setup:** CI pipeline, type generation freshness

## Estimated Complexity

Small — A shell script comparing file outputs. The main consideration is avoiding false positives from non-deterministic generation output.
