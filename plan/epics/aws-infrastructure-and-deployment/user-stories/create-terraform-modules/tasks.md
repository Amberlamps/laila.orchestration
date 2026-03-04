# Create Terraform Modules — Tasks

## User Story Summary

- **Title:** Create Terraform Modules
- **Description:** Create reusable Terraform modules for all AWS resources used by laila.works. Each module encapsulates a single AWS service with configurable inputs, sensible defaults, and well-defined outputs. These modules are composed in the production environment configuration (User Story 2) to build the complete infrastructure.
- **Status:** Complete
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Total Tasks:** 6
- **Dependencies:** None

## Tasks

| Task                                                                                | Description                                                                  | Status   | Assigned Agent     | Dependencies |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- | ------------------ | ------------ |
| [Create Lambda Function Module](./create-lambda-function-module.md)                 | Reusable module for Lambda: ARM64, SSM env vars, CloudWatch logs, X-Ray, IAM | Complete | terraform-engineer | None         |
| [Create DynamoDB Table Module](./create-dynamodb-table-module.md)                   | Reusable module for DynamoDB: on-demand, GSI, TTL, PITR                      | Complete | terraform-engineer | None         |
| [Create CloudFront Distribution Module](./create-cloudfront-distribution-module.md) | Module for CloudFront: S3 + Lambda origins, custom domain, ACM, compression  | Complete | terraform-engineer | None         |
| [Create S3 Bucket Module](./create-s3-bucket-module.md)                             | Module for S3: versioning, encryption, lifecycle, CORS                       | Complete | terraform-engineer | None         |
| [Create SQS Queue Module](./create-sqs-queue-module.md)                             | Module for SQS: standard queue, DLQ, Lambda trigger                          | Complete | terraform-engineer | None         |
| [Create EventBridge Schedule Module](./create-eventbridge-schedule-module.md)       | Module for EventBridge Scheduler: cron, Lambda target, IAM, retry            | Complete | terraform-engineer | None         |

## Dependency Graph

```
Create Lambda Function Module       (independent)
Create DynamoDB Table Module        (independent)
Create CloudFront Distribution Module (independent)
Create S3 Bucket Module             (independent)
Create SQS Queue Module            (independent)
Create EventBridge Schedule Module  (independent)
```

All six tasks are independent and can be developed in parallel.

## Suggested Implementation Order

1. **Phase 1 (all parallel):** All six modules can be developed concurrently. Each module is self-contained with no cross-module dependencies.

Each module follows a standard structure:

```
infra/modules/{module-name}/
  main.tf        # Resource definitions
  variables.tf   # Input variables with descriptions and defaults
  outputs.tf     # Output values for composition
  versions.tf    # Required provider versions
```
