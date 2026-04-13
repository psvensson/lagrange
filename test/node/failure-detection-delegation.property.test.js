/**
 * Property Test: Failure Detection Delegation
 * **Validates: Requirements 1.1, 1.2**
 *
 * Feature: architecture-violations-cleanup,
 *   Property 1: Safety check delegation (adapted — verify FailureDetector
 *   is sole detector)
 *
 * This property test verifies:
 * 1. NodeLifecycleService does not have any failure detection methods
 * 2. FailureDetector correctly transitions nodes through
 *    suspected → failed on heartbeat timeout
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NodeLifecycleService} from '../../src/node/node-lifecycle-service.js';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  FAILURE_DETECTOR_DEFAULT,
  FAILURE_DETECTOR_SQL,
  NODE_STATUS,
} from '../../src/node/node-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {createMockMutationGateway} from
  './failure-detector-test-helpers.js';

/**
 * Methods that were removed from NodeLifecycleService as part of
 * Violation 1 cleanup. FailureDetector is the sole owner of these.
 */
const REMOVED_FAILURE_DETECTION_METHODS = [
  'detectFailedNodes',
  'startFailureDetection',
  'stopFailureDetection',
  'markNodeFailed',
  'markNodeSuspected',
  'markNodeActive',
];

/**
 * Fields that were removed from NodeLifecycleService as part of
 * Violation 1 cleanup.
 */
const REMOVED_FAILURE_DETECTION_FIELDS = [
  'knownNodes',
  'failureDetectionTimer',
  'heartbeatTimeoutMs',
  'failureDetectionIntervalMs',
];

/**
 * Initialize test dependencies.
 */
function initializeTestDependencies() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Reset test dependencies.
 */
function resetTestDependencies() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

/**
 * Create a mock CDC integration service for testing.
 * @return {Object} Mock CDC integration service with operation log.
 */
function createMockCDCService() {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      return {success: true};
    },
  };
}

/**
 * Create a mock SQL query engine backed by in-memory data.
 * @param {Object} data - Initial data for nodes and services.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlEngine(data = {}) {
  const cache = {
    nodes: data.nodes || [],
    services: data.services || [],
  };

  return {
    async executeQuery(sql, params = []) {
      if (sql === FAILURE_DETECTOR_SQL.SELECT_ALL_NODES) {
        return {rows: cache.nodes, success: true};
      }
      if (sql === FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE) {
        const nodeId = params[0];
        const serviceType = params[1];
        const filtered = cache.services.filter(
          (s) => s.node_id === nodeId && s.service_type === serviceType,
        );
        return {rows: filtered, success: true};
      }
      return {rows: [], success: true};
    },
  };
}

test('Property 1: Failure detection delegation', async (t) => {
  t.beforeEach(() => {
    initializeTestDependencies();
  });

  t.afterEach(() => {
    resetTestDependencies();
  });

  /**
   * Property: For any removed failure detection method name,
   * NodeLifecycleService SHALL NOT have that method defined.
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  t.test(
    'NodeLifecycleService has no failure detection methods',
    async (t) => {
      const methodArb = fc.constantFrom(
        ...REMOVED_FAILURE_DETECTION_METHODS,
      );

      fc.assert(
        fc.property(
          methodArb,
          (methodName) => {
            initializeTestDependencies();

            const mockCDC = createMockCDCService();
            const service = new NodeLifecycleService({
              nodeId: 'test-node',
              cdcIntegrationService: mockCDC,
            });

            const hasMethod = typeof service[methodName] === 'function';

            resetTestDependencies();

            // Method must NOT exist on the service
            return !hasMethod;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'NodeLifecycleService has no failure detection methods',
      );
    },
  );

  /**
   * Property: For any removed failure detection field name,
   * NodeLifecycleService SHALL NOT have that field defined.
   *
   * **Validates: Requirements 1.1**
   */
  t.test(
    'NodeLifecycleService has no failure detection fields',
    async (t) => {
      const fieldArb = fc.constantFrom(
        ...REMOVED_FAILURE_DETECTION_FIELDS,
      );

      fc.assert(
        fc.property(
          fieldArb,
          (fieldName) => {
            initializeTestDependencies();

            const service = new NodeLifecycleService({
              nodeId: 'test-node',
            });

            const hasField = service[fieldName] !== undefined;

            resetTestDependencies();

            // Field must NOT exist on the service
            return !hasField;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'NodeLifecycleService has no failure detection fields',
      );
    },
  );

  /**
   * Property: For any node with ACTIVE status whose heartbeat exceeds
   * the suspicion threshold, FailureDetector SHALL transition it to
   * SUSPECTED.
   *
   * **Validates: Requirements 1.2**
   */
  t.test(
    'FailureDetector suspects active nodes on heartbeat timeout',
    async (t) => {
      // Generate a delay beyond the suspicion threshold but below failure
      const delayArb = fc.integer({
        min: FAILURE_DETECTOR_DEFAULT.SUSPICION_THRESHOLD_MS + 1,
        max: FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS - 1,
      });

      const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,8}$/);

      fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          delayArb,
          async (nodeId, delay) => {
            initializeTestDependencies();

            const now = Date.now();
            const mockCDC = createMockCDCService();
            const mockEngine = createMockSqlEngine({
              nodes: [{
                node_id: nodeId,
                status: NODE_STATUS.ACTIVE,
                last_heartbeat: now - delay,
              }],
            });

            const detector = new FailureDetector({
              nodeId: 'self-node',
              sqlQueryEngine: mockEngine,
              cdcIntegrationService: mockCDC,
              controlPlaneSystemTableGateway:
                createMockMutationGateway(mockEngine, mockCDC),
            });
            detector.initialize();

            await detector.checkNodeHealth();

            // Should have written SUSPECTED status
            const suspectedOp = mockCDC.operations.find(
              (op) =>
                op.tableName === SYSTEM_TABLE_NAME.NODES &&
                op.data.status === NODE_STATUS.SUSPECTED,
            );

            resetTestDependencies();

            return suspectedOp !== undefined;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'FailureDetector suspects active nodes on heartbeat timeout',
      );
    },
  );

  /**
   * Property: For any node already in SUSPECTED status whose heartbeat
   * exceeds the failure threshold, FailureDetector SHALL transition it
   * to FAILED.
   *
   * **Validates: Requirements 1.2**
   */
  t.test(
    'FailureDetector fails suspected nodes on extended timeout',
    async (t) => {
      // Generate a delay beyond the failure threshold
      const delayArb = fc.integer({
        min: FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS + 1,
        max: FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS * 3,
      });

      const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,8}$/);

      fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          delayArb,
          async (nodeId, delay) => {
            initializeTestDependencies();

            const now = Date.now();
            const mockCDC = createMockCDCService();
            const mockEngine = createMockSqlEngine({
              nodes: [{
                node_id: nodeId,
                status: NODE_STATUS.SUSPECTED,
                last_heartbeat: now - delay,
              }],
              services: [],
            });

            const detector = new FailureDetector({
              nodeId: 'self-node',
              sqlQueryEngine: mockEngine,
              cdcIntegrationService: mockCDC,
              controlPlaneSystemTableGateway:
                createMockMutationGateway(mockEngine, mockCDC),
            });
            detector.initialize();

            await detector.checkNodeHealth();

            // Should have written FAILED status
            const failedOp = mockCDC.operations.find(
              (op) =>
                op.tableName === SYSTEM_TABLE_NAME.NODES &&
                op.data.status === NODE_STATUS.FAILED,
            );

            resetTestDependencies();

            return failedOp !== undefined;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'FailureDetector fails suspected nodes on extended timeout',
      );
    },
  );
});
