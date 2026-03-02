# Implement Authentication E2E Tests — Tasks

## User Story Summary

- **Title:** Implement Authentication E2E Tests
- **Description:** E2E tests covering the complete Google OAuth sign-in flow (mocked), session persistence across browser restarts, sign-out with protected route enforcement, and first-time user onboarding empty states with CTA navigation.
- **Status:** Not Started
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** Set Up Playwright Infrastructure

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Test Google OAuth Sign-In Flow](./test-google-oauth-sign-in-flow.md) | E2E test: navigate to app, verify redirect to sign-in, click "Sign in with Google", mocked OAuth completes, redirect to Dashboard, session persists across navigation, and error state when OAuth fails | Not Started | qa-expert | None |
| [Test Session Persistence and Sign-Out](./test-session-persistence-and-sign-out.md) | E2E test: sign in, close tab, reopen and verify still authenticated via refresh token, sign out and verify redirect to sign-in, protected routes inaccessible, and expired session redirect | Not Started | qa-expert | None |
| [Test First-Time User Onboarding](./test-first-time-user-onboarding.md) | E2E test: first-time sign-in shows Dashboard empty state with "Create your first project" CTA visible, click CTA opens Create Project modal | Not Started | qa-expert | None |

## Dependency Graph

```
Test Google OAuth Sign-In Flow        (independent)
Test Session Persistence and Sign-Out (independent)
Test First-Time User Onboarding       (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All three tasks are independent and can be implemented simultaneously. Each tests a distinct authentication scenario using the shared MSW mocking and auth fixtures from the infrastructure story.
