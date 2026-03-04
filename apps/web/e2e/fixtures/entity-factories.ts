// Re-export all entity factory functions and types from the
// canonical browser-compatible module in src/mocks/.
export {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockWorker,
  createMockPersona,
  createMockAuditLogEntry,
  createMockProjectPlan,
  type MockProject,
  type MockEpic,
  type MockStory,
  type MockTask,
  type MockWorker,
  type MockPersona,
  type MockAuditLogEntry,
} from '../../src/mocks/entity-factories';
