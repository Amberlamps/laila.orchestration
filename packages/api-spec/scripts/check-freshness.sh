#!/usr/bin/env bash
# packages/api-spec/scripts/check-freshness.sh
#
# Verifies that the generated TypeScript types in generated/api.ts are
# up-to-date with the current OpenAPI specification.  If the committed
# file and the freshly generated output differ, this script exits non-zero
# so CI can block the merge.
#
# The comparison normalises line endings (strips trailing CR) to avoid
# false positives on Windows/Linux cross-platform checkouts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd)"
SPEC_PATH="$PACKAGE_ROOT/openapi.yaml"
GENERATED_DIR="$PACKAGE_ROOT/generated"
COMMITTED_FILE="$GENERATED_DIR/api.ts"

# Sanity checks
if [ ! -f "$SPEC_PATH" ]; then
  echo "ERROR: OpenAPI spec not found at $SPEC_PATH"
  exit 1
fi

if [ ! -f "$COMMITTED_FILE" ]; then
  echo "ERROR: generated/api.ts does not exist. Run 'pnpm --filter @laila/api-spec generate' first."
  exit 1
fi

# Create a temp directory and ensure it is cleaned up on exit
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

TEMP_FILE="$TEMP_DIR/api.ts"

echo "Regenerating TypeScript types to verify freshness..."
npx openapi-typescript "$SPEC_PATH" -o "$TEMP_FILE" 2>&1
npx prettier --write "$TEMP_FILE" --config "$REPO_ROOT/.prettierrc" > /dev/null 2>&1

# Normalise line endings before comparison (strip trailing CR)
normalize() {
  sed 's/\r$//' "$1"
}

if ! diff -q <(normalize "$COMMITTED_FILE") <(normalize "$TEMP_FILE") > /dev/null 2>&1; then
  echo ""
  echo "ERROR: Generated types are out of date."
  echo "The OpenAPI spec has been modified but types were not regenerated."
  echo ""
  echo "Run \`pnpm --filter @laila/api-spec generate\` and commit the result."
  echo ""
  echo "--- Diff (committed vs freshly generated) ---"
  diff --strip-trailing-cr "$COMMITTED_FILE" "$TEMP_FILE" || true
  exit 1
fi

echo "Generated types are up to date."
exit 0
