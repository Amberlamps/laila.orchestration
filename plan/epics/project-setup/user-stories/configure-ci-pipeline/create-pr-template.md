# Create PR Template

## Task Details

- **Title:** Create PR Template
- **Status:** Not Started
- **Assigned Agent:** devops-engineer
- **Parent User Story:** [Configure CI Pipeline](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None

## Description

Create a pull request template and CODEOWNERS file to standardize the code review process. The PR template guides contributors to provide structured information about their changes, while CODEOWNERS ensures that changes to critical paths are reviewed by the appropriate team members.

## Acceptance Criteria

- [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists with structured sections
- [ ] PR template includes: Summary, Type of Change (checkboxes), Testing, Screenshots (if applicable), Checklist
- [ ] PR template checklist includes items for: tests written, documentation updated, no breaking changes, linting passes
- [ ] `CODEOWNERS` file exists at the repository root
- [ ] CODEOWNERS defines ownership for critical paths:
  - `packages/database/` — database team
  - `packages/api-spec/` — API design team
  - `packages/domain/` — backend team
  - `.github/` — DevOps team
  - `terraform/` — DevOps team
- [ ] CODEOWNERS file syntax is valid (GitHub format)

## Technical Notes

- The PR template uses standard GitHub Markdown with checkboxes (`- [ ]`)
- CODEOWNERS uses the same syntax as `.gitignore` for path matching
- CODEOWNERS entries should use GitHub team names or usernames (placeholder values are acceptable for initial setup)
- Example PR template structure:
  ```markdown
  ## Summary
  <!-- Brief description of the changes -->

  ## Type of Change
  - [ ] Bug fix
  - [ ] New feature
  - [ ] Breaking change
  - [ ] Documentation update
  - [ ] Infrastructure/DevOps

  ## Testing
  <!-- How were these changes tested? -->

  ## Checklist
  - [ ] Tests written and passing
  - [ ] No type errors (`pnpm typecheck`)
  - [ ] Linting passes (`pnpm lint`)
  - [ ] Documentation updated (if applicable)
  ```
- Place CODEOWNERS in the repository root (not in `.github/`) for visibility, though GitHub supports both locations

## References

- **Functional Requirements:** Standardized code review process
- **Design Specification:** GitHub collaboration standards
- **Project Setup:** PR workflow configuration

## Estimated Complexity

Small — Template files with static content. No logic or configuration complexity.
