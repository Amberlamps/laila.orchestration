# Implement Task Repository

## Task Details

- **Title:** Implement Task Repository
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Base Repository

## Description

Implement the task repository providing CRUD operations for tasks within user stories. Tasks are the atomic units of work and have dependency edges forming a DAG. The repository must support dependency edge management, integration with DAG validation, and bulk status updates for cascading status changes.

## Acceptance Criteria

- [ ] `packages/database/src/repositories/task-repository.ts` exists
- [ ] Extends or uses the base repository for standard CRUD with tenant scoping
- [ ] `create(tenantId, userStoryId, data)` creates a task with `work_status = 'pending'`
- [ ] `update(tenantId, id, data, expectedVersion)` updates task fields with optimistic locking
- [ ] `findByStory(tenantId, storyId, options)` returns paginated tasks for a story
- [ ] `addDependency(tenantId, dependentTaskId, prerequisiteTaskId)`:
  - Creates a dependency edge
  - Validates both tasks belong to the same tenant
  - Validates no self-loop (dependent != prerequisite)
  - Returns the created edge
- [ ] `removeDependency(tenantId, dependentTaskId, prerequisiteTaskId)` removes a dependency edge
- [ ] `getDependencies(tenantId, taskId)` returns all prerequisite tasks for a given task
- [ ] `getDependents(tenantId, taskId)` returns all tasks that depend on a given task
- [ ] `getTaskGraph(tenantId, projectId)` returns all tasks and edges for a project, suitable for DAG construction
- [ ] `bulkUpdateStatus(tenantId, taskIds, newStatus)` updates status for multiple tasks in a single transaction (used when a story is assigned/completed)
- [ ] `findBlockedTasks(tenantId, projectId)` finds tasks whose prerequisites are all complete but status is still `blocked` (for the reconciler)
- [ ] All methods enforce tenant scoping and optimistic locking (where applicable)
- [ ] The repository is exported from `packages/database/src/repositories/index.ts`

## Technical Notes

- Dependency edge management:

  ```typescript
  // packages/database/src/repositories/task-repository.ts
  // Task repository with dependency (DAG) edge management
  // Dependencies form a DAG — cycle detection is handled by the domain layer

  async addDependency(
    tenantId: string,
    dependentTaskId: string,
    prerequisiteTaskId: string,
  ) {
    // Validate no self-loop
    if (dependentTaskId === prerequisiteTaskId) {
      throw new ValidationError('A task cannot depend on itself');
    }

    // Validate both tasks exist and belong to the same tenant
    const [dependent, prerequisite] = await Promise.all([
      this.findById(tenantId, dependentTaskId),
      this.findById(tenantId, prerequisiteTaskId),
    ]);

    if (!dependent || !prerequisite) {
      throw new NotFoundError('Task', dependentTaskId);
    }

    // Insert the edge (unique constraint prevents duplicates)
    return await db.insert(taskDependencyEdges).values({
      tenantId,
      dependentTaskId,
      prerequisiteTaskId,
    }).returning();
  }
  ```

- The `getTaskGraph` method returns all data needed for the domain layer to construct and validate the DAG:

  ```typescript
  // Returns tasks and edges for building a DAG data structure
  async getTaskGraph(tenantId: string, projectId: string) {
    const tasks = await db.query.tasks.findMany({
      where: and(
        eq(tasksTable.tenantId, tenantId),
        isNull(tasksTable.deletedAt),
        // Join through stories and epics to filter by project
      ),
    });

    const edges = await db
      .select()
      .from(taskDependencyEdges)
      .where(eq(taskDependencyEdges.tenantId, tenantId));

    return { tasks, edges };
  }
  ```

- Bulk status update for cascading changes:
  ```typescript
  // When a story is assigned, all its tasks transition to in_progress
  // When a story is completed, all its tasks transition to done
  async bulkUpdateStatus(tenantId: string, taskIds: string[], newStatus: string) {
    await db
      .update(tasksTable)
      .set({ workStatus: newStatus, updatedAt: new Date() })
      .where(and(
        inArray(tasksTable.id, taskIds),
        eq(tasksTable.tenantId, tenantId),
      ));
  }
  ```
- The `findBlockedTasks` method is used by the dag-reconciler Lambda to find tasks that should be unblocked:
  ```sql
  -- Find tasks that are blocked but all prerequisites are done
  SELECT t.* FROM tasks t
  WHERE t.work_status = 'blocked'
    AND t.tenant_id = $1
    AND NOT EXISTS (
      SELECT 1 FROM task_dependency_edges e
      JOIN tasks prereq ON prereq.id = e.prerequisite_task_id
      WHERE e.dependent_task_id = t.id
        AND prereq.work_status != 'done'
    )
  ```
- Note: cycle detection is NOT the repository's responsibility — it delegates to the domain layer's DAG module. The repository only manages CRUD for edges.

## References

- **Functional Requirements:** Task CRUD, dependency management, bulk status updates
- **Design Specification:** DAG structure, dependency edge management
- **Project Setup:** packages/database repositories module

## Estimated Complexity

Large — Complex dependency management with graph queries, bulk operations, and integration points with the DAG domain module. The `getTaskGraph` and `findBlockedTasks` queries require careful SQL construction.
