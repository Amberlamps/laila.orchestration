# Production Rollback Procedure

Operational runbook for rolling back failed deployments to [laila.works](https://laila.works). This document covers every deployment surface: Lambda functions, database migrations, static assets, and Terraform infrastructure state.

**Last updated:** 2026-03-04

---

## Table of Contents

1. [Lambda Function Rollback](#1-lambda-function-rollback)
2. [Database Migration Rollback](#2-database-migration-rollback)
3. [Static Assets Rollback (S3 + CloudFront)](#3-static-assets-rollback-s3--cloudfront)
4. [Terraform State Rollback](#4-terraform-state-rollback)
5. [Emergency Rollback Checklist](#5-emergency-rollback-checklist)
6. [Prevention Measures](#6-prevention-measures)

---

## 1. Lambda Function Rollback

### Overview

All Lambda functions are managed by Terraform via the `lambda-function` module. Terraform tracks the currently deployed code through the `source_code_hash` attribute (a base64-encoded SHA-256 of the deployment zip). The module does **not** use Lambda aliases or published versions, so a rollback requires redeploying the previous code artifact.

**Affected functions:**

| Function Name                    | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `laila-works-nextjs`             | Next.js 14 application (OpenNext v3)                        |
| `laila-works-timeout-checker`    | Reclaims timed-out story assignments (every 1 min)          |
| `laila-works-dag-reconciler`     | Full-graph consistency checks (every 5 min)                 |
| `laila-works-audit-archiver`     | Archives audit events from DynamoDB to S3 (daily 02:00 UTC) |
| `laila-works-status-propagation` | Processes cascading status re-evaluation from SQS           |

### Option A: Git Revert + Redeploy (Preferred)

This is the standard rollback path. It keeps Git history clean and ensures the CI/CD pipeline validates the reverted code.

```bash
# 1. Identify the bad commit
git log --oneline -10

# 2. Revert the commit (creates a new commit that undoes the changes)
git revert <BAD_COMMIT_SHA>

# 3. Push to main to trigger the deploy pipeline
git push origin main
```

The GitHub Actions pipeline will rebuild the Lambda deployment packages and run `terraform apply`, which detects the changed `source_code_hash` and redeploys each affected function.

### Option B: Manual AWS CLI Rollback

Use this when the deploy pipeline itself is broken or you need an immediate rollback without waiting for CI.

```bash
# 1. List recent Lambda function versions to identify the last working state
aws lambda list-versions-by-function \
  --function-name <FUNCTION_NAME> \
  --region us-east-1

# 2. If you have the previous deployment zip locally or in S3, update directly
aws lambda update-function-code \
  --function-name <FUNCTION_NAME> \
  --zip-file fileb://<PATH_TO_PREVIOUS_ZIP> \
  --region us-east-1

# 3. Alternatively, deploy from a known-good zip in S3
aws lambda update-function-code \
  --function-name <FUNCTION_NAME> \
  --s3-bucket <DEPLOYMENT_ARTIFACT_BUCKET> \
  --s3-key <PATH_TO_PREVIOUS_ZIP> \
  --region us-east-1

# 4. Verify the function is working
aws lambda invoke \
  --function-name <FUNCTION_NAME> \
  --region us-east-1 \
  --payload '{}' \
  /tmp/lambda-response.json && cat /tmp/lambda-response.json
```

**Replace these placeholders:**

| Placeholder                    | Example Value                                             |
| ------------------------------ | --------------------------------------------------------- |
| `<FUNCTION_NAME>`              | `laila-works-nextjs`, `laila-works-timeout-checker`, etc. |
| `<PATH_TO_PREVIOUS_ZIP>`       | `dist/timeout-checker.zip`                                |
| `<DEPLOYMENT_ARTIFACT_BUCKET>` | Your S3 bucket storing deployment artifacts               |

### Important Notes

- After a manual CLI rollback, Terraform state will be out of sync with the actual deployment. Run `terraform plan` before the next `terraform apply` to reconcile.
- The `source_code_hash` in Terraform is computed from the local zip file at plan time. A manual update bypasses this tracking entirely.
- EventBridge schedules (timeout-checker at 1 min, dag-reconciler at 5 min, audit-archiver daily at 02:00 UTC) continue to invoke whatever code is currently deployed. Verify the rollback is complete before the next scheduled invocation.

---

## 2. Database Migration Rollback

### Overview

The project uses **Drizzle ORM** with **Neon PostgreSQL**. Drizzle Kit generates forward-only SQL migrations stored in `packages/database/drizzle/`. There is no built-in automatic rollback mechanism. This is a deliberate design choice: rollback migrations are error-prone and rarely tested in practice. Instead, you create a new "undo" migration that goes through the same review process as any other schema change.

### Procedure

#### Step 1: Assess the Failed Migration

```bash
# Check the current migration state
npx drizzle-kit check

# Review the migration that needs to be reversed
cat packages/database/drizzle/<MIGRATION_FILE>.sql
```

#### Step 2: Create a Reverse Migration on a Neon Branch

**Never test rollback migrations directly against production.** Always use a Neon branch first.

```bash
# 1. Create a Neon branch from production for testing
#    (via Neon dashboard or Neon CLI)
neonctl branches create \
  --project-id <NEON_PROJECT_ID> \
  --name rollback-test-$(date +%Y%m%d-%H%M%S) \
  --parent main

# 2. Get the branch connection string from Neon dashboard

# 3. Write the reverse migration SQL
#    Example: if the bad migration added a column
#    CREATE the reverse migration file manually:
cat > packages/database/drizzle/<NEXT_SEQUENCE>_rollback_<DESCRIPTION>.sql << 'SQLEOF'
-- Reverse migration: drop the column added by <MIGRATION_FILE>
ALTER TABLE "<TABLE_NAME>" DROP COLUMN IF EXISTS "<COLUMN_NAME>";
SQLEOF

# 4. Apply against the Neon branch to test
DATABASE_DIRECT_URL="<NEON_BRANCH_CONNECTION_STRING>" \
  npx drizzle-kit push

# 5. Verify the schema is correct on the branch
DATABASE_DIRECT_URL="<NEON_BRANCH_CONNECTION_STRING>" \
  npx drizzle-kit check
```

#### Step 3: Apply to Production

```bash
# 1. Apply the tested reverse migration to production
DATABASE_DIRECT_URL="<PRODUCTION_DIRECT_URL>" \
  npx drizzle-kit push

# 2. Verify the production schema
DATABASE_DIRECT_URL="<PRODUCTION_DIRECT_URL>" \
  npx drizzle-kit check
```

#### Step 4: Clean Up

```bash
# Delete the Neon test branch
neonctl branches delete \
  --project-id <NEON_PROJECT_ID> \
  rollback-test-<TIMESTAMP>
```

### Common Reverse Operations

| Original Migration              | Reverse Migration                               |
| ------------------------------- | ----------------------------------------------- |
| `ALTER TABLE ADD COLUMN`        | `ALTER TABLE DROP COLUMN`                       |
| `CREATE TABLE`                  | `DROP TABLE`                                    |
| `CREATE INDEX`                  | `DROP INDEX`                                    |
| `ALTER TABLE ALTER COLUMN TYPE` | `ALTER TABLE ALTER COLUMN TYPE <original_type>` |
| `ALTER TABLE ADD CONSTRAINT`    | `ALTER TABLE DROP CONSTRAINT`                   |

### Critical Considerations

- **Application compatibility:** During the rollback window, the application code must be compatible with **both** the pre-migration and post-migration schema. Deploy the code rollback first (or simultaneously), then apply the reverse migration.
- **Data loss risk:** Dropping a column or table destroys data. If the original migration added a column that has since been populated, consider whether the data needs to be preserved before reversing.
- **Drizzle schema sync:** After applying a reverse migration, ensure the TypeScript schema definitions in `packages/database/src/schema/*.ts` match the actual database state. Run `npx drizzle-kit check` to verify.
- **Forward-only philosophy:** Drizzle Kit does not support automatic rollback. This is intentional. Creating a new "undo" migration is safer because it goes through the same code review process as any other migration.

**Replace these placeholders:**

| Placeholder                       | Example Value                                         |
| --------------------------------- | ----------------------------------------------------- |
| `<NEON_PROJECT_ID>`               | Your Neon project identifier                          |
| `<MIGRATION_FILE>`                | `0001_add_priority_column`                            |
| `<NEXT_SEQUENCE>`                 | `0002` (next sequence number)                         |
| `<PRODUCTION_DIRECT_URL>`         | `postgresql://user:pass@host/db` (direct, not pooled) |
| `<NEON_BRANCH_CONNECTION_STRING>` | Branch-specific connection URL from Neon dashboard    |

---

## 3. Static Assets Rollback (S3 + CloudFront)

### Overview

Static assets (Next.js bundles under `_next/static/*`, public files under `static/*`) are served from the `laila-works-static-assets` S3 bucket via CloudFront CDN. The S3 bucket has **versioning enabled**, so every object upload creates a new version while preserving the previous one.

The CloudFront distribution (`laila-works`) uses two cache behaviors:

- `_next/static/*` -- CachingOptimized (long-lived immutable cache)
- `static/*` -- CachingOptimized (long-lived immutable cache)
- Default -- CachingDisabled (dynamic SSR content, no rollback needed at CDN layer)

### Procedure

#### Step 1: Identify the Objects to Roll Back

```bash
# List objects in the static assets bucket
aws s3 ls s3://laila-works-static-assets/ --recursive

# List all versions of a specific object
aws s3api list-object-versions \
  --bucket laila-works-static-assets \
  --prefix <OBJECT_KEY>
```

#### Step 2: Restore Previous Object Versions

```bash
# Option A: Restore a specific file to a previous version
#   (copies the old version over the current one)
aws s3api copy-object \
  --bucket laila-works-static-assets \
  --copy-source "laila-works-static-assets/<OBJECT_KEY>?versionId=<PREVIOUS_VERSION_ID>" \
  --key <OBJECT_KEY>

# Option B: Bulk restore — delete the current versions to expose the previous ones
#   WARNING: This deletes the latest version. The previous version becomes current.
aws s3api delete-object \
  --bucket laila-works-static-assets \
  --key <OBJECT_KEY> \
  --version-id <CURRENT_VERSION_ID>

# Option C: Full rollback via Git revert + redeploy (preferred for bulk changes)
#   Revert the commit and let the pipeline re-upload the correct assets
git revert <BAD_COMMIT_SHA>
git push origin main
```

#### Step 3: Invalidate CloudFront Cache

After restoring the S3 objects, you must invalidate the CloudFront cache so edge locations serve the restored content.

```bash
# Create a wildcard invalidation (counts as 1 request for billing)
aws cloudfront create-invalidation \
  --distribution-id <CLOUDFRONT_DISTRIBUTION_ID> \
  --paths "/*"

# Or invalidate specific paths for a faster, more targeted invalidation
aws cloudfront create-invalidation \
  --distribution-id <CLOUDFRONT_DISTRIBUTION_ID> \
  --paths "/_next/static/*" "/static/*"

# Monitor invalidation progress
aws cloudfront get-invalidation \
  --distribution-id <CLOUDFRONT_DISTRIBUTION_ID> \
  --id <INVALIDATION_ID>
```

**Invalidation propagation takes 5-10 minutes** to reach all CloudFront edge locations globally.

#### Step 4: Verify

```bash
# Check that the correct assets are being served
curl -I "https://laila.works/_next/static/<ASSET_PATH>"

# Verify the response headers show the expected content
# Look for correct Content-Length, ETag, or Last-Modified values
```

### Important Notes

- **Cost:** AWS charges for CloudFront invalidation requests after the first 1,000 per month. A single wildcard invalidation (`/*`) counts as one request.
- **Next.js hashed assets:** Next.js static assets under `_next/static/` include content hashes in their filenames (e.g., `_next/static/chunks/app-abc123.js`). A code rollback naturally produces different filenames, so old cached files become unreachable. CloudFront invalidation is primarily needed for non-hashed assets under `static/*`.
- **S3 versioning:** Versioning is enabled on `laila-works-static-assets`. Previous versions are retained indefinitely unless a lifecycle rule removes them.

**Replace these placeholders:**

| Placeholder                    | Description                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- |
| `<CLOUDFRONT_DISTRIBUTION_ID>` | The CloudFront distribution ID (find via AWS Console or `terraform output`) |
| `<OBJECT_KEY>`                 | S3 object path, e.g., `_next/static/chunks/app.js`                          |
| `<PREVIOUS_VERSION_ID>`        | S3 version ID of the object to restore                                      |
| `<CURRENT_VERSION_ID>`         | S3 version ID of the current (bad) object                                   |
| `<INVALIDATION_ID>`            | Returned by `create-invalidation` command                                   |
| `<ASSET_PATH>`                 | Path portion after `_next/static/`                                          |

---

## 4. Terraform State Rollback

### Overview

Terraform state is stored in S3 with DynamoDB-based locking:

| Resource     | Value                          |
| ------------ | ------------------------------ |
| State bucket | `laila-works-terraform-state`  |
| State key    | `production/terraform.tfstate` |
| Region       | `us-east-1`                    |
| Lock table   | `laila-works-terraform-locks`  |
| Encryption   | Enabled (AES-256)              |

The state bucket has **versioning enabled**, providing a history of all state file changes.

> **WARNING:** Terraform state rollback is a dangerous operation. Restoring an old state file can cause Terraform to believe resources need to be **recreated**, which may result in data loss, downtime, or orphaned resources. Always run `terraform plan` before `terraform apply` after a state restoration.

### Procedure

#### Step 1: List Available State Versions

```bash
aws s3api list-object-versions \
  --bucket laila-works-terraform-state \
  --prefix production/terraform.tfstate \
  --query 'Versions[*].{VersionId:VersionId,LastModified:LastModified,Size:Size}' \
  --output table
```

#### Step 2: Download and Inspect the Previous State

```bash
# Download the previous state version for inspection
aws s3api get-object \
  --bucket laila-works-terraform-state \
  --key production/terraform.tfstate \
  --version-id <PREVIOUS_STATE_VERSION_ID> \
  /tmp/previous-terraform.tfstate

# Compare resource counts between current and previous state
echo "Previous state resources:"
jq '.resources | length' /tmp/previous-terraform.tfstate

# Optionally inspect specific resources
jq '.resources[] | select(.type == "aws_lambda_function") | .name' /tmp/previous-terraform.tfstate
```

#### Step 3: Restore the Previous State

```bash
# CRITICAL: Acquire the state lock before modifying state
#   This prevents concurrent modifications during restoration

# Restore by copying the old version as the new current version
aws s3api copy-object \
  --bucket laila-works-terraform-state \
  --copy-source "laila-works-terraform-state/production/terraform.tfstate?versionId=<PREVIOUS_STATE_VERSION_ID>" \
  --key production/terraform.tfstate \
  --server-side-encryption AES256
```

#### Step 4: Plan and Reconcile

```bash
# Navigate to the production environment directory
cd infra/environments/production

# Initialize Terraform (re-downloads state)
terraform init

# CRITICAL: Run plan to see what Terraform thinks needs to change
terraform plan -var-file=production.tfvars

# Review the plan output CAREFULLY before proceeding
# Look for any "destroy" or "replace" actions — these indicate
# the state rollback has caused drift

# Only apply if the plan is safe
terraform apply -var-file=production.tfvars
```

### Safety Warnings

- **Never skip the plan step.** A state rollback can make Terraform think a resource was deleted (because it doesn't exist in the old state). Running `apply` without reviewing the plan could destroy and recreate production resources.
- **Resource recreation risk:** If Terraform detects a resource in the real world that doesn't exist in the restored state, it may try to create a duplicate. If a resource exists in the state but not in the real world, it will try to create it. Both scenarios can cause failures or data loss.
- **State lock contention:** If a deploy is currently in progress, the DynamoDB lock table (`laila-works-terraform-locks`) will prevent concurrent state modifications. Wait for the current operation to complete or manually release the lock (with extreme caution).
- **Last resort:** Terraform state rollback should be your last resort. Prefer reverting the Terraform code in Git and running `terraform apply` to converge to the desired state. Only roll back the state file when the Terraform code change itself cannot be safely reverted.

**Replace these placeholders:**

| Placeholder                   | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `<PREVIOUS_STATE_VERSION_ID>` | S3 version ID of the state file to restore (from Step 1) |

---

## 5. Emergency Rollback Checklist

Use this checklist when a production deployment has caused an outage or critical degradation. Follow the steps in order.

### Step 1: Identify the Failing Component

- [ ] Check [https://laila.works](https://laila.works) -- is the site responding?
- [ ] Check CloudWatch Logs for Lambda errors:

  ```bash
  # Tail logs for the Next.js Lambda
  aws logs tail /aws/lambda/laila-works-nextjs \
    --region us-east-1 --follow

  # Tail logs for background workers
  aws logs tail /aws/lambda/laila-works-timeout-checker --region us-east-1 --follow
  aws logs tail /aws/lambda/laila-works-dag-reconciler --region us-east-1 --follow
  aws logs tail /aws/lambda/laila-works-status-propagation --region us-east-1 --follow
  aws logs tail /aws/lambda/laila-works-audit-archiver --region us-east-1 --follow
  ```

- [ ] Check the SQS dead-letter queue for failed messages:
  ```bash
  aws sqs get-queue-attributes \
    --queue-url <STATUS_PROPAGATION_DLQ_URL> \
    --attribute-names ApproximateNumberOfMessages \
    --region us-east-1
  ```
- [ ] Identify which deployment component caused the issue:
  - **Lambda code** -- Application errors, handler crashes
  - **Database migration** -- Schema incompatibility, query failures
  - **Static assets** -- Missing or corrupt JS/CSS bundles
  - **Infrastructure (Terraform)** -- Misconfigured resources, missing permissions

### Step 2: Revert the Git Commit

```bash
# Find the commit that caused the issue
git log --oneline -10

# Revert it (creates a new commit)
git revert <BAD_COMMIT_SHA> --no-edit

# Push to trigger the deploy pipeline
git push origin main
```

### Step 3: Re-run the Deploy Pipeline

- [ ] Monitor the GitHub Actions workflow at: `https://github.com/<ORG>/<REPO>/actions`
- [ ] Wait for the pipeline to complete successfully
- [ ] Verify each stage: build, test, deploy

### Step 4: Manual Rollback (If Pipeline Is Broken)

If the deploy pipeline itself is failing, perform manual rollbacks for each affected component:

**Lambda functions:**

```bash
# Update each affected function with the last known-good zip
aws lambda update-function-code \
  --function-name <FUNCTION_NAME> \
  --zip-file fileb://<PATH_TO_PREVIOUS_ZIP> \
  --region us-east-1
```

**Static assets:**

```bash
# Restore previous S3 object versions + invalidate CDN
aws s3api copy-object \
  --bucket laila-works-static-assets \
  --copy-source "laila-works-static-assets/<OBJECT_KEY>?versionId=<PREVIOUS_VERSION_ID>" \
  --key <OBJECT_KEY>

aws cloudfront create-invalidation \
  --distribution-id <CLOUDFRONT_DISTRIBUTION_ID> \
  --paths "/*"
```

**Database migration:**

```bash
# Create and apply a reverse migration (see Section 2)
# ALWAYS test on a Neon branch first
```

### Step 5: Verify Recovery

- [ ] Confirm [https://laila.works](https://laila.works) is responding correctly
- [ ] Check Lambda function invocations are succeeding:
  ```bash
  aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Errors \
    --dimensions Name=FunctionName,Value=laila-works-nextjs \
    --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 300 \
    --statistics Sum \
    --region us-east-1
  ```
- [ ] Verify background workers are running (check CloudWatch Logs for recent invocations)
- [ ] Confirm database queries are succeeding (no schema mismatch errors in logs)
- [ ] Check SQS queue depth is not growing unexpectedly

### Step 6: Create Incident Report

After the rollback is complete and the system is stable:

- [ ] Document what failed and why
- [ ] Record the timeline of events (detection, response, resolution)
- [ ] Identify the root cause
- [ ] List action items to prevent recurrence
- [ ] Share the incident report with the team

---

## 6. Prevention Measures

These practices reduce the likelihood of needing a rollback in the first place.

### Terraform Safety

- **Always run `terraform plan` and review the output** before running `terraform apply`. Look for unexpected `destroy` or `replace` actions.
- **Use the `-target` flag** when making targeted changes to reduce blast radius:
  ```bash
  terraform apply -target=module.timeout_checker_lambda -var-file=production.tfvars
  ```
- **Lock the state during manual operations.** The DynamoDB lock table (`laila-works-terraform-locks`) prevents concurrent modifications, but only when using the Terraform CLI.

### Database Migration Safety

- **Use Neon branching** to test every migration before applying to production. Create a branch, apply the migration, run the application against it, then delete the branch.
  ```bash
  neonctl branches create \
    --project-id <NEON_PROJECT_ID> \
    --name migration-test-$(date +%Y%m%d-%H%M%S) \
    --parent main
  ```
- **Make migrations backward-compatible** when possible. For example, add a new nullable column instead of renaming an existing one. This allows the previous application version to continue working during the deployment window.
- **Avoid destructive migrations** (DROP TABLE, DROP COLUMN) in the same deployment as the code that stops using them. Split into two deployments: first deploy code that no longer references the column/table, then deploy the migration that removes it.

### GitHub Environment Protection

- **Require manual approval for production deployments.** Configure GitHub environment protection rules to require at least one reviewer before the deploy job runs.
- **Use concurrency groups** to prevent multiple deployments from running simultaneously (already configured in the CI workflow).

### Monitoring After Deployment

- **Watch CloudWatch alarms immediately after deployment.** Key metrics to monitor:
  - Lambda error rate (`Errors` metric)
  - Lambda duration (`Duration` metric) -- sudden increases may indicate a problem
  - SQS queue depth (`ApproximateNumberOfMessagesVisible`) -- growing depth indicates consumers are failing
  - CloudFront error rate (`5xxErrorRate`)
- **Tail Lambda logs** for the first few minutes after deployment:
  ```bash
  aws logs tail /aws/lambda/laila-works-nextjs \
    --region us-east-1 --follow --since 5m
  ```

### Small, Frequent Deployments

- **Deploy frequently in small increments.** Smaller changesets are easier to reason about and faster to roll back.
- **Keep the rollback window small.** The longer a broken deployment stays in production, the harder it becomes to roll back (especially for database migrations that accumulate data in new columns/tables).

### Pre-deployment Checklist

Before every production deployment, verify:

- [ ] All CI checks pass (lint, typecheck, tests)
- [ ] `terraform plan` output reviewed and approved
- [ ] Database migrations tested on a Neon branch
- [ ] No destructive changes without a two-phase deployment plan
- [ ] Monitoring dashboards open and ready to observe
- [ ] This rollback runbook is accessible and up to date
