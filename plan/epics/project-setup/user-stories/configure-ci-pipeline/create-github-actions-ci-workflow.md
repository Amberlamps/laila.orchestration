# Create GitHub Actions CI Workflow

## Task Details

- **Title:** Create GitHub Actions CI Workflow
- **Status:** Not Started
- **Assigned Agent:** devops-engineer
- **Parent User Story:** [Configure CI Pipeline](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None

## Description

Create a comprehensive GitHub Actions CI workflow (`.github/workflows/ci.yml`) that runs on every pull request and push to the main branch. The workflow should validate code quality, type safety, test coverage, build integrity, and OpenAPI specification correctness.

The pipeline should be optimized for speed using:
- pnpm caching for fast dependency installation
- Parallel job execution where possible
- Fail-fast behavior to abort early on critical failures

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` exists and is valid YAML
- [ ] Workflow triggers on: `push` to `main`, `pull_request` to `main`
- [ ] Workflow uses `pnpm/action-setup` for pnpm installation with caching
- [ ] Workflow uses `actions/setup-node` with Node.js 22.x and pnpm cache
- [ ] **Install step:** `pnpm install --frozen-lockfile` (ensures lockfile integrity)
- [ ] **Lint step:** `pnpm lint` runs ESLint across all packages
- [ ] **Format check step:** `pnpm format:check` validates Prettier formatting
- [ ] **Type-check step:** `pnpm typecheck` runs `tsc --noEmit` across all packages
- [ ] **Test step:** `pnpm test` runs Vitest across all packages
- [ ] **Build step:** `pnpm build` builds all packages and the web app
- [ ] **OpenAPI validation step:** Runs Spectral linting on the OpenAPI spec
- [ ] **OpenAPI freshness step:** Verifies generated types are up-to-date with the spec
- [ ] Jobs are structured for maximum parallelism (lint, format, typecheck can run in parallel; build depends on typecheck)
- [ ] Workflow uses `concurrency` to cancel in-progress runs for the same PR
- [ ] Workflow outputs are visible in GitHub PR checks

## Technical Notes

- Use `pnpm/action-setup@v4` for pnpm installation in CI
- Enable pnpm store caching with `actions/cache` or the built-in pnpm caching in `actions/setup-node`
- Structure jobs to maximize parallelism:
  ```yaml
  # ci.yml job structure
  # install -> [lint, format-check, typecheck, test] -> build -> openapi-validate
  jobs:
    install:
      # Cache node_modules and pnpm store
    lint:
      needs: install
    format-check:
      needs: install
    typecheck:
      needs: install
    test:
      needs: install
    build:
      needs: [typecheck]
    openapi-validate:
      needs: install
  ```
- Use `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` for PR efficiency
- Consider adding `continue-on-error: false` explicitly for clarity on critical steps
- The OpenAPI validation job should run `pnpm --filter @laila/api-spec lint:spec` and `pnpm --filter @laila/api-spec check:freshness`
- Use a matrix strategy if testing against multiple Node.js versions is desired (currently only 22.x)

## References

- **Functional Requirements:** Automated code quality gates
- **Design Specification:** GitHub Actions CI/CD
- **Project Setup:** CI pipeline configuration

## Estimated Complexity

Medium — Multiple jobs with dependency ordering, caching configuration, and OpenAPI-specific validation steps. Requires understanding of GitHub Actions job dependencies and pnpm workspace behavior in CI.
