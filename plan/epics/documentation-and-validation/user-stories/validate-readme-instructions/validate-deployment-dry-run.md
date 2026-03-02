# Validate Deployment Dry Run

## Task Details

- **Title:** Validate Deployment Dry Run
- **Status:** Not Started
- **Assigned Agent:** deployment-engineer
- **Parent User Story:** [Validate README.md Instructions](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None (depends on User Story 1: Generate Comprehensive README.md)

## Description

Run the deployment in dry-run mode by executing `terraform plan` (without `terraform apply`) and verify the plan completes without errors. This validates the Terraform configuration is syntactically correct and all module references resolve. Do NOT actually deploy any infrastructure.

### Validation Steps

```bash
# Step 1: Build all deployment artifacts (required for Terraform variable references)
pnpm build:all
pnpm deploy:package

# Step 2: Initialize Terraform
cd infra/environments/production
terraform init

# Step 3: Validate Terraform configuration
terraform validate
# Expected: "Success! The configuration is valid."

# Step 4: Run Terraform plan (DRY RUN — do NOT apply)
terraform plan \
  -var="nextjs_deployment_package=../../../.open-next/server-function/index.zip" \
  -var="timeout_checker_package=../../../deploy/functions/timeout-checker.zip" \
  -var="dag_reconciler_package=../../../deploy/functions/dag-reconciler.zip" \
  -var="audit_archiver_package=../../../deploy/functions/audit-archiver.zip" \
  -var="status_propagation_package=../../../deploy/functions/status-propagation.zip"

# Step 5: Verify the plan completes without errors
echo $?  # Must be 0

# IMPORTANT: Do NOT run terraform apply
# This is a validation step only — no infrastructure changes
```

### Success Criteria

- `terraform init` succeeds (backend and providers initialized)
- `terraform validate` returns "Success! The configuration is valid."
- `terraform plan` completes with exit code 0
- The plan shows the expected resources to be created
- No errors or unresolved references in the plan output

## Acceptance Criteria

- [ ] `terraform init` succeeds without errors
- [ ] `terraform validate` reports the configuration is valid
- [ ] `terraform plan` completes with exit code 0
- [ ] The plan lists the expected resources: Lambda functions, DynamoDB table, SQS queues, EventBridge schedules, S3 buckets, CloudFront distribution, Route 53 records, ACM certificate
- [ ] All module references resolve correctly
- [ ] All variable references are satisfied
- [ ] No deprecated provider features are used (no warnings)
- [ ] NO infrastructure is actually created or modified (dry run only)

## Technical Notes

- **Dry run only:** This validation explicitly does NOT apply any changes. The purpose is to verify the Terraform configuration is correct, not to deploy infrastructure. Running `terraform apply` would create real AWS resources and incur costs.
- **AWS credentials:** `terraform plan` requires valid AWS credentials to query the AWS API (even for a plan). Use a read-only IAM role or temporary credentials scoped to the validation environment.
- **State file:** If this is the first run, there will be no existing state file. The plan will show all resources as "to be created." This is expected.
- **Build artifacts:** Terraform references the deployment package zip files via variables. These must exist before running `terraform plan`, hence the build step first.

## References

- **README Section:** Deployment (from Task: Write Deployment and Operations Guide)
- **Terraform:** https://developer.hashicorp.com/terraform/cli/commands/plan
- **Terraform Configuration:** [Configure Production Infrastructure](../../../aws-infrastructure-and-deployment/user-stories/configure-production-environment/configure-production-infrastructure.md)

## Estimated Complexity

Low — Running Terraform validate and plan. The main risk is AWS credential configuration. No infrastructure is modified.
