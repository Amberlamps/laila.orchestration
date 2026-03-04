# Set Up Deployment Pipeline — Tasks

## User Story Summary

- **Title:** Set Up Deployment Pipeline
- **Description:** Configure the complete deployment pipeline: OpenNext v3 build for Next.js 14 to AWS Lambda + CloudFront, GitHub Actions workflow for automated deployment on merge to main, post-deploy health checks, and rollback procedure documentation.
- **Status:** In Progress (laila-agent-3)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Create Terraform Modules, Configure Production Environment

## Tasks

| Task                                                                          | Description                                                            | Status      | Assigned Agent  | Dependencies             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- | --------------- | ------------------------ |
| [Configure OpenNext Build](./configure-opennext-build.md)                     | OpenNext v3 build configuration for Next.js 14 to Lambda + CloudFront  | Not Started | devops-engineer | None                     |
| [Create Deploy Workflow](./create-deploy-workflow.md)                         | GitHub Actions workflow for automated production deployment            | Not Started | devops-engineer | Configure OpenNext Build |
| [Implement Post-Deploy Health Check](./implement-post-deploy-health-check.md) | Post-deploy health check step with deployment status reporting         | Not Started | sre-engineer    | Create Deploy Workflow   |
| [Document Rollback Procedure](./document-rollback-procedure.md)               | Rollback documentation for Lambda, database, CloudFront, and Terraform | Not Started | devops-engineer | None                     |

## Dependency Graph

```
Configure OpenNext Build    Document Rollback Procedure (independent)
    |
    v
Create Deploy Workflow
    |
    v
Implement Post-Deploy Health Check
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Configure OpenNext Build + Document Rollback Procedure
2. **Phase 2:** Create Deploy Workflow — depends on OpenNext build configuration
3. **Phase 3:** Implement Post-Deploy Health Check — adds verification to the deploy workflow
