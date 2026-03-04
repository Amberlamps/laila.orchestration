# Create Deploy Workflow

## Task Details

- **Title:** Create Deploy Workflow
- **Status:** Complete
- **Assigned Agent:** devops-engineer
- **Parent User Story:** [Set Up Deployment Pipeline](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** Configure OpenNext Build

## Description

Create a GitHub Actions workflow at `.github/workflows/deploy-production.yml` that automates the full production deployment. The workflow is triggered on merge to the `main` branch or via manual dispatch. It includes: dependency installation, full build, database migrations via Drizzle Kit, Next.js deployment via OpenNext, Lambda function deployment, Terraform apply, and post-deploy verification.

### Workflow Definition

```yaml
# .github/workflows/deploy-production.yml
# Production deployment workflow for laila.works.
# Triggered on merge to main or manual dispatch.
# Deploys: Next.js (OpenNext), Lambda functions, Terraform infrastructure.

name: Deploy Production

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      skip_migrations:
        description: 'Skip database migrations'
        required: false
        default: 'false'
        type: boolean

concurrency:
  group: production-deploy
  cancel-in-progress: false # Never cancel a running deployment

permissions:
  id-token: write # For OIDC authentication with AWS
  contents: read
  deployments: write # For GitHub deployment status

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production

    steps:
      # --- Checkout & Setup ---
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # --- Type Check & Lint ---
      - name: Type check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      # --- Build ---
      - name: Build Next.js via OpenNext
        run: pnpm build:open-next

      - name: Build Lambda functions
        run: pnpm build:lambdas

      - name: Package Lambda functions
        run: pnpm deploy:package

      # --- Database Migration ---
      - name: Run database migrations
        if: inputs.skip_migrations != 'true'
        run: pnpm drizzle-kit push
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      # --- AWS Authentication ---
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1

      # --- Deploy Static Assets to S3 ---
      - name: Upload static assets to S3
        run: |
          aws s3 sync .open-next/assets s3://laila-works-static-assets \
            --delete \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "*.html"

      # --- Terraform ---
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: '1.7'

      - name: Terraform Init
        working-directory: infra/environments/production
        run: terraform init

      - name: Terraform Plan
        working-directory: infra/environments/production
        run: terraform plan -out=tfplan
        env:
          TF_VAR_nextjs_deployment_package: '../../../.open-next/server-function/index.zip'
          TF_VAR_timeout_checker_package: '../../../deploy/functions/timeout-checker.zip'
          TF_VAR_dag_reconciler_package: '../../../deploy/functions/dag-reconciler.zip'
          TF_VAR_audit_archiver_package: '../../../deploy/functions/audit-archiver.zip'
          TF_VAR_status_propagation_package: '../../../deploy/functions/status-propagation.zip'

      - name: Terraform Apply
        working-directory: infra/environments/production
        run: terraform apply -auto-approve tfplan

      # --- Post-Deploy Health Check ---
      - name: Health check
        run: |
          # Implemented in the health check task
          node scripts/health-check.js

      # --- GitHub Deployment Status ---
      - name: Create deployment status (success)
        if: success()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: context.payload.deployment?.id || 0,
              state: 'success',
              description: 'Production deployment succeeded',
              environment_url: 'https://laila.works',
            });

      - name: Create deployment status (failure)
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: context.payload.deployment?.id || 0,
              state: 'failure',
              description: 'Production deployment failed',
            });
```

## Acceptance Criteria

- [ ] Workflow exists at `.github/workflows/deploy-production.yml`
- [ ] Triggered on push to `main` and manual `workflow_dispatch`
- [ ] Manual dispatch supports `skip_migrations` input
- [ ] Concurrency group prevents simultaneous deployments (no cancel-in-progress)
- [ ] Uses OIDC for AWS authentication (no long-lived access keys)
- [ ] Steps: checkout, Node.js 22 setup, pnpm install (frozen lockfile), typecheck, lint
- [ ] Steps: OpenNext build, Lambda build, Lambda packaging
- [ ] Database migration step runs `drizzle-kit push` (skippable via input)
- [ ] Static assets uploaded to S3 with immutable cache headers
- [ ] Terraform plan and apply execute with deployment package variables
- [ ] Post-deploy health check verifies the deployment
- [ ] GitHub deployment status is updated on success or failure
- [ ] Environment is set to `production` for GitHub environment protection rules

## Technical Notes

- **OIDC authentication:** Uses GitHub's OIDC provider to assume an AWS IAM role. This eliminates long-lived access keys in GitHub secrets. The IAM role trust policy allows the specific GitHub repository.
- **Concurrency group:** `cancel-in-progress: false` ensures that if a second deployment is triggered while one is running, it queues instead of canceling the in-progress deployment. This prevents partial deployments.
- **Database migrations:** `drizzle-kit push` applies schema changes to the Neon production database. The `skip_migrations` input allows deploying code-only changes without touching the database.
- **S3 sync with --delete:** Removes old static assets that are no longer part of the build. The `--cache-control "immutable"` header enables aggressive browser caching for hashed assets.
- **Terraform plan file:** The plan is saved to a file and applied from that file, ensuring that exactly the reviewed plan is applied (no drift between plan and apply).

## References

- **GitHub Actions:** https://docs.github.com/en/actions
- **AWS OIDC:** https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
- **OpenNext Build:** [Configure OpenNext Build](./configure-opennext-build.md)
- **Terraform:** [Configure Production Infrastructure](../configure-production-environment/configure-production-infrastructure.md)
- **Drizzle Kit:** Database migration tool for Drizzle ORM

## Estimated Complexity

High — Multi-step workflow with build, migration, deployment, and verification phases. AWS OIDC authentication and Terraform plan/apply add complexity. Error handling and deployment status reporting must be robust.
