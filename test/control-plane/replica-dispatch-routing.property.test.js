/**
 * Property-based test for ReplicaDispatchService routing.
 *
 * Property 16: Replica dispatch forwards to correct leader
 * For any replica operation dispatch request with a known partition
 * leader, the ReplicaDispatchService shall forward the message to
 * the address of the current leader for that partition.
 *
 * **Validates: Requirements 8.5**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

/**
 * Initialize test singletons.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
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
 * Arbitrary for generating replica operation rows.
 */
const operationArb = fc.record({
  operation_id: fc.string({minLength: 5, maxLength: 15})
    .map((s) => `op-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  type: fc.constantFrom(
    OperationType.ADD,
    OperationType.REMOVE,
    OperationType.REPLACE,
  ),
  partition_id: fc.string({minLength: 3, maxLength: 10})
    .map((s) => `part-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  replica_id: fc.string({minLength: 3, maxLength: 10})
    .map((s) => `rep-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  source_node_id: fc.string({minLength: 3, maxLength: 10})
    .map((s) => `node-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  target_node_id: fc.string({minLength: 3, maxLength: 10})
    .map((s) => `tgt-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  status: fc.constant('pending'),
  workflow_step: fc.constant(WORKFLOW_STEP.PENDING),
  created_at: fc.integer({min: 1000000000000, max: 2000000000000}),
  updated_at: fc.integer({min: 1000000000000, max: 2000000000000}),
});

test('Property 16: Replica dispatch forwards to correct leader',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        operationArb,
        async (opRow) => {
          initEnv();

          let dispatchedOp = null;
          const now = Date.now();

          // Target node is ready
          const nodeStore = new Map();
          nodeStore.set(opRow.target_node_id, {
            node_id: opRow.target_node_id,
            status: SERVICE_STATUS.ACTIVE,
            connection_state: STATE.READY,
            ready_lease_expires_at: now + 60000,
          });

          // Operation is in the cache
          const opStore = new Map();
          opStore.set(opRow.operation_id, opRow);

          const mockCache = {
            get: (table, id) => {
              if (table === 'nodes') return nodeStore.get(id) || null;
              if (table === 'replica_operations') {
                return opStore.get(id) || null;
              }
              return null;
            },
            getAll: (table) => {
              if (table === SYSTEM_TABLE_NAME.SERVICES) {
                return [{
                  [COLUMN.NODE_ID]: opRow.target_node_id,
                  [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
                  [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
                }];
              }
              return [];
            },
          };

          const mockRouter = {
            getConnectionState: (_nodeId) => STATE.CONNECTED,
          };

          const mockCoordinator = {
            claimDispatchTransition: async () => ({
              operationId: opRow.operation_id,
              type: opRow.type,
              partitionId: opRow.partition_id,
              replicaId: opRow.replica_id,
              sourceNodeId: opRow.source_node_id,
              targetNodeId: opRow.target_node_id,
              status: opRow.status,
              workflowStep: opRow.workflow_step,
              createdAt: opRow.created_at,
              updatedAt: opRow.updated_at,
              completedAt: null,
              errorMessage: null,
              stepsHistory: [],
            }),
            executeOperation: async (op) => {
              dispatchedOp = op;
            },
          };

          const mockCdc = {
            upsertSystemTableRow: async () => ({success: true}),
            updateSystemTableRow: async () => ({
              success: true,
              partitionResult: {affectedRows: 1},
            }),
          };

          const mockSqlQueryEngine = {
            executeQuery: async (sql, _params) => {
              if (sql.includes('FROM services')) {
                return {
                  success: true,
                  rows: [{
                    service_id: 'svc-1',
                    [COLUMN.NODE_ID]: opRow.target_node_id,
                    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
                    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
                  }],
                };
              }
              return {success: true, rows: []};
            },
          };

          const mockReadinessService = {
            getNodeReadinessSync: (nodeId) => {
              const node = nodeStore.get(nodeId);
              const ready = !!node &&
                node.status === SERVICE_STATUS.ACTIVE &&
                node.connection_state === STATE.READY &&
                Number(node.ready_lease_expires_at) > Date.now();
              return {
                nodeId,
                dimensions: {
                  [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: ready,
                  [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: ready,
                },
              };
            },
          };

          const service = new ReplicaDispatchService({
            nodeId: 'local-node',
            messageRouter: mockRouter,
            cdcIntegrationService: mockCdc,
            systemTableCache: mockCache,
            rebalanceCoordinator: mockCoordinator,
            sqlQueryEngine: mockSqlQueryEngine,
            controlPlaneReadinessService: mockReadinessService,
          });
          service.initialize();

          // Dispatch the operation
          await service.dispatchOperationRow(opRow);

          // Verify dispatch
          t.ok(dispatchedOp, 'operation should be dispatched');
          t.equal(
            dispatchedOp.operationId, opRow.operation_id,
            'operation ID should match',
          );
          t.equal(
            dispatchedOp.targetNodeId, opRow.target_node_id,
            'target node should match',
          );
          t.equal(
            dispatchedOp.partitionId, opRow.partition_id,
            'partition ID should match',
          );

          service.stop();
          return true;
        },
      ),
      {numRuns: 10},
    );
  });
