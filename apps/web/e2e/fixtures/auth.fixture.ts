// Re-export auth handlers and test constants from the
// canonical browser-compatible module in src/mocks/.
export {
  TEST_USER,
  TEST_SESSION,
  authHandlers,
  expiredSessionHandler,
  oauthFailureHandler,
} from '../../src/mocks/auth-handlers';
