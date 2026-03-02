# Test Persona CRUD and Deletion Guard

## Task Details

- **Title:** Test Persona CRUD and Deletion Guard
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Entity Management E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the full persona CRUD lifecycle with deletion guard enforcement. Create a persona, verify it appears in the list, edit its title and description, verify the changes are persisted, attempt to delete a persona that has active task references, verify the deletion is blocked with an explanatory tooltip, remove the task references, and verify the deletion succeeds.

### Test: Persona CRUD and Deletion Guard

```typescript
// apps/web/e2e/entity-management/persona-crud.spec.ts
// E2E tests for persona CRUD operations with deletion guard.
// Verifies create, read, update, delete, and the referential
// integrity guard that prevents deleting personas with active tasks.
import { test, expect } from "../fixtures";
import { PersonaListPage } from "../page-objects";

test.describe("Persona CRUD and Deletion Guard", () => {
  test("create persona and verify in list", async ({
    authenticatedPage: page,
  }) => {
    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Create a new persona.
    await personaList.createPersona(
      "Backend Developer",
      "Specializes in Node.js, TypeScript, and database design"
    );

    // Verify the persona appears in the list.
    await personaList.expectPersonaInList("Backend Developer");
  });

  test("edit persona title and description", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a persona to edit.
    seedData({});

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Verify the original persona is in the list.
    await personaList.expectPersonaInList("Backend Developer");

    // Edit the persona.
    await personaList.editPersona(
      "Backend Developer",
      "Full-Stack Engineer",
      "Builds end-to-end features with React and Node.js"
    );

    // Verify the updated persona appears in the list.
    await personaList.expectPersonaInList("Full-Stack Engineer");

    // Verify the old title is no longer in the list.
    await personaList.expectPersonaNotInList("Backend Developer");
  });

  test("delete persona blocked when referenced by active tasks", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a persona that is referenced by one or more tasks.
    seedData({});

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Attempt to delete the persona that has active task references.
    await personaList.expectDeletionBlocked("Backend Developer");

    // Verify the persona is still in the list (not deleted).
    await personaList.expectPersonaInList("Backend Developer");
  });

  test("delete persona succeeds after removing task references", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a persona with no task references (or after references are removed).
    seedData({});

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Verify the persona has no active references (delete should work).
    const deleted = await personaList.deletePersona("Unused Persona");
    expect(deleted).toBe(true);

    // Verify the persona is removed from the list.
    await personaList.expectPersonaNotInList("Unused Persona");
  });

  test("deletion guard tooltip shows referencing task count", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a persona referenced by 3 tasks.
    seedData({});

    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Hover over the delete button to see the tooltip.
    const row = personaList.personasTable.getByRole("row", {
      name: /Backend Developer/,
    });
    const deleteButton = row.getByRole("button", { name: /delete/i });
    await deleteButton.hover();

    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/referenced by/i);
    await expect(tooltip).toContainText(/3 tasks/i);
  });

  test("full CRUD lifecycle: create → read → update → delete", async ({
    authenticatedPage: page,
  }) => {
    const personaList = new PersonaListPage(page);
    await personaList.goto();

    // Create.
    await personaList.createPersona(
      "DevOps Engineer",
      "Manages CI/CD pipelines and infrastructure"
    );
    await personaList.expectPersonaInList("DevOps Engineer");

    // Update.
    await personaList.editPersona(
      "DevOps Engineer",
      "Platform Engineer",
      "Builds and maintains developer platforms"
    );
    await personaList.expectPersonaInList("Platform Engineer");
    await personaList.expectPersonaNotInList("DevOps Engineer");

    // Delete (no task references, so deletion should succeed).
    const deleted = await personaList.deletePersona("Platform Engineer");
    expect(deleted).toBe(true);
    await personaList.expectPersonaNotInList("Platform Engineer");
  });
});
```

## Acceptance Criteria

- [ ] Test verifies creating a persona shows it in the personas list with a success toast
- [ ] Test verifies editing a persona's title and description updates the list entry
- [ ] Test verifies the old persona title disappears after editing
- [ ] Test verifies attempting to delete a persona with active task references is blocked
- [ ] Test verifies the deletion-blocked tooltip appears on hover with the referencing task count
- [ ] Test verifies deleting a persona with no task references succeeds and removes it from the list
- [ ] Test verifies the full CRUD lifecycle (create → read → update → delete) in a single flow
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The deletion guard is enforced server-side: `DELETE /api/v1/personas/:id` returns a 409 Conflict when the persona is referenced by tasks. The client renders this as a disabled delete button with a tooltip.
- The tooltip text includes the count of referencing tasks (e.g., "Referenced by 3 tasks") to help the user understand why deletion is blocked.
- Persona editing uses a modal with pre-filled form fields. The POM `editPersona` method handles opening the edit modal, clearing the fields, and entering new values.
- The MSW handler for persona deletion checks the in-memory data store for task references before allowing deletion.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — entity management)
- **Functional Requirements:** FR-PERSONA-001 (persona CRUD), FR-PERSONA-002 (deletion guard for referenced personas)
- **Design Specification:** Persona list page, edit modal, deletion guard tooltip

## Estimated Complexity

Medium — The CRUD operations are standard, but the deletion guard requires specific seed data (personas with and without task references) and tooltip assertion. The full lifecycle test validates the complete flow.
