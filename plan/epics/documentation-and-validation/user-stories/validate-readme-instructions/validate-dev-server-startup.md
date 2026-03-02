# Validate Dev Server Startup

## Task Details

- **Title:** Validate Dev Server Startup
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Validate README.md Instructions](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None (depends on User Story 1: Generate Comprehensive README.md)

## Description

Run the development server command documented in the README, verify the process starts successfully, confirm the documented URL is accessible, and gracefully stop the server. This validates the local development workflow from the README.

### Validation Steps

```bash
# Step 1: Ensure .env.local exists with required variables
# (Verify DATABASE_URL, BETTER_AUTH_SECRET, etc. are set)

# Step 2: Start the development server
pnpm dev &
DEV_PID=$!

# Step 3: Wait for the server to be ready (Next.js outputs "Ready" when started)
# Allow up to 30 seconds for compilation
sleep 15

# Step 4: Verify the server is accessible at the documented URL
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200 (or 302 if auth redirect)

# Step 5: Verify the health endpoint responds
curl -s http://localhost:3000/api/v1/health
# Expected: 200 with JSON body { "status": "healthy" }

# Step 6: Gracefully stop the server
kill $DEV_PID
wait $DEV_PID 2>/dev/null
```

### Success Criteria

- `pnpm dev` starts without errors
- The server is accessible at `http://localhost:3000`
- The health endpoint returns HTTP 200
- The server can be gracefully stopped

## Acceptance Criteria

- [ ] `pnpm dev` starts the Next.js development server without errors
- [ ] The server outputs "Ready" (or equivalent) indicating successful startup
- [ ] `http://localhost:3000` responds with HTTP 200 or 302 (auth redirect)
- [ ] `/api/v1/health` responds with HTTP 200 and a JSON health status
- [ ] The dev server can be stopped gracefully with SIGTERM
- [ ] Hot reload works: modifying a page file triggers recompilation
- [ ] The documented URL in the README matches the actual dev server URL

## Technical Notes

- The dev server may return 302 (redirect to login) on the root URL if authentication is required. This is acceptable — it means the server is running.
- The health endpoint (`/api/v1/health`) should respond without authentication, making it the ideal test for verifying the server is running.
- Hot reload verification: modify a file, observe the terminal for recompilation output, refresh the browser to verify the change is reflected.
- The `.env.local` file must exist with valid `DATABASE_URL` for the server to start successfully (database connections are established on startup).

## References

- **README Section:** Local Development (from Task: Write Installation and Development Guide)
- **Next.js Dev Server:** https://nextjs.org/docs/getting-started

## Estimated Complexity

Low — Starting a dev server and hitting a URL. The main risk is environment variable misconfiguration.
