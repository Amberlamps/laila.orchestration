# Write Shared Package Tests

## Task Details

- **Title:** Write Shared Package Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement @laila/shared Zod Schemas and Types](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** Define Entity Schemas, Define API Request/Response Schemas, Define Shared Utility Types

## Description

Write comprehensive unit tests for all Zod schemas in the `@laila/shared` package using Vitest. Tests should validate that schemas correctly accept valid inputs and reject invalid inputs, ensuring the validation rules are enforced at runtime.

These tests serve as living documentation of the schema contracts and guard against accidental breaking changes to validation rules.

## Acceptance Criteria

- [ ] Test file `packages/shared/src/schemas/__tests__/project.test.ts` validates `projectSchema` with valid and invalid inputs
- [ ] Test file `packages/shared/src/schemas/__tests__/epic.test.ts` validates `epicSchema`
- [ ] Test file `packages/shared/src/schemas/__tests__/user-story.test.ts` validates `userStorySchema`
- [ ] Test file `packages/shared/src/schemas/__tests__/task.test.ts` validates `taskSchema`
- [ ] Test file `packages/shared/src/schemas/__tests__/worker.test.ts` validates `workerSchema`
- [ ] Test file `packages/shared/src/schemas/__tests__/persona.test.ts` validates `personaSchema`
- [ ] Test file for API schemas validates create, update, and list query schemas
- [ ] Test file for work assignment response validates all three discriminated union variants (assigned, blocked, all_complete)
- [ ] Test file for pagination schema validates query parsing (coercion, defaults) and paginated response wrapping
- [ ] Test file for error envelope validates error code enum enforcement and field-level error details
- [ ] Each test file includes positive tests (valid data passes) and negative tests (invalid data is rejected with expected error messages)
- [ ] Tests validate edge cases: empty strings, negative numbers, invalid UUIDs, missing required fields, extra fields (strict mode behavior)
- [ ] Tests validate enum enforcement: invalid status values are rejected
- [ ] Tests validate `.nullable()` fields accept both values and null
- [ ] All tests pass with `pnpm --filter @laila/shared test`
- [ ] No usage of the `any` type in test files — all test data is properly typed

## Technical Notes

- Test pattern for Zod schemas:
  ```typescript
  // packages/shared/src/schemas/__tests__/project.test.ts
  // Unit tests for the Project entity Zod schema
  // Validates correct acceptance and rejection of input shapes
  import { describe, it, expect } from 'vitest';
  import { projectSchema } from '../project';

  describe('projectSchema', () => {
    const validProject = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Project',
      description: 'A test project description',
      lifecycleStatus: 'draft',
      workStatus: 'pending',
      version: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    } as const;

    it('accepts a valid project', () => {
      const result = projectSchema.safeParse(validProject);
      expect(result.success).toBe(true);
    });

    it('rejects an invalid lifecycle status', () => {
      const result = projectSchema.safeParse({
        ...validProject,
        lifecycleStatus: 'invalid_status',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a non-UUID id', () => {
      const result = projectSchema.safeParse({
        ...validProject,
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('accepts null for deletedAt', () => {
      const result = projectSchema.safeParse(validProject);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedAt).toBeNull();
      }
    });

    it('accepts a datetime for deletedAt', () => {
      const result = projectSchema.safeParse({
        ...validProject,
        deletedAt: '2026-06-01T12:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });
  });
  ```
- Use `safeParse` instead of `parse` in tests to avoid thrown exceptions — check `result.success` and `result.error` instead
- For discriminated union tests, verify that each variant is accepted and that mixing fields from different variants fails
- Test the pagination factory by creating a paginated response schema for a simple schema and validating the wrapped structure
- Use `as const` on test fixtures for better type inference without resorting to `any`
- Consider using Vitest's `it.each` for parameterized tests over enum values
- Ensure all test data fixtures are typed using the inferred types from the schemas, not `any`

## References

- **Functional Requirements:** Schema validation correctness
- **Design Specification:** Zod schema validation, runtime type safety
- **Project Setup:** Vitest testing framework

## Estimated Complexity

Medium — Comprehensive test coverage across multiple schema files with positive, negative, and edge case testing. Volume of tests is significant but each individual test is straightforward.
