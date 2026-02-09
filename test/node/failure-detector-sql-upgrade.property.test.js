/**
 * Property Test: FailureDetector SQL engine upgrade
 * Feature: guideline-violations-cleanup,
 *   Property 3: FailureDetector SQL engine upgrade
 *
 * **Validates: Requirements 6.2, 6.3**
 *
 * *For any* query executed by the FailureDetector after
 * `upgradeSqlQueryEngine()` has been called with a real engine,
 * the real SQL engine's `executeQuery` method should be invoked
 * (not the cache-backed facade).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {FAILURE_DETECTOR_SQL} from '../../src/node/node-constants.js';
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
 * Create a mock system table cache with minimal data.
 * @return {Object} Mock system table cache.
 */
function createMockSystemTableCache() {
  return {
    getAll: () => [],
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
 * Property 3: FailureDetector SQL engine upgrade
 */
test('Property 3: FailureDetector SQL engine upgrade', async (t) => {
  /**
   * After upgradeSqlQueryEngine() is called with a real engine,
   * all subsequent queries go through the real engine, not the
   * cache-backed facade.
   */
  t.test('queries route to real engine after upgrade', async (t) => {
    const sqlArb = fc.constantFrom(
      FAILURE_DETECTOR_SQL.SELECT_ALL_NODES,
      FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE,
    );

    await fc.assert(
      fc.asyncProperty(
        sqlArb,
        fc.array(fc.string(), {minLength: 0, maxLength: 2}),
        async (sql, params) => {
          let realEngineCalled = false;
          let facadeCalled = false;

          const mockCache = createMockSystemTableCache();
          const mockCDC = createMockCDCService();

          // Create detector with cache but no SQL engine
          // so it creates the cache-backed facade
          const detector = new FailureDetector({
            nodeId: 'test-node',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
          });
          detector.initialize();

          // Spy on the facade by wrapping the current engine
          const facade = detector.sqlQueryEngine;
          const originalFacadeExecute = facade.executeQuery;
          facade.executeQuery = async (...args) => {
            facadeCalled = true;
            return originalFacadeExecute(...args);
          };

          // Create a real engine that tracks calls
          const realEngine = {
            executeQuery: async () => {
              realEngineCalled = true;
              return {success: true, rows: []};
            },
          };

          // Upgrade to the real engine
          detector.upgradeSqlQueryEngine(realEngine);

          // Execute a query after upgrade
          await detector.sqlQueryEngine.executeQuery(sql, params);

          // The real engine should have been called
          return realEngineCalled === true && facadeCalled === false;
        },
      ),
      {numRuns: 10},
    );
    t.pass('all queries routed to real engine after upgrade');
    t.end();
  });
});
