# Implement Post-Deploy Health Check

## Task Details

- **Title:** Implement Post-Deploy Health Check
- **Status:** Not Started
- **Assigned Agent:** sre-engineer
- **Parent User Story:** [Set Up Deployment Pipeline](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** Create Deploy Workflow

## Description

Implement a post-deploy health check script that verifies the production deployment is healthy after Terraform apply completes. The script hits the `/api/v1/health` and `/api/v1/health/ready` endpoints, verifies 200 responses, and reports status to the GitHub Actions workflow via exit codes and deployment status notifications.

### Health Check Script

```typescript
// scripts/health-check.ts
// Post-deploy health check script.
// Called by the GitHub Actions deployment workflow after Terraform apply.
// Verifies that the production application is responding correctly.

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? "https://laila.works";
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 10_000; // 10 seconds between retries

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  checks: Record<string, { status: string; latency_ms: number }>;
}

/**
 * Check a single health endpoint with retries.
 * CloudFront may take a few seconds to propagate the new Lambda version,
 * so we retry with exponential backoff.
 */
async function checkEndpoint(
  path: string,
  description: string
): Promise<void> {
  const url = `${PRODUCTION_URL}${path}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000), // 10 second timeout
      });

      if (response.ok) {
        const body: HealthResponse = await response.json() as HealthResponse;
        console.log(`[PASS] ${description}: ${body.status} (attempt ${attempt})`);
        return;
      }

      console.warn(
        `[RETRY] ${description}: HTTP ${response.status} (attempt ${attempt}/${MAX_RETRIES})`
      );
    } catch (error) {
      console.warn(
        `[RETRY] ${description}: ${error instanceof Error ? error.message : "Unknown error"} (attempt ${attempt}/${MAX_RETRIES})`
      );
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  // All retries exhausted
  throw new Error(`[FAIL] ${description}: failed after ${MAX_RETRIES} attempts`);
}

/**
 * Main health check runner.
 * Checks both liveness and readiness endpoints.
 * Exits with code 1 on failure (causing the GitHub Actions step to fail).
 */
async function main(): Promise<void> {
  console.log(`Running health checks against ${PRODUCTION_URL}...`);
  console.log("---");

  try {
    // Liveness check: is the application running?
    await checkEndpoint("/api/v1/health", "Liveness check");

    // Readiness check: are all dependencies (database, DynamoDB) available?
    await checkEndpoint("/api/v1/health/ready", "Readiness check");

    console.log("---");
    console.log("All health checks passed.");
    process.exit(0);
  } catch (error) {
    console.error("---");
    console.error("Health check failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
```

## Acceptance Criteria

- [ ] Health check script exists at `scripts/health-check.ts`
- [ ] Script checks `/api/v1/health` (liveness) endpoint
- [ ] Script checks `/api/v1/health/ready` (readiness) endpoint
- [ ] Both endpoints must return HTTP 200 for the check to pass
- [ ] Retries with configurable delay (default 5 retries, 10 second delay)
- [ ] Timeout per request (10 seconds) prevents hanging on unresponsive endpoints
- [ ] Exits with code 0 on success (GitHub Actions step succeeds)
- [ ] Exits with code 1 on failure (GitHub Actions step fails)
- [ ] Logs clear pass/fail/retry messages for debugging in GitHub Actions logs
- [ ] Production URL is configurable via `PRODUCTION_URL` environment variable
- [ ] No `any` types are used in the script

## Technical Notes

- The retry mechanism is necessary because CloudFront cache invalidation and Lambda cold starts can cause a brief window after deployment where the new version is not yet serving requests.
- The liveness endpoint (`/api/v1/health`) should return 200 if the application process is running. It does not check external dependencies.
- The readiness endpoint (`/api/v1/health/ready`) checks all external dependencies: PostgreSQL (Neon), DynamoDB, and S3. If any dependency is unavailable, it returns 503.
- The script uses Node.js built-in `fetch` (available in Node.js 22) without external dependencies.
- `AbortSignal.timeout(10_000)` provides per-request timeouts using the native API.

## References

- **Health Check Endpoints:** Defined in Epic 6 (Core CRUD API)
- **GitHub Actions Integration:** [Create Deploy Workflow](./create-deploy-workflow.md)
- **Kubernetes Health Check Pattern:** Liveness vs. Readiness probes (adapted for serverless)

## Estimated Complexity

Low — Straightforward HTTP health check with retry logic. The main consideration is the retry timing to account for CloudFront propagation delays.
