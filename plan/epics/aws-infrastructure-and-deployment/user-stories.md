# AWS Infrastructure & Deployment — User Stories

## Epic Summary

- **Title:** AWS Infrastructure & Deployment
- **Description:** Terraform modules for all AWS resources, production environment configuration, OpenNext deployment for Next.js 14, CI/CD deploy pipeline via GitHub Actions, and comprehensive observability with CloudWatch dashboards, alarms, X-Ray tracing, and custom metrics. This epic transforms the application from a locally-running development project into a production-ready, infrastructure-as-code deployed system on AWS.
- **Status:** In Progress (laila-agent-3)
- **Total User Stories:** 4
- **Dependencies:** Epic 3 (Database Layer), Epic 7 (Orchestration & Work Assignment API), Epic 13 (Background Jobs & Scheduled Tasks)

## User Stories

| User Story                                                                                   | Description                                                                                               | Status      | Tasks   | Dependencies                                               |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- | ------- | ---------------------------------------------------------- |
| [Create Terraform Modules](./user-stories/create-terraform-modules/tasks.md)                 | Reusable Terraform modules for Lambda, DynamoDB, CloudFront, S3, SQS, and EventBridge                     | Complete    | 6 tasks | None                                                       |
| [Configure Production Environment](./user-stories/configure-production-environment/tasks.md) | Production infrastructure using all modules: Lambda functions, DynamoDB, SQS, EventBridge, S3, domain/SSL | Not Started | 4 tasks | Create Terraform Modules                                   |
| [Set Up Deployment Pipeline](./user-stories/setup-deployment-pipeline/tasks.md)              | OpenNext build, GitHub Actions deploy workflow, health checks, rollback documentation                     | Not Started | 4 tasks | Create Terraform Modules, Configure Production Environment |
| [Configure Observability](./user-stories/configure-observability/tasks.md)                   | pino structured logging, CloudWatch dashboards/alarms, X-Ray tracing, custom metrics                      | Not Started | 4 tasks | None                                                       |

## Dependency Graph

```
Create Terraform Modules
    |
    v
Configure Production Environment     Configure Observability (independent)
    |
    v
Set Up Deployment Pipeline
```

## Suggested Implementation Order

1. **Phase 1 (parallel):**
   - Create Terraform Modules — reusable building blocks for all infrastructure
   - Configure Observability — logging and tracing can be built independently of infrastructure modules
2. **Phase 2:** Configure Production Environment — composes all Terraform modules into production infrastructure
3. **Phase 3:** Set Up Deployment Pipeline — CI/CD workflow that deploys to the production environment

## Technical Context

- **Infrastructure as Code:** Terraform with AWS provider, S3 backend for state, DynamoDB for state locking
- **Compute:** AWS Lambda (ARM64/Graviton2), Node.js 22.x runtime, 512MB-1024MB memory
- **Next.js Deployment:** OpenNext v3 for deploying Next.js 14 (Pages Router) to Lambda + CloudFront
- **Database:** PostgreSQL on Neon (external, managed), DynamoDB for audit logs
- **Async Processing:** SQS standard queue with DLQ, EventBridge Scheduler for periodic tasks
- **Storage:** S3 for static assets (CloudFront origin) and audit archive
- **CDN:** CloudFront with custom domain, ACM certificate, gzip + Brotli compression
- **DNS/SSL:** Route 53 hosted zone, ACM certificate (auto-renewed)
- **Secrets:** SSM Parameter Store (SecureString) with KMS encryption
- **CI/CD:** GitHub Actions with manual dispatch and merge-to-main triggers
- **Observability:** pino structured JSON logging, CloudWatch Logs/Dashboards/Alarms, X-Ray tracing, custom CloudWatch metrics
