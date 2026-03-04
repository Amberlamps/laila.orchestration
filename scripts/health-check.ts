/**
 * Post-deploy health check script.
 * Called by the GitHub Actions deployment workflow after Terraform apply.
 * Verifies that the production application is responding correctly.
 *
 * Usage: npx tsx scripts/health-check.ts
 *
 * Environment variables:
 *   HEALTH_CHECK_URL            - Production URL (preferred, set by deploy workflow)
 *   PRODUCTION_URL              - Production URL (fallback)
 *   HEALTH_CHECK_MAX_RETRIES    - Number of retry attempts (default: 5)
 *   HEALTH_CHECK_RETRY_DELAY_MS - Delay between retries in ms (default: 10000)
 *   Default URL: https://laila.works
 */

const parseEnvInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

const PRODUCTION_URL =
  process.env.HEALTH_CHECK_URL ?? process.env.PRODUCTION_URL ?? 'https://laila.works';
const MAX_RETRIES = parseEnvInt(process.env.HEALTH_CHECK_MAX_RETRIES, 5);
const RETRY_DELAY_MS = parseEnvInt(process.env.HEALTH_CHECK_RETRY_DELAY_MS, 10_000);
const REQUEST_TIMEOUT_MS = 10_000; // 10 seconds per request

interface HealthCheckResult {
  status: string;
  version?: string;
  timestamp?: string;
  checks?: Record<string, { status: string; latency_ms: number }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Check a single health endpoint with retries.
 * CloudFront may take a few seconds to propagate the new Lambda version,
 * so we retry with a fixed delay between attempts.
 */
async function checkEndpoint(path: string, description: string): Promise<void> {
  const url = `${PRODUCTION_URL}${path}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 200) {
        const body = (await response.json()) as HealthCheckResult;

        console.log(`[PASS] ${description}: ${body.status} (attempt ${String(attempt)})`);
        return;
      }

      console.warn(
        `[RETRY] ${description}: HTTP ${String(response.status)} (attempt ${String(attempt)}/${String(MAX_RETRIES)})`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      console.warn(
        `[RETRY] ${description}: ${message} (attempt ${String(attempt)}/${String(MAX_RETRIES)})`,
      );
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  // All retries exhausted
  throw new Error(`[FAIL] ${description}: failed after ${String(MAX_RETRIES)} attempts`);
}

/**
 * Main health check runner.
 * Checks both liveness and readiness endpoints.
 * Exits with code 0 on success, code 1 on failure.
 */
async function main(): Promise<void> {
  console.log(`Running health checks against ${PRODUCTION_URL}...`);

  console.log('---');

  try {
    // Liveness check: is the application running?
    await checkEndpoint('/api/v1/health', 'Liveness check');

    // Readiness check: are all dependencies (database, DynamoDB) available?
    await checkEndpoint('/api/v1/health/ready', 'Readiness check');

    console.log('---');

    console.log('All health checks passed.');
    process.exit(0);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    console.error('---');

    console.error(`Health check failed: ${message}`);
    process.exit(1);
  }
}

void main();
