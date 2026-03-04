# Write Project Overview and Prerequisites

## Task Details

- **Title:** Write Project Overview and Prerequisites
- **Status:** Complete
- **Assigned Agent:** technical-writer
- **Parent User Story:** [Generate Comprehensive README.md](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None

## Description

Write the introductory sections of the README.md: Project Overview (what laila.works does, key features, architecture overview with a high-level diagram) and Prerequisites (required tools, accounts, and credentials). These sections orient new developers and ensure they have everything needed before starting.

### Section: Project Overview

```markdown
# laila.works

## Overview

laila.works is an AI Agent Orchestration Service that manages and coordinates
multiple AI agents working on complex, multi-step projects. It provides:

- **Project Structure:** Hierarchical organization with Epics > User Stories > Tasks
- **DAG-Based Dependencies:** Directed Acyclic Graph for task dependency management
- **Automated Work Assignment:** Atomic, conflict-free assignment of stories to AI workers
- **Status Propagation:** Cascading status updates when tasks complete
- **Timeout & Reclamation:** Automatic recovery of timed-out assignments
- **Audit Trail:** Complete event history with DynamoDB + S3 archival

### Architecture
```

[Next.js 14 (Pages Router)]
|
v
[AWS Lambda (ARM64/Graviton2)]
|
+----+----+
| |
v v
[PostgreSQL [DynamoDB
(Neon)] Audit Logs]
|
+----+----+----+
| | | |
v v v v
[SQS] [S3] [EventBridge] [CloudFront]

```

**Tech Stack:**
- **Frontend/API:** Next.js 14 (Pages Router), TypeScript
- **Database:** PostgreSQL (Neon) via Drizzle ORM
- **Audit Logs:** DynamoDB with TTL + S3 archival
- **Compute:** AWS Lambda (ARM64), bundled with tsup
- **CDN:** CloudFront with S3 static assets
- **Async:** SQS for status propagation, EventBridge for scheduled tasks
- **Auth:** Better Auth with Google OAuth
- **IaC:** Terraform
- **CI/CD:** GitHub Actions
- **Observability:** pino, CloudWatch, X-Ray
```

### Section: Prerequisites

```markdown
## Prerequisites

Before you begin, ensure you have the following installed and configured:

### Required Tools

| Tool    | Version | Purpose            |
| ------- | ------- | ------------------ |
| Node.js | 22.x    | JavaScript runtime |
| pnpm    | 9.x     | Package manager    |
| Git     | 2.x+    | Version control    |

### Required Accounts

| Service              | Purpose                                     | Setup Link                       |
| -------------------- | ------------------------------------------- | -------------------------------- |
| Neon                 | PostgreSQL database                         | https://neon.tech                |
| AWS                  | Infrastructure (Lambda, DynamoDB, S3, etc.) | https://aws.amazon.com           |
| Google Cloud Console | OAuth 2.0 credentials                       | https://console.cloud.google.com |
| GitHub               | Repository + Actions CI/CD                  | https://github.com               |

### Required Credentials

| Credential             | Where to Get                                |
| ---------------------- | ------------------------------------------- |
| `DATABASE_URL`         | Neon dashboard > Connection string          |
| `GOOGLE_CLIENT_ID`     | Google Cloud Console > OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console > OAuth 2.0 Client IDs |
| `BETTER_AUTH_SECRET`   | Generate: `openssl rand -base64 32`         |
```

## Acceptance Criteria

- [ ] Project Overview section clearly explains what laila.works does
- [ ] Key features are listed (DAG, work assignment, status propagation, timeout, audit)
- [ ] Architecture diagram shows the high-level system components
- [ ] Tech stack is listed with versions and purposes
- [ ] Prerequisites table lists all required tools with minimum versions
- [ ] Required accounts are listed with signup/setup links
- [ ] Required credentials are listed with instructions on where to obtain them
- [ ] The overview is concise (under 100 lines) and scannable

## Technical Notes

- The architecture diagram uses ASCII art for portability across all Markdown renderers.
- Version requirements should be verified against the actual `package.json` (engines field) and CI configuration.
- The BETTER_AUTH_SECRET generation command uses `openssl rand -base64 32` which produces a 32-byte random string encoded as base64.

## References

- **Project Architecture:** Design Specification, Section 1 (System Overview)
- **Tech Stack:** Project `package.json` and `terraform/versions.tf`

## Estimated Complexity

Low — Primarily a writing task that synthesizes information from across the project.
