# Configure Spectral Linting

## Task Details

- **Title:** Configure Spectral Linting
- **Status:** Complete
- **Assigned Agent:** api-designer
- **Parent User Story:** [Create OpenAPI Specification](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** Write OpenAPI Spec

## Description

Set up Stoplight Spectral for linting the OpenAPI 3.1 specification. Spectral enforces API design standards, catches common mistakes, and ensures consistency across all endpoint definitions. It acts as an "ESLint for API specs."

The linting ruleset should enforce conventions like:

- Consistent naming (camelCase for properties, kebab-case for paths)
- Required error responses on all endpoints
- Descriptions on all operations, parameters, and schemas
- No unused components
- Valid examples and schema references

## Acceptance Criteria

- [ ] `@stoplight/spectral-cli` is installed as a devDependency in `packages/api-spec`
- [ ] `packages/api-spec/.spectral.yaml` exists with a custom ruleset
- [ ] The ruleset extends `spectral:oas` (Spectral's built-in OpenAPI rules)
- [ ] Custom rules enforce:
  - All operations have a `description`
  - All operations have an `operationId`
  - All path parameters have a `description`
  - All 4xx and 5xx responses reference the standard `ErrorResponse` schema
  - Property names use camelCase
  - Path segments use kebab-case
- [ ] `packages/api-spec/package.json` includes a `lint:spec` script: `"lint:spec": "spectral lint openapi.yaml"`
- [ ] Running `pnpm --filter @laila/api-spec lint:spec` passes with no errors or warnings on the current spec
- [ ] Spectral output is human-readable and indicates the rule name for each violation

## Technical Notes

- Spectral configuration file:

  ```yaml
  # packages/api-spec/.spectral.yaml
  # API linting rules for the OpenAPI specification
  # Extends the standard OpenAPI ruleset with project-specific conventions
  extends:
    - spectral:oas

  rules:
    # Ensure all operations have descriptions for documentation quality
    operation-description:
      severity: warn
    # Ensure all operations have unique operationIds for code generation
    operation-operationId:
      severity: error
    # Enforce camelCase for JSON property names
    oas3-schema:
      severity: error
    # Custom rule: all error responses should reference ErrorResponse
    error-response-schema:
      description: 'All 4xx/5xx responses must use the standard ErrorResponse schema'
      severity: warn
      given: "$.paths.*.*.responses[?(@property >= '400')]"
      then:
        field: 'content.application/json.schema.$ref'
        function: pattern
        functionOptions:
          match: '#/components/schemas/ErrorResponse'
  ```

- Spectral supports custom functions for complex rules, but built-in functions (`pattern`, `truthy`, `defined`, `enumeration`) cover most needs
- The `spectral:oas` preset includes rules for:
  - Valid OpenAPI structure
  - No unused definitions
  - Valid schema references
  - Required contact info
  - Valid examples
- Consider adding `--fail-severity=warn` to the CI command to fail on warnings too, ensuring all issues are addressed
- Spectral can output in JSON, text, or JUnit formats — JUnit is useful for CI test reporting

## References

- **Functional Requirements:** API design quality enforcement
- **Design Specification:** Spectral linting, OpenAPI standards
- **Project Setup:** API specification quality checks

## Estimated Complexity

Small — Spectral setup is straightforward with the built-in ruleset. Custom rules require some YAML configuration but follow well-documented patterns.
