/**
 * Property Test: FailureDetector SQL engine replacement
 * Feature: guideline-violations-cleanup,
 *   Property 3: FailureDetector SQL engine replacement
 *
 * **Validates: Requirements 6.2, 6.3**
 *
 * *For any* query executed by the FailureDetector after
 * `upgradeSqlQueryEngine()` has been called with a replacement engine,
 * the replacement engine's `executeQuery` method should be invoked
 * instead of the previously active engine.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a mock SQL query engine.
 * @param {Function} onCall - Optional callback on execute.
 * @return {{executeQuery: Function}} Mock SQL engine.
 */
function createMockSqlQueryEngine(onCall = null) {
  return {
    executeQuery: async (...args) => {
      if (onCall) {
        onCall(...args);
      }
      return {success: true, rows: []};
    },
  };
}

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  return {
    async updateSystemTableRow() {
      return {success: true};
    },
  };
}

/**
 * Feature: guideline-violations-cleanup
 * Property 3: FailureDetector SQL engine replacement
 */
test('Property 3: FailureDetector SQL engine replacement', async (t) => {
  /**
   * After upgradeSqlQueryEngine() is called with a real engine,
   * all subsequent queries go through the replacement engine, not the
   * previously active engine.
   */
  t.test('queries route to real engine after upgrade', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.array(fc.string(), {minLength: 0, maxLength: 2}),
        async (sql, params) => {
          let realEngineCalled = false;
          let initialEngineCalled = false;
          const mockCDC = createMockCDCService();
          const initialEngine = createMockSqlQueryEngine(() => {
            initialEngineCalled = true;
          });

          const detector = new FailureDetector({
            nodeId: 'test-node',
            sqlQueryEngine: initialEngine,
            cdcIntegrationService: mockCDC,
          });
          detector.initialize();

          const realEngine = {
            executeQuery: async (...executeArgs) => {
              realEngineCalled = true;
              return {success: true, rows: executeArgs};
            },
          };

          detector.upgradeSqlQueryEngine(realEngine);

          await detector.sqlQueryEngine.executeQuery(sql, params);

          return realEngineCalled === true && initialEngineCalled === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('all queries routed to replacement engine after upgrade');
    t.end();
  });
});
