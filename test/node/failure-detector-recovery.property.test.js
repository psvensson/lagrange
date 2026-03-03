/**
 * Property Test: Failure detector recovery detection
 * Feature: system-architecture-consolidation,
 *   Property 8: Failure detector recovery detection
 *
 * **Validates: Requirements 4.5**
 *
 * *For any* node in FAILED state that resumes heartbeating within
 * the failure threshold, the FailureDetector shall write RECOVERING
 * status to the nodes table via CDC.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {NODE_STATE} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  FAILURE_DETECTOR_DEFAULT,
  FAILURE_DETECTOR_SQL,
} from '../../src/node/node-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * The detector's own node ID — always skipped during health checks.
 * @type {string}
 */
const SELF_NODE_ID = 'self-node';

/**
 * Create a mock CDC integration service that tracks all write
 * operations. Each call to updateSystemTableRow is recorded with
 * the table name, where clause, and data payload.
 * @return {Object} Mock CDC service with an operations array.
 */
function createMockCDCService() {
  const operations = [];
  return {
    operations,
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({tableName, whereClause, data});
      return {success: true};
    },
  };
}

/**
 * Create a mock SQL query engine that returns configurable node
 * data. Responds to the SQL queries used by the FailureDetector.
 * @param {Object} data - Initial data.
 * @param {Array<Object>} data.nodes - Node rows.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlQueryEngine(data = {}) {
  const nodes = data.nodes || [];

  return {
    async executeQuery(sql, _params = []) {
      if (sql === FAILURE_DETECTOR_SQL.SELECT_ALL_NODES) {
        return {rows: nodes, success: true};
      }
      return {rows: [], success: true};
    },
  };
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: SELF_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('Property 8: Failure detector recovery detection',
  async (t) => {
    /**
     * Property: For any number of FAILED nodes that have resumed
     * heartbeating within the failure threshold, the
     * FailureDetector writes exactly one CDC update per node
     * with status RECOVERING.
     */
    t.test(
      'writes RECOVERING for each FAILED node with recent ' +
      'heartbeat',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 1, max: 5}),
            fc.integer({
              min: 1,
              max: FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS - 1,
            }),
            async (nodeCount, heartbeatAge) => {
              const now = Date.now();

              const nodes = [];
              for (let i = 0; i < nodeCount; i++) {
                nodes.push({
                  node_id: `node-${i}`,
                  status: NODE_STATE.FAILED,
                  last_heartbeat: now - heartbeatAge,
                  failed_at: now - heartbeatAge - 1000,
                });
              }

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({nodes});

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
              });
              detector.initialize();

              await detector.checkNodeHealth();

              // Filter CDC writes to the nodes table
              const nodeWrites = mockCDC.operations.filter(
                (op) => op.tableName === SYSTEM_TABLE_NAME.NODES,
              );

              // Exactly one CDC write per recovering node
              if (nodeWrites.length !== nodeCount) return false;

              // Each write must set status to RECOVERING
              for (const write of nodeWrites) {
                if (write.data.status !== NODE_STATE.RECOVERING) {
                  return false;
                }
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'exactly one RECOVERING CDC write per FAILED node ' +
          'with recent heartbeat',
        );
      },
    );

    /**
     * Property: For any FAILED node whose heartbeat age exceeds
     * the failure threshold, no recovery write shall occur.
     * The node remains in FAILED state with no CDC writes.
     */
    t.test(
      'no recovery write for FAILED nodes still beyond ' +
      'threshold',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 1, max: 5}),
            fc.integer({
              min: FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS,
              max: FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS * 4,
            }),
            async (nodeCount, heartbeatAge) => {
              const now = Date.now();

              const nodes = [];
              for (let i = 0; i < nodeCount; i++) {
                nodes.push({
                  node_id: `node-${i}`,
                  status: NODE_STATE.FAILED,
                  last_heartbeat: now - heartbeatAge,
                  failed_at: now - heartbeatAge - 1000,
                });
              }

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({nodes});

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
              });
              detector.initialize();

              await detector.checkNodeHealth();

              // No CDC writes should occur for still-failed nodes
              return mockCDC.operations.length === 0;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'no CDC writes for FAILED nodes still beyond ' +
          'failure threshold',
        );
      },
    );

    /**
     * Property: For any mix of recovering and still-failed nodes,
     * the FailureDetector writes RECOVERING only for nodes whose
     * heartbeat age is within the failure threshold.
     */
    t.test(
      'mixed scenario: only recovering nodes get CDC writes',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 1, max: 3}),
            fc.integer({min: 1, max: 3}),
            async (recoveringCount, stillFailedCount) => {
              const now = Date.now();
              const threshold =
                FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS;

              const nodes = [];
              // Recovering nodes: heartbeat within threshold
              for (let i = 0; i < recoveringCount; i++) {
                nodes.push({
                  node_id: `recovering-${i}`,
                  status: NODE_STATE.FAILED,
                  last_heartbeat: now - Math.floor(threshold / 2),
                  failed_at: now - threshold - 1000,
                });
              }
              // Still-failed nodes: heartbeat beyond threshold
              for (let i = 0; i < stillFailedCount; i++) {
                nodes.push({
                  node_id: `still-failed-${i}`,
                  status: NODE_STATE.FAILED,
                  last_heartbeat: now - threshold - 1000,
                  failed_at: now - threshold - 2000,
                });
              }

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({nodes});

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
              });
              detector.initialize();

              await detector.checkNodeHealth();

              // Only recovering nodes should have CDC writes
              const nodeWrites = mockCDC.operations.filter(
                (op) => op.tableName === SYSTEM_TABLE_NAME.NODES,
              );

              if (nodeWrites.length !== recoveringCount) {
                return false;
              }

              // All writes must be RECOVERING status
              for (const write of nodeWrites) {
                if (write.data.status !== NODE_STATE.RECOVERING) {
                  return false;
                }
              }

              // Verify correct node IDs were written
              const writtenIds = new Set(
                nodeWrites.map((w) => w.whereClause.node_id),
              );
              for (let i = 0; i < recoveringCount; i++) {
                if (!writtenIds.has(`recovering-${i}`)) {
                  return false;
                }
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'only FAILED nodes with recent heartbeats get ' +
          'RECOVERING CDC writes',
        );
      },
    );

    /**
     * Property: For any recovering node, the CDC write includes
     * the recovered_at timestamp and updated_at timestamp.
     */
    t.test(
      'recovery CDC write includes correct timestamps',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({
              min: 1,
              max: FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS - 1,
            }),
            async (heartbeatAge) => {
              const now = Date.now();

              const nodes = [{
                node_id: 'recovering-node',
                status: NODE_STATE.FAILED,
                last_heartbeat: now - heartbeatAge,
                failed_at: now - heartbeatAge - 1000,
              }];

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({nodes});

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
              });
              detector.initialize();

              await detector.checkNodeHealth();

              if (mockCDC.operations.length !== 1) return false;

              const write = mockCDC.operations[0];

              // Must have recovered_at and updated_at
              if (typeof write.data.recovered_at !== 'number') {
                return false;
              }
              if (typeof write.data.updated_at !== 'number') {
                return false;
              }

              // Timestamps should be reasonable (close to now)
              const timeDiff =
                Math.abs(write.data.recovered_at - now);
              if (timeDiff > 1000) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'recovery CDC write includes recovered_at and ' +
          'updated_at timestamps',
        );
      },
    );
  });
