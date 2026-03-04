// Re-export API handlers and data management functions from the
// canonical browser-compatible module in src/mocks/.
export {
  apiHandlers,
  resetTestData,
  seedTestData,
  type TestDataStore,
} from '../../src/mocks/api-handlers';
