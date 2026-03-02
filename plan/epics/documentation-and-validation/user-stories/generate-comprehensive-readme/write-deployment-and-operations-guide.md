# Write Deployment and Operations Guide

## Task Details

- **Title:** Write Deployment and Operations Guide
- **Status:** Not Started
- **Assigned Agent:** technical-writer
- **Parent User Story:** [Generate Comprehensive README.md](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None

## Description

Write the README sections covering deployment, environment variables reference, project structure, debugging, and troubleshooting. These sections provide the operational knowledge needed to deploy, maintain, and debug the application in production.

### Section: Deployment

```markdown
## Deployment

### Automated Deployment (Recommended)

Production deployments are triggered automatically when code is merged to `main`.
The GitHub Actions workflow (`.github/workflows/deploy-production.yml`) handles:

1. Install dependencies and run quality checks (typecheck, lint)
2. Build Next.js via OpenNext and all Lambda functions
3. Run database migrations (Drizzle Kit)
4. Upload static assets to S3
5. Apply Terraform changes (plan + apply)
6. Run post-deploy health check

### Manual Deployment

For manual deployments or debugging:

# 1. Build everything
pnpm build:all

# 2. Package Lambda functions
pnpm deploy:package

# 3. Run database migrations
DATABASE_URL=$PROD_DATABASE_URL pnpm drizzle-kit push

# 4. Upload static assets
aws s3 sync .open-next/assets s3://laila-works-static-assets --delete

# 5. Terraform plan and apply
cd infra/environments/production
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# 6. Verify deployment
node scripts/health-check.js

### Rollback

See [docs/runbooks/rollback-procedure.md](docs/runbooks/rollback-procedure.md)
for detailed rollback procedures.
```

### Section: Environment Variables

```markdown
## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | — | Secret key for session signing (min 32 chars) |
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | — | Google OAuth 2.0 client secret |
| `NEXT_PUBLIC_APP_URL` | Yes | — | Public URL of the application |
| `NODE_ENV` | No | `development` | Environment: `development` or `production` |
| `LOG_LEVEL` | No | `info` | pino log level: `debug`, `info`, `warn`, `error` |
| `AUDIT_TABLE_NAME` | No | — | DynamoDB table name for audit events (Lambda only) |
| `SQS_QUEUE_URL` | No | — | SQS queue URL for status propagation (Lambda only) |
| `ARCHIVE_BUCKET` | No | — | S3 bucket name for audit archive (Lambda only) |
```

### Section: Project Structure

```markdown
## Project Structure

laila.works/
  apps/
    web/                    # Next.js 14 application (Pages Router)
      pages/
        api/                # API routes
          v1/               # Versioned API endpoints
      lib/                  # Shared application code
  packages/
    shared/                 # Shared types, schemas, constants
    domain/                 # Pure domain logic (DAG, eligibility, status)
    database/               # Drizzle ORM schema and migrations
    logger/                 # pino structured logging
    metrics/                # CloudWatch custom metrics
  functions/
    timeout-checker/        # Lambda: timeout detection and reclamation
    dag-reconciler/         # Lambda: DAG consistency checking
    audit-archiver/         # Lambda: DynamoDB to S3 archival
    status-propagation/     # Lambda: SQS cascading status consumer
  infra/
    modules/                # Reusable Terraform modules
      lambda-function/
      dynamodb-table/
      cloudfront-distribution/
      s3-bucket/
      sqs-queue/
      eventbridge-schedule/
    environments/
      production/           # Production Terraform configuration
  .github/
    workflows/              # GitHub Actions CI/CD pipelines
  scripts/                  # Build and deploy utility scripts
```

### Section: Debugging

```markdown
## Debugging

### Local API Debugging

1. Start the dev server with the Node.js inspector:

NODE_OPTIONS='--inspect' pnpm dev

2. Open Chrome DevTools: `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Set breakpoints in API route files

### Lambda Function Debugging

Lambda functions can be tested locally using the function's test suite:

pnpm --filter @laila/timeout-checker test:watch

For production debugging:
1. Check CloudWatch Logs: `/aws/lambda/laila-works-{function-name}`
2. Use CloudWatch Logs Insights for structured queries:
   fields @timestamp, requestId, msg, durationMs
   | filter @message like /error/
   | sort @timestamp desc
   | limit 20
3. Check X-Ray traces in the AWS Console for request flow visualization
```

### Section: Troubleshooting

```markdown
## Troubleshooting

### Common Issues

**`pnpm install` fails with lockfile mismatch**
Run `pnpm install` (without `--frozen-lockfile`) to update the lockfile,
then commit the updated `pnpm-lock.yaml`.

**Database connection refused**
- Verify `DATABASE_URL` in `.env.local` is correct
- Check that your IP is allowed in the Neon project settings
- Ensure the Neon project is not suspended (free tier suspends after inactivity)

**Google OAuth redirect error**
- Verify `NEXT_PUBLIC_APP_URL` matches the authorized redirect URI in Google Console
- For local development, use `http://localhost:3000`
- Ensure the Google OAuth consent screen is configured

**Lambda cold start timeout**
- Check CloudWatch Logs for initialization errors
- Verify SSM parameters exist and are accessible
- Check IAM role permissions

**Terraform state lock**
If `terraform plan` hangs with "Acquiring state lock":
terraform force-unlock LOCK_ID
Only use this if you are certain no other deployment is running.

**SQS DLQ has messages**
- Check the DLQ in the SQS console for message contents
- Common causes: malformed events, database connection issues
- After fixing, replay messages from DLQ to the main queue
```

## Acceptance Criteria

- [ ] Deployment section documents both automated (GitHub Actions) and manual deployment
- [ ] Manual deployment steps match the GitHub Actions workflow steps
- [ ] Rollback procedure is referenced with a link to the runbook
- [ ] Environment variables table lists all variables with required/optional, defaults, descriptions
- [ ] Lambda-only variables are clearly marked
- [ ] Project structure shows the full directory tree with descriptions
- [ ] Debugging section covers local API debugging with Node.js inspector
- [ ] Debugging section covers Lambda function debugging via CloudWatch Logs and X-Ray
- [ ] CloudWatch Logs Insights example query is provided
- [ ] Troubleshooting section covers at least 5 common issues with solutions
- [ ] All commands are copy-paste ready

## Technical Notes

- The environment variables table should be verified against actual application code to ensure completeness. Missing variables will cause runtime errors.
- The project structure should be verified against the actual file tree to ensure accuracy.
- Debugging instructions use standard Node.js inspector (not VS Code-specific) for broader applicability.
- The troubleshooting section should be updated as new issues are discovered in production.

## References

- **GitHub Actions Workflow:** `.github/workflows/deploy-production.yml`
- **Terraform Configuration:** `infra/environments/production/`
- **Rollback Runbook:** `docs/runbooks/rollback-procedure.md`
- **CloudWatch Logs Insights:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html

## Estimated Complexity

Medium — Requires synthesizing information from multiple sources (Terraform config, GitHub Actions workflow, application code) into clear, accurate documentation.
