/**
 * Property Test: Failure detector single CDC write per status change
 * Feature: system-architecture-consolidation,
 *   Property 7: Failure detector single CDC write per status change
 *
 * **Validates: Requirements 4.3, 4.4**
 *
 * *For any* node that transitions from ACTIVE to SUSPECTED or from
 * SUSPECTED to FAILED, the FailureDetector shall produce exactly one
 * CDC write for the node status change. When transitioning to FAILED,
 * it shall also produce exactly one CDC write per affected replica.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {NODE_STATE, SERVICE_TYPE} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  FAILURE_DETECTOR_DEFAULT,
  FAILURE_DETECTOR_SQL,
} from '../../src/node/node-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createMockMutationGateway} from
  './failure-detector-test-helpers.js';

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
 * and service data. Responds to the two SQL queries used by the
 * FailureDetector: SELECT_ALL_NODES and
 * SELECT_SERVICES_BY_NODE_AND_TYPE.
 * @param {Object} data - Initial data.
 * @param {Array<Object>} data.nodes - Node rows.
 * @param {Array<Object>} data.services - Service rows.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlQueryEngine(data = {}) {
  const nodes = data.nodes || [];
  const services = data.services || [];

  return {
    async executeQuery(sql, params = []) {
      if (sql === FAILURE_DETECTOR_SQL.SELECT_ALL_NODES) {
        return {rows: nodes, success: true};
      }
      if (
        sql === FAILURE_DETECTOR_SQL.SELECT_SERVICES_BY_NODE_AND_TYPE
      ) {
        const nodeId = params[0];
        const serviceType = params[1];
        const filtered = services.filter(
          (s) =>
            s.node_id === nodeId &&
            s.service_type === serviceType,
        );
        return {rows: filtered, success: true};
      }
      return {rows: [], success: true};
    },
  };
}

/**
 * Build a partition replica service row.
 * @param {string} nodeId - Owning node ID.
 * @param {number} index - Unique index for ID generation.
 * @return {Object} A service row for a partition replica.
 */
function buildPartitionReplica(nodeId, index) {
  return {
    service_id: `svc-part-${nodeId}-${index}`,
    node_id: nodeId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: `part-${nodeId}-${index}`,
    status: ReplicaStatus.ACTIVE,
  };
}

/**
 * Build a message group replica service row.
 * @param {string} nodeId - Owning node ID.
 * @param {number} index - Unique index for ID generation.
 * @return {Object} A service row for a message group replica.
 */
function buildMessageGroupReplica(nodeId, index) {
  return {
    service_id: `svc-mg-${nodeId}-${index}`,
    node_id: nodeId,
    service_type: SERVICE_TYPE.MESSAGE_GROUP_REPLICA,
    group_id: `mg-${nodeId}-${index}`,
    status: ReplicaStatus.ACTIVE,
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

test('Property 7: Failure detector single CDC write per status change',
  async (t) => {
    /**
     * Property: For any ACTIVE node whose heartbeat exceeds the
     * suspicion threshold, the FailureDetector produces exactly
     * one CDC write to the nodes table with status SUSPECTED.
     */
    t.test(
      'exactly one CDC write when ACTIVE node becomes SUSPECTED',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 1, max: 5}),
            async (nodeCount) => {
              const now = Date.now();
              const suspicionMs =
                FAILURE_DETECTOR_DEFAULT.SUSPICION_THRESHOLD_MS;
              const heartbeatAge = suspicionMs + 1;

              const nodes = [];
              for (let i = 0; i < nodeCount; i++) {
                nodes.push({
                  node_id: `node-${i}`,
                  status: NODE_STATE.ACTIVE,
                  last_heartbeat: now - heartbeatAge,
                });
              }

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({
                nodes,
                services: [],
              });

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
                controlPlaneSystemTableGateway:
                  createMockMutationGateway(mockEngine, mockCDC),
              });
              detector.initialize();

              await detector.checkNodeHealth();

              // Filter CDC writes to the nodes table
              const nodeWrites = mockCDC.operations.filter(
                (op) => op.tableName === SYSTEM_TABLE_NAME.NODES,
              );

              // Exactly one CDC write per node
              if (nodeWrites.length !== nodeCount) return false;

              // Each write must set status to SUSPECTED
              for (const write of nodeWrites) {
                if (write.data.status !== NODE_STATE.SUSPECTED) {
                  return false;
                }
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'exactly one CDC write per ACTIVE node becoming ' +
          'SUSPECTED',
        );
      },
    );

    /**
     * Property: For any SUSPECTED node whose heartbeat exceeds
     * the failure threshold, the FailureDetector produces exactly
     * one CDC write to the nodes table with status FAILED.
     */
    t.test(
      'exactly one CDC write when SUSPECTED node becomes FAILED',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 1, max: 5}),
            async (nodeCount) => {
              const now = Date.now();
              const failureMs =
                FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS;
              const heartbeatAge = failureMs + 1;

              const nodes = [];
              for (let i = 0; i < nodeCount; i++) {
                nodes.push({
                  node_id: `node-${i}`,
                  status: NODE_STATE.SUSPECTED,
                  last_heartbeat: now - heartbeatAge,
                });
              }

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({
                nodes,
                services: [],
              });

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
                controlPlaneSystemTableGateway:
                  createMockMutationGateway(mockEngine, mockCDC),
              });
              detector.initialize();

              await detector.checkNodeHealth();

              // Filter CDC writes to the nodes table
              const nodeWrites = mockCDC.operations.filter(
                (op) =>
                  op.tableName === SYSTEM_TABLE_NAME.NODES &&
                  op.data.status === NODE_STATE.FAILED,
              );

              // Exactly one FAILED write per node
              return nodeWrites.length === nodeCount;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'exactly one CDC write per SUSPECTED node becoming ' +
          'FAILED',
        );
      },
    );

    /**
     * Property: For any SUSPECTED node that transitions to FAILED,
     * the FailureDetector produces exactly one CDC write per
     * affected replica (partition + message group) on that node.
     */
    t.test(
      'exactly one CDC write per affected replica on FAILED node',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 0, max: 4}),
            fc.integer({min: 0, max: 4}),
            async (partitionCount, msgGroupCount) => {
              const now = Date.now();
              const failureMs =
                FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS;
              const heartbeatAge = failureMs + 1;
              const targetNodeId = 'failed-node';

              const nodes = [{
                node_id: targetNodeId,
                status: NODE_STATE.SUSPECTED,
                last_heartbeat: now - heartbeatAge,
              }];

              const services = [];
              for (let i = 0; i < partitionCount; i++) {
                services.push(
                  buildPartitionReplica(targetNodeId, i),
                );
              }
              for (let i = 0; i < msgGroupCount; i++) {
                services.push(
                  buildMessageGroupReplica(targetNodeId, i),
                );
              }

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({
                nodes,
                services,
              });

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
                controlPlaneSystemTableGateway:
                  createMockMutationGateway(mockEngine, mockCDC),
              });
              detector.initialize();

              await detector.checkNodeHealth();

              // Filter CDC writes to the services table
              const replicaWrites = mockCDC.operations.filter(
                (op) =>
                  op.tableName === SYSTEM_TABLE_NAME.SERVICES &&
                  op.data.status === ReplicaStatus.FAILED,
              );

              const expectedReplicas =
                partitionCount + msgGroupCount;

              // Exactly one CDC write per affected replica
              return replicaWrites.length === expectedReplicas;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'exactly one CDC write per affected replica when ' +
          'node transitions to FAILED',
        );
      },
    );

    /**
     * Property: For any SUSPECTED-to-FAILED transition with
     * replicas, the total CDC writes equal exactly 1 (node
     * status) + N (replica statuses), where N is the total
     * number of partition and message group replicas on the node.
     */
    t.test(
      'total CDC writes = 1 node + N replicas on failure',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({min: 0, max: 4}),
            fc.integer({min: 0, max: 4}),
            async (partitionCount, msgGroupCount) => {
              const now = Date.now();
              const failureMs =
                FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS;
              const heartbeatAge = failureMs + 1;
              const targetNodeId = 'target-node';

              const nodes = [{
                node_id: targetNodeId,
                status: NODE_STATE.SUSPECTED,
                last_heartbeat: now - heartbeatAge,
              }];

              const services = [];
              for (let i = 0; i < partitionCount; i++) {
                services.push(
                  buildPartitionReplica(targetNodeId, i),
                );
              }
              for (let i = 0; i < msgGroupCount; i++) {
                services.push(
                  buildMessageGroupReplica(targetNodeId, i),
                );
              }

              const mockCDC = createMockCDCService();
              const mockEngine = createMockSqlQueryEngine({
                nodes,
                services,
              });

              const detector = new FailureDetector({
                nodeId: SELF_NODE_ID,
                sqlQueryEngine: mockEngine,
                cdcIntegrationService: mockCDC,
                controlPlaneSystemTableGateway:
                  createMockMutationGateway(mockEngine, mockCDC),
              });
              detector.initialize();

              await detector.checkNodeHealth();

              const totalReplicas =
                partitionCount + msgGroupCount;
              const expectedTotal = 1 + totalReplicas;

              return mockCDC.operations.length === expectedTotal;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'total CDC writes equal 1 node write + N replica ' +
          'writes on failure',
        );
      },
    );
  });
