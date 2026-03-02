# Implement Shallow Health Check

## Task Details

- **Title:** Implement Shallow Health Check
- **Status:** Not Started
- **Assigned Agent:** sre-engineer
- **Parent User Story:** [Implement Health Check Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a lightweight health check endpoint that indicates whether the application is running and can handle requests. This is used by load balancers for routing decisions and by monitoring tools for uptime tracking.

### Route Definition

```typescript
// pages/api/v1/health/index.ts
// Shallow health check endpoint.
// No authentication required (public endpoint).
// Must respond quickly (< 100ms) for load balancer compatibility.

import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/v1/health
 *
 * Returns basic health information:
 * - status: "healthy" (always, if the handler executes)
 * - timestamp: ISO 8601 timestamp of the response
 * - version: Application version from package.json or environment variable
 * - database: Quick reachability check (can we connect?)
 *
 * Response: 200 OK
 * {
 *   status: "healthy",
 *   timestamp: "2026-03-02T12:00:00.000Z",
 *   version: "1.0.0",
 *   database: "connected"
 * }
 *
 * If the database is unreachable, still return 200 but indicate:
 *   database: "disconnected"
 * (Load balancers use the deep readiness check for routing decisions)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  // Quick database reachability check (SELECT 1)
  let databaseStatus = "connected";
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    databaseStatus = "disconnected";
  }

  return res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? "unknown",
    database: databaseStatus,
  });
}
```

## Acceptance Criteria

- [ ] `GET /api/v1/health` returns 200 with status, timestamp, version, and database status
- [ ] No authentication is required (public endpoint)
- [ ] Response time is under 100ms under normal conditions
- [ ] Database reachability is checked via a lightweight query (`SELECT 1`)
- [ ] If the database is unreachable, the endpoint still returns 200 with `database: "disconnected"`
- [ ] The `version` field reads from `APP_VERSION` environment variable
- [ ] The `timestamp` field is an ISO 8601 string
- [ ] Non-GET methods return 405 Method Not Allowed
- [ ] No `any` types are used in the implementation
- [ ] Response includes `Cache-Control: no-cache` header to prevent caching

## Technical Notes

- The shallow health check should never fail with a 500 unless the Node.js process itself is unhealthy. Even database connectivity issues should be reported as a field value, not an error status code.
- The `SELECT 1` query is the lightest possible database check — it verifies connectivity without touching any tables or data.
- The `APP_VERSION` environment variable should be set during deployment from the git commit SHA or package.json version.
- Consider adding a `uptime_seconds` field calculated from `process.uptime()` for monitoring purposes.

## References

- **Functional Requirements:** FR-HEALTH-001 (shallow health check)
- **Design Specification:** Section 8.1 (Health Check Endpoints)
- **Infrastructure:** AWS ALB health check configuration

## Estimated Complexity

Low — Minimal endpoint with a simple database connectivity check. The main consideration is ensuring it responds quickly and never errors out.
