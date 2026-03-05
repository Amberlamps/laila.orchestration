#!/usr/bin/env bash
# scripts/deploy-production.sh
# Full production deployment: build, upload assets, plan & apply infrastructure.
#
# Usage:
#   ./scripts/deploy-production.sh                  # Full deploy
#   ./scripts/deploy-production.sh --skip-checks    # Skip typecheck and lint
#   ./scripts/deploy-production.sh --skip-migrations # Skip database migrations
#
# Requires:
#   - AWS_PROFILE set (e.g. "laila") or AWS credentials in environment
#   - Node.js 22+, pnpm, Terraform installed

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TERRAFORM_DIR="$REPO_ROOT/infra/environments/production"
ASSETS_DIR="$REPO_ROOT/apps/web/.open-next/assets"
S3_BUCKET="laila-works-static-assets"
HEALTH_CHECK_URL="https://app.laila.works"

# Default flags
SKIP_CHECKS=false
SKIP_MIGRATIONS=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --skip-checks) SKIP_CHECKS=true ;;
    --skip-migrations) SKIP_MIGRATIONS=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# --- Helpers ---

step() {
  echo ""
  echo "============================================"
  echo "  $1"
  echo "============================================"
  echo ""
}

fail() {
  echo "DEPLOY FAILED: $1" >&2
  exit 1
}

# --- Pre-flight checks ---

step "Pre-flight checks"

command -v node >/dev/null 2>&1 || fail "node is not installed"
command -v terraform >/dev/null 2>&1 || fail "terraform is not installed"
command -v aws >/dev/null 2>&1 || fail "aws CLI is not installed"

# Verify AWS credentials work
aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS credentials not configured. Set AWS_PROFILE or export AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY."

echo "AWS Identity: $(aws sts get-caller-identity --query 'Arn' --output text)"
echo "Repository:   $REPO_ROOT"

# --- Install dependencies ---

step "Installing dependencies"

cd "$REPO_ROOT"
npx pnpm install --frozen-lockfile

# --- Type check & lint (optional) ---

if [ "$SKIP_CHECKS" = false ]; then
  step "Type checking"
  npx pnpm typecheck

  step "Linting"
  npx pnpm lint
fi

# --- Build ---

step "Building Next.js via OpenNext"
npx pnpm build:open-next

step "Building Lambda functions"
npx pnpm build:lambdas

step "Packaging Lambda functions"
npx pnpm deploy:package

# --- Database migrations (optional) ---

if [ "$SKIP_MIGRATIONS" = false ]; then
  step "Running database migrations"
  npx pnpm drizzle-kit push
fi

# --- Upload static assets to S3 ---

step "Uploading static assets to S3"

[ -d "$ASSETS_DIR" ] || fail "OpenNext assets not found at $ASSETS_DIR. Build may have failed."

aws s3 sync "$ASSETS_DIR" "s3://$S3_BUCKET" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html"

# --- Terraform ---

step "Terraform Init"
cd "$TERRAFORM_DIR"
terraform init -input=false

step "Terraform Plan"
terraform plan -out=tfplan -input=false

step "Terraform Apply"
terraform apply -auto-approve tfplan

# --- Health check ---

step "Health check"

RETRIES=5
DELAY=3
for i in $(seq 1 $RETRIES); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" || true)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "Health check passed: $HEALTH_CHECK_URL returned $HTTP_CODE"
    break
  fi
  if [ "$i" -eq "$RETRIES" ]; then
    echo "WARNING: Health check failed after $RETRIES attempts (last status: $HTTP_CODE)"
    echo "The deployment completed but the site may not be fully ready yet."
    exit 0
  fi
  echo "Attempt $i/$RETRIES: got $HTTP_CODE, retrying in ${DELAY}s..."
  sleep "$DELAY"
done

step "Deployment complete!"
echo "Site is live at $HEALTH_CHECK_URL"
