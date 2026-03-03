/**
 * Property Tests: Dispatch handler verification
 *
 * **Property 5: Dispatch handler verification**
 * *For any* replica operation dispatched by ReplicaDispatchService,
 * if the target node does not have a registered handler for the
 * operation's entity type, the dispatch SHALL be skipped and the
 * operation SHALL remain in its current workflow step (unchanged).
 *
 * **Validates: Requirements 8.1**
 *
 * Feature: architecture-violations-cleanup, Property 5
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaDispatchService,
} from '../../src/control-plane/replica-dispatch-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  DISPATCH_EVENT,
} from '../../src/control-plane/replica-dispatch-service-constants.js';
import {
  OperationType,
} from '../../src/rebalancer/replica-status.js';
import {
  ConfigurationManager,
} from '../../src/config/configuration-manager.js';
import {
  LoggingService,
} from '../../src/logging/logging-service.js';

// Initialize singletons for the service constructor
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const loggingService = LoggingService.getInstance();
if (!loggingService.isInitialized()) {
  loggingService.initialize({level: 'error'});
}

/**
 * Entity types used in replica operations.
 */
const ENTITY_TYPES = [
  SERVICE_TYPE.PARTITION,
  SERVICE_TYPE.MESSAGE_GROUP,
];

/**
 * Arbitrary for generating a REMOVE replica operation row.
 * Handler check only applies to non-ADD operations.
 */
const removeOperationRowArb = fc.record({
  operation_id: fc.uuid(),
  type: fc.constant(OperationType.REMOVE),
  partition_id: fc.uuid(),
  [COLUMN.ENTITY_TYPE]: fc.constantFrom(...ENTITY_TYPES),
  [COLUMN.ENTITY_ID]: fc.uuid(),
  replica_id: fc.uuid(),
  source_node_id: fc.uuid(),
  target_node_id: fc.uuid(),
  status: fc.constant(SERVICE_STATUS.ACTIVE),
  workflow_step: fc.constant(WORKFLOW_STEP.PENDING),
  created_at: fc.integer({min: 1, max: 9999999999}),
  updated_at: fc.integer({min: 1, max: 9999999999}),
  completed_at: fc.constant(null),
  error_message: fc.constant(null),
  steps_history: fc.constant('[]'),
});

/**
 * Arbitrary for generating an ADD replica operation row.
 */
const addOperationRowArb = fc.record({
  operation_id: fc.uuid(),
  type: fc.constant(OperationType.ADD),
  partition_id: fc.uuid(),
  [COLUMN.ENTITY_TYPE]: fc.constantFrom(...ENTITY_TYPES),
  [COLUMN.ENTITY_ID]: fc.uuid(),
  replica_id: fc.uuid(),
  source_node_id: fc.uuid(),
  target_node_id: fc.uuid(),
  status: fc.constant(SERVICE_STATUS.ACTIVE),
  workflow_step: fc.constant(WORKFLOW_STEP.PENDING),
  created_at: fc.integer({min: 1, max: 9999999999}),
  updated_at: fc.integer({min: 1, max: 9999999999}),
  completed_at: fc.constant(null),
  error_message: fc.constant(null),
  steps_history: fc.constant('[]'),
});

/**
 * Build a ready node row for the mock cache.
 * @param {string} nodeId - The node ID.
 * @return {Object} A node row that passes isNodeReady checks.
 */
function buildReadyNodeRow(nodeId) {
  const now = Date.now();
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: STATE.READY,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now + NUM.THOUSAND * NUM.TEN,
  };
}

/**
 * Build a service entry for the mock cache.
 * @param {string} nodeId - The node ID.
 * @param {string} entityType - The service type.
 * @return {Object} A service entry that satisfies hasHandlerOnTarget.
 */
function buildServiceEntry(nodeId, entityType) {
  return {
    [COLUMN.SERVICE_ID]: `svc-${nodeId}-${entityType}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: entityType,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
  };
}

/**
 * Create a ReplicaDispatchService with mock dependencies.
 * @param {Object} options - Configuration for the mocks.
 * @param {Array} options.serviceEntries - Service entries for getAll.
 * @param {Map} options.nodeRows - Map of nodeId to node row.
 * @param {boolean} options.claimSucceeds - Whether claim returns success.
 * @return {Object} Object with service and tracking state.
 */
function createMockDispatchService(options = {}) {
  const serviceEntries = options.serviceEntries || [];
  const nodeRows = options.nodeRows || new Map();
  const claimSucceeds = options.claimSucceeds !== false;

  const tracking = {
    claimCalled: false,
    claimOperationId: null,
    executeOperationCalled: false,
    dispatchedEvents: [],
  };

  const mockCache = {
    get: (tableName, id) => {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        return nodeRows.get(id) || null;
      }
      return null;
    },
    getAll: (tableName) => {
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        return serviceEntries;
      }
      return [];
    },
  };

  const mockRouter = {
    getConnectionState: () => STATE.CONNECTED,
  };

  const mockCdc = {
    updateSystemTableRow: async () => {
      tracking.claimCalled = true;
      return {
        partitionResult: {
          affectedRows: claimSucceeds ? NUM.ONE : NUM.ZERO,
        },
      };
    },
  };

  const mockCoordinator = {
    executeOperation: async (op) => {
      tracking.executeOperationCalled = true;
      tracking.claimOperationId = op.operationId;
    },
  };

  const mockSqlQueryEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM services')) {
        const [nodeId, entityType, status] = params || [];
        const matched = serviceEntries.filter(
          (s) =>
            s[COLUMN.NODE_ID] === nodeId &&
            s[COLUMN.SERVICE_TYPE] === entityType &&
            s[COLUMN.STATUS] === status,
        );
        return {success: true, rows: matched};
      }
      return {success: true, rows: []};
    },
  };

  const service = new ReplicaDispatchService({
    nodeId: 'test-node',
    messageRouter: mockRouter,
    cdcIntegrationService: mockCdc,
    systemTableCache: mockCache,
    rebalanceCoordinator: mockCoordinator,
    sqlQueryEngine: mockSqlQueryEngine,
  });

  service.initialize();

  service.on(DISPATCH_EVENT.OPERATION_DISPATCHED, (event) => {
    tracking.dispatchedEvents.push(event);
  });

  return {service, tracking};
}

test('Property 5: Dispatch handler verification', async (t) => {
  /**
   * Property: When no handler is registered on the target node
   * for the operation's entity type, dispatch is skipped and the
   * operation's workflow_step remains unchanged (PENDING).
   */
  t.test(
    'dispatch is skipped when no handler registered on target',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          removeOperationRowArb,
          async (row) => {
            const targetNodeId = row.target_node_id;
            const nodeRows = new Map();
            nodeRows.set(targetNodeId, buildReadyNodeRow(targetNodeId));

            // No service entries — no handler on target
            const {service, tracking} = createMockDispatchService({
              serviceEntries: [],
              nodeRows,
            });

            const originalStep = row.workflow_step;
            await service.dispatchOperationRow(row);

            // Workflow step must remain unchanged
            if (row.workflow_step !== originalStep) {
              return false;
            }

            // No claim should have been attempted
            if (tracking.claimCalled) {
              return false;
            }

            // No dispatch event should have been emitted
            if (tracking.dispatchedEvents.length !== NUM.ZERO) {
              return false;
            }

            // executeOperation should not have been called
            if (tracking.executeOperationCalled) {
              return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'dispatch is skipped when no handler registered on target',
      );
    },
  );

  /**
   * Property: When a handler IS registered on the target node
   * for the operation's entity type, dispatch proceeds and
   * claimPendingDispatch is called.
   */
  t.test(
    'dispatch proceeds when handler is registered on target',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          removeOperationRowArb,
          async (row) => {
            const targetNodeId = row.target_node_id;
            const entityType = row[COLUMN.ENTITY_TYPE];
            const nodeRows = new Map();
            nodeRows.set(targetNodeId, buildReadyNodeRow(targetNodeId));

            // Service entry matches target node and entity type
            const serviceEntries = [
              buildServiceEntry(targetNodeId, entityType),
            ];

            const {service, tracking} = createMockDispatchService({
              serviceEntries,
              nodeRows,
              claimSucceeds: true,
            });

            await service.dispatchOperationRow(row);

            // Claim should have been attempted
            if (!tracking.claimCalled) {
              return false;
            }

            // executeOperation should have been called
            if (!tracking.executeOperationCalled) {
              return false;
            }

            // A dispatch event should have been emitted
            if (tracking.dispatchedEvents.length !== NUM.ONE) {
              return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'dispatch proceeds when handler is registered on target',
      );
    },
  );

  /**
   * Property: The handler check uses the correct entity type
   * from the operation. A service entry for a different entity
   * type on the same node does NOT satisfy the handler check.
   */
  t.test(
    'handler check uses correct entity type from operation',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          removeOperationRowArb,
          async (row) => {
            const targetNodeId = row.target_node_id;
            const operationEntityType = row[COLUMN.ENTITY_TYPE];
            const nodeRows = new Map();
            nodeRows.set(targetNodeId, buildReadyNodeRow(targetNodeId));

            // Register a handler for the WRONG entity type
            const wrongEntityType =
              operationEntityType === SERVICE_TYPE.PARTITION ?
                SERVICE_TYPE.MESSAGE_GROUP :
                SERVICE_TYPE.PARTITION;

            const serviceEntries = [
              buildServiceEntry(targetNodeId, wrongEntityType),
            ];

            const {service, tracking} = createMockDispatchService({
              serviceEntries,
              nodeRows,
            });

            const originalStep = row.workflow_step;
            await service.dispatchOperationRow(row);

            // Dispatch should be skipped — wrong entity type
            if (row.workflow_step !== originalStep) {
              return false;
            }

            if (tracking.claimCalled) {
              return false;
            }

            if (tracking.dispatchedEvents.length !== NUM.ZERO) {
              return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'handler check uses correct entity type from operation',
      );
    },
  );

  /**
   * Property: ADD operations bypass the handler check since
   * the replica does not exist on the target yet.
   */
  t.test(
    'ADD operations bypass handler check',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          addOperationRowArb,
          async (row) => {
            const targetNodeId = row.target_node_id;
            const nodeRows = new Map();
            nodeRows.set(
              targetNodeId, buildReadyNodeRow(targetNodeId),
            );

            // No service entries — but ADD should still proceed
            const {service, tracking} = createMockDispatchService({
              serviceEntries: [],
              nodeRows,
              claimSucceeds: true,
            });

            await service.dispatchOperationRow(row);

            // Claim should have been attempted for ADD
            if (!tracking.claimCalled) {
              return false;
            }

            // executeOperation should have been called
            if (!tracking.executeOperationCalled) {
              return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('ADD operations bypass handler check');
    },
  );
});
