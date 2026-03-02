# Configure Branch Protection

## Task Details

- **Title:** Configure Branch Protection
- **Status:** Not Started
- **Assigned Agent:** devops-engineer
- **Parent User Story:** [Configure CI Pipeline](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** Create GitHub Actions CI Workflow

## Description

Document the branch protection rules that should be configured for the `main` branch via the GitHub repository settings. Since branch protection is configured through the GitHub UI or API (not through committed files), this task produces a documentation file and optionally a script that uses the GitHub API to apply the settings.

The branch protection rules ensure that all changes to `main` go through a pull request, pass CI checks, and receive at least one approval before merging.

## Acceptance Criteria

- [ ] A documentation file exists (e.g., `.github/BRANCH_PROTECTION.md`) describing the required branch protection settings
- [ ] Documentation specifies: require pull request reviews (minimum 1 approval)
- [ ] Documentation specifies: dismiss stale reviews on new pushes
- [ ] Documentation specifies: require status checks to pass before merging (referencing the CI workflow jobs: lint, format-check, typecheck, test, build)
- [ ] Documentation specifies: require branches to be up-to-date before merging
- [ ] Documentation specifies: no force pushes to main
- [ ] Documentation specifies: no branch deletions for main
- [ ] Documentation specifies: require linear history (squash or rebase merging preferred)
- [ ] Optionally: a script using `gh api` to programmatically apply branch protection rules

## Technical Notes

- Branch protection cannot be configured via committed files — it requires GitHub repository admin access
- The documentation serves as the source of truth for repository administrators to configure settings
- If creating an automation script, use the GitHub CLI (`gh`) or the GitHub REST API:
  ```bash
  # Example: Apply branch protection via GitHub CLI
  # gh api repos/{owner}/{repo}/branches/main/protection \
  #   --method PUT \
  #   --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  #   --field required_status_checks='{"strict":true,"contexts":["lint","typecheck","test","build"]}'
  ```
- The required status check names must match the job names in the CI workflow (`.github/workflows/ci.yml`)
- Consider requiring signed commits if the team uses GPG signing
- The `require linear history` setting works well with squash merging, which keeps the main branch history clean

## References

- **Functional Requirements:** Protected main branch, code review requirements
- **Design Specification:** GitHub branch protection configuration
- **Project Setup:** Branch protection rules

## Estimated Complexity

Small — Documentation and optional scripting. No code changes, minimal complexity. The main consideration is accurately referencing CI workflow job names.
