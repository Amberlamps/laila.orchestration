# Document Rollback Procedure

## Task Details

- **Title:** Document Rollback Procedure
- **Status:** Not Started
- **Assigned Agent:** devops-engineer
- **Parent User Story:** [Set Up Deployment Pipeline](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Document the rollback procedure for production deployments covering all deployment surfaces: Lambda function version revert, forward-only database migrations, CloudFront cache invalidation with S3 versioned restore, and Terraform state rollback. This document serves as the operational runbook for handling failed deployments.

### Rollback Documentation Content

The following sections must be documented in a runbook at `docs/runbooks/rollback-procedure.md`:

**1. Lambda Function Rollback**
- Terraform manages Lambda function versions via `source_code_hash`
- To rollback: revert the commit in Git, re-run the deploy pipeline
- Alternative: use `aws lambda update-function-code` with the previous zip from S3 versioned bucket
- The Lambda module does not use aliases/versions by default, so rollback requires redeployment

**2. Database Migration Rollback**
- Drizzle ORM uses forward-only migrations
- To "rollback" a migration: create a new migration that reverses the schema changes
- Example: if a column was added, create a migration to drop it
- Always test rollback migrations against a Neon branch (not production) first
- Critical: ensure application code is compatible with both old and new schema during the rollback window

**3. Static Assets Rollback (S3 + CloudFront)**
- S3 bucket has versioning enabled
- To rollback: restore previous object versions in S3
- Create CloudFront cache invalidation to clear CDN caches: `aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"`
- Invalidation takes 5-10 minutes to propagate globally

**4. Terraform State Rollback**
- Terraform state is versioned in S3
- To rollback: restore the previous state file version in S3
- Run `terraform plan` to verify the state matches the desired infrastructure
- Run `terraform apply` to reconcile any differences
- WARNING: state rollback can cause resource recreation — always plan before applying

**5. Emergency Rollback Checklist**
- Step 1: Identify the failing component (Lambda, database, static assets)
- Step 2: Revert the Git commit (`git revert HEAD`)
- Step 3: Re-run the deploy pipeline from the reverted commit
- Step 4: If deploy pipeline is broken, use manual AWS CLI commands for individual components
- Step 5: Verify via health check endpoints
- Step 6: Create incident report

**6. Prevention Measures**
- Always run `terraform plan` and review before `terraform apply`
- Use Neon branching for database migration testing
- Use GitHub environment protection rules (manual approval for production)
- Monitor CloudWatch alarms immediately after deployment
- Keep the rollback window small: deploy frequently in small increments

## Acceptance Criteria

- [ ] Rollback procedure document exists at `docs/runbooks/rollback-procedure.md`
- [ ] Lambda function rollback is documented (Git revert + redeploy, or manual CLI)
- [ ] Database migration rollback is documented (forward-only, create reverse migration)
- [ ] Static assets rollback is documented (S3 versioning + CloudFront invalidation)
- [ ] Terraform state rollback is documented with safety warnings
- [ ] Emergency rollback checklist provides step-by-step instructions
- [ ] Prevention measures are documented to reduce the need for rollbacks
- [ ] All CLI commands are provided with placeholders for environment-specific values
- [ ] The document is reviewed by at least one other team member

## Technical Notes

- **Forward-only migrations:** Drizzle Kit does not support automatic rollback migrations. This is a deliberate design choice — rollback migrations are error-prone and rarely tested. Creating a new "undo" migration is safer because it goes through the same review process as any other migration.
- **Neon branching:** Neon supports creating database branches (like Git branches) that can be used to test migrations without affecting production data. Always test rollback migrations on a Neon branch first.
- **CloudFront invalidation cost:** AWS charges for invalidation requests after the first 1,000 per month. A wildcard invalidation (`/*`) counts as one request.
- **Terraform state versioning:** S3 bucket versioning on the state bucket provides a safety net. However, restoring an old state version is dangerous because it can cause Terraform to think resources need to be recreated. Always run `terraform plan` after state restoration.

## References

- **Drizzle Kit Migrations:** https://orm.drizzle.team/docs/kit-overview
- **Neon Branching:** https://neon.tech/docs/manage/branches
- **CloudFront Invalidations:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html
- **Terraform State:** https://developer.hashicorp.com/terraform/language/state

## Estimated Complexity

Low — Documentation task with no code changes. The complexity lies in accurately describing the rollback procedures and potential pitfalls.
