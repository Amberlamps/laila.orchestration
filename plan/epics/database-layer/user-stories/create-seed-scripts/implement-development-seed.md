# Implement Development Seed

## Task Details

- **Title:** Implement Development Seed
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Create Seed Scripts](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** None (within this user story; depends on Implement Repository Layer and Define PostgreSQL Schema)

## Description

Create a development seed script that populates the database with realistic sample data for local development. The seed should create a rich dataset that exercises all features of the application, including projects in various lifecycle stages, epics with different work statuses, user stories with assignments, tasks with dependency edges, workers with API keys, and personas.

The development seed provides developers with a pre-populated database for:

- Testing UI components with realistic data volumes and edge cases
- Verifying API responses with various entity states
- Demonstrating the application's features
- Debugging issues with a known dataset

## Acceptance Criteria

- [ ] `packages/database/src/seed/development.ts` exists with the seed script
- [ ] Script creates 1 test user (for the tenant_id pattern)
- [ ] Script creates 2-3 projects in different lifecycle stages (draft, active, completed)
- [ ] Each project has 2-4 epics with varying work statuses
- [ ] Each epic has 3-6 user stories with different priorities and statuses
- [ ] User stories include: pending, ready, in_progress (assigned), done, and failed examples
- [ ] Each user story has 2-5 tasks with acceptance criteria and technical notes
- [ ] Tasks include dependency edges forming valid DAGs (no cycles):
  - At least one linear dependency chain (A -> B -> C)
  - At least one fan-out pattern (A -> B, A -> C)
  - At least one fan-in pattern (B -> D, C -> D)
- [ ] Script creates 2-3 workers with generated API keys (logged to console for development use)
- [ ] Workers have project access grants to different projects
- [ ] Script creates 4-6 personas (e.g., "Backend Developer", "Frontend Developer", "QA Engineer", "Database Administrator", "DevOps Engineer")
- [ ] Tasks reference personas for assignment matching
- [ ] At least one user story has attempt history records (previous failed attempt)
- [ ] Script is idempotent — can be run multiple times without errors (checks for existing data or clears before seeding)
- [ ] Script is runnable via `pnpm --filter @laila/database db:seed:dev`
- [ ] Script outputs a summary of created data to the console
- [ ] All data uses realistic names and descriptions (not "Test Project 1")

## Technical Notes

- Seed script structure:

  ```typescript
  // packages/database/src/seed/development.ts
  // Development seed script — populates the database with realistic sample data
  // Run with: pnpm --filter @laila/database db:seed:dev
  // This seed is idempotent: it clears existing data before inserting
  import { getDb } from '../client';
  import * as schema from '../schema';

  async function seed() {
    const db = getDb();
    console.log('Seeding development database...');

    // Clear existing data (in reverse dependency order)
    await db.delete(schema.attemptHistoryTable);
    await db.delete(schema.taskDependencyEdgesTable);
    await db.delete(schema.tasksTable);
    await db.delete(schema.userStoriesTable);
    await db.delete(schema.epicsTable);
    await db.delete(schema.projectsTable);
    await db.delete(schema.workerProjectAccessTable);
    await db.delete(schema.workersTable);
    await db.delete(schema.personasTable);
    // Note: do NOT delete users/sessions/accounts (auth data)

    // 1. Create or find test user (tenant)
    // 2. Create personas
    // 3. Create workers + API keys
    // 4. Create projects with full hierarchy
    // 5. Create dependency edges
    // 6. Create attempt history
    // 7. Grant worker project access

    console.log('Development seed complete!');
    console.log(`Created: X projects, Y epics, Z stories, W tasks`);
    console.log('Worker API keys (development only):');
    console.log(`  worker-alpha: lw_...`);
    console.log(`  worker-beta:  lw_...`);
  }

  seed().catch(console.error);
  ```

- Use realistic names and descriptions:
  ```typescript
  // Good: realistic project names
  const projects = [
    {
      name: 'E-Commerce Platform Redesign',
      description: 'Complete redesign of the customer-facing e-commerce experience...',
    },
    {
      name: 'API Gateway Migration',
      description: 'Migrate from monolithic API to microservices with an API gateway...',
    },
    { name: 'Mobile App MVP', description: 'First version of the native mobile application...' },
  ];
  ```
- Log worker API keys to console since they are needed for development testing (never log in production)
- The seed should use the repository layer for creating entities (not raw SQL) to ensure all business rules are enforced
- Consider creating a helper function `seedProject(db, tenantId, projectConfig)` that creates the full hierarchy from a configuration object

## References

- **Functional Requirements:** Development environment with sample data
- **Design Specification:** Entity relationships, dependency DAG, worker authentication
- **Project Setup:** packages/database seed module

## Estimated Complexity

Medium — Creating a realistic dataset with proper relationships, dependency DAGs, and various entity states requires careful orchestration. The volume of data is significant but each individual insert is straightforward.
