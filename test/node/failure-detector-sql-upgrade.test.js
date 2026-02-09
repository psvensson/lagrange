/**
 * Unit tests for FailureDetector cache-backed facade creation and upgrade.
 * Requirements: 6.1, 6.2, 6.3
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
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

test('FailureDetector - creates cache-backed facade when no SQL engine', async (t) => {
  const mockCache = createMockSystemTableCache();
  const mockCDC = createMockCDCService();

  const detector = new FailureDetector({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  t.equal(detector._usingCacheBackedFacade, true,
    'should set _usingCacheBackedFacade to true');
  t.ok(detector.sqlQueryEngine, 'should have a sqlQueryEngine');
  t.equal(typeof detector.sqlQueryEngine.executeQuery, 'function',
    'facade should have executeQuery method');

  const result = await detector.sqlQueryEngine.executeQuery(
    FAILURE_DETECTOR_SQL.SELECT_ALL_NODES,
  );
  t.equal(result.success, true, 'facade should return successful results');
  t.end();
});

test('FailureDetector - upgrade replaces facade with real engine', async (t) => {
  const mockCache = createMockSystemTableCache();
  const mockCDC = createMockCDCService();

  const detector = new FailureDetector({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  t.equal(detector._usingCacheBackedFacade, true,
    'should start with cache-backed facade');

  const realEngine = {
    executeQuery: async () => ({success: true, rows: [{id: 'real'}]}),
  };

  detector.upgradeSqlQueryEngine(realEngine);

  t.equal(detector._usingCacheBackedFacade, false,
    'should set _usingCacheBackedFacade to false after upgrade');
  t.equal(detector.sqlQueryEngine, realEngine,
    'should replace sqlQueryEngine with real engine');

  const result = await detector.sqlQueryEngine.executeQuery(
    FAILURE_DETECTOR_SQL.SELECT_ALL_NODES,
  );
  t.equal(result.rows[0].id, 'real',
    'queries should go through real engine');
  t.end();
});

test('FailureDetector - upgrade with null is no-op', async (t) => {
  const mockCache = createMockSystemTableCache();
  const mockCDC = createMockCDCService();

  const detector = new FailureDetector({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const facadeEngine = detector.sqlQueryEngine;
  t.equal(detector._usingCacheBackedFacade, true,
    'should start with cache-backed facade');

  detector.upgradeSqlQueryEngine(null);

  t.equal(detector._usingCacheBackedFacade, true,
    'should remain using cache-backed facade after null upgrade');
  t.equal(detector.sqlQueryEngine, facadeEngine,
    'should keep the same facade engine');

  detector.upgradeSqlQueryEngine(undefined);

  t.equal(detector._usingCacheBackedFacade, true,
    'should remain using cache-backed facade after undefined upgrade');
  t.equal(detector.sqlQueryEngine, facadeEngine,
    'should keep the same facade engine after undefined');
  t.end();
});

test('FailureDetector - _usingCacheBackedFacade is false by default', async (t) => {
  const detector = new FailureDetector({
    nodeId: 'test-node',
  });

  t.equal(detector._usingCacheBackedFacade, false,
    'should default to false in constructor');
  t.end();
});
