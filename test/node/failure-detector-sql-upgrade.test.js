/**
 * Unit tests for FailureDetector SQL engine ownership and replacement.
 * Requirements: 6.1, 6.2, 6.3
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
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
 * @return {{executeQuery: Function}} Mock SQL engine.
 */
function createMockSqlQueryEngine() {
  return {
    executeQuery: async () => ({success: true, rows: []}),
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

test('FailureDetector - initialize requires a real SQL engine', async (t) => {
  const mockCDC = createMockCDCService();

  const detector = new FailureDetector({
    nodeId: 'test-node',
    cdcIntegrationService: mockCDC,
  });

  t.throws(
    () => detector.initialize(),
    /requires sqlQueryEngine/,
    'initialize should reject missing canonical SQL engine',
  );
  t.end();
});

test('FailureDetector - initialize accepts the SQL engine exposed by CDC service',
  async (t) => {
    const mockCDC = createMockCDCService();
    const mockEngine = createMockSqlQueryEngine();
    mockCDC.sqlQueryEngine = mockEngine;

    const detector = new FailureDetector({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
    });
    detector.initialize();

    t.equal(detector.sqlQueryEngine, mockEngine,
      'initialize should adopt the canonical CDC SQL engine');
    t.end();
  });

test('FailureDetector - upgrade replaces the current SQL engine', async (t) => {
  const mockCDC = createMockCDCService();
  const initialEngine = createMockSqlQueryEngine();

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: initialEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const realEngine = {
    executeQuery: async () => ({success: true, rows: [{id: 'real'}]}),
  };

  detector.upgradeSqlQueryEngine(realEngine);

  t.equal(detector.sqlQueryEngine, realEngine,
    'should replace sqlQueryEngine with real engine');

  const result = await detector.sqlQueryEngine.executeQuery();
  t.equal(result.rows[0].id, 'real',
    'queries should go through real engine');
  t.end();
});

test('FailureDetector - upgrade with null is no-op', async (t) => {
  const mockCDC = createMockCDCService();
  const initialEngine = createMockSqlQueryEngine();

  const detector = new FailureDetector({
    nodeId: 'test-node',
    sqlQueryEngine: initialEngine,
    cdcIntegrationService: mockCDC,
  });
  detector.initialize();

  const activeEngine = detector.sqlQueryEngine;

  detector.upgradeSqlQueryEngine(null);

  t.equal(detector.sqlQueryEngine, activeEngine,
    'should keep the same engine after null upgrade');

  detector.upgradeSqlQueryEngine(undefined);

  t.equal(detector.sqlQueryEngine, activeEngine,
    'should keep the same engine after undefined');
  t.end();
});
