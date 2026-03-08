/**
 * Integration test for message-group operation routing.
 * Task 6.1: expected to fail until message-group operation routing is wired.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  COLUMN,
  SERVICE_TYPE,
  WORKFLOW_STEP,
  SERVICE_STATUS,
  STATE,
} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({});

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

test('Message-group operation routing integration', async (t) => {
  t.beforeEach(async () => {
    initEnv();
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test(
    'dispatch preserves message-group entity identity for coordinator',
    async (t) => {
      let receivedOperation = null;
      const now = Date.now();
      const opRow = {
        operation_id: 'op-mg-1',
        type: 'ADD',
        partition_id: 'mg-1',
        replica_id: 'mg-1-r4',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'pending',
        workflow_step: WORKFLOW_STEP.PENDING,
        created_at: now,
        updated_at: now,
        entity_type: 'message_group',
        entity_id: 'mg-1',
      };

      const service = new ReplicaDispatchService({
        nodeId: 'node-1',
        messageRouter: {
          getConnectionState: () => STATE.CONNECTED,
        },
        cdcIntegrationService: {
          upsertSystemTableRow: async () => ({success: true}),
          updateSystemTableRow: async () => ({
            success: true,
            partitionResult: {affectedRows: 1},
          }),
        },
        systemTableCache: {
          get: (tableName, key) => {
            if (tableName === 'nodes' && key === 'node-2') {
              return {
                node_id: 'node-2',
                status: SERVICE_STATUS.ACTIVE,
                connection_state: STATE.READY,
                ready_lease_expires_at: Date.now() + 30000,
              };
            }
            return null;
          },
          getAll: (tableName) => {
            if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
              return [{
                [COLUMN.NODE_ID]: 'node-2',
                [COLUMN.SERVICE_TYPE]:
                  SERVICE_TYPE.MESSAGE_GROUP,
                [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              }];
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          getNodeReadinessSync(nodeId) {
            return {
              nodeId,
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
            };
          },
        },
        rebalanceCoordinator: {
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
            entityType: opRow.entity_type,
            entityId: opRow.entity_id,
            stepsHistory: [],
          }),
          executeOperation: async (operation) => {
            receivedOperation = operation;
          },
        },
      });
      service.initialize();

      try {
        await service.dispatchOperationRow(opRow);
        t.equal(
          receivedOperation?.entityType,
          'message_group',
          'dispatch should pass message-group entity type to coordinator',
        );
        t.equal(
          receivedOperation?.entityId,
          'mg-1',
          'dispatch should pass message-group entity id to coordinator',
        );
      } finally {
        service.stop();
      }
    },
  );

  await t.test(
    'coordinator routes message-group operation to message-group handler',
    async (t) => {
      const deliveries = [];
      const coordinator = new RebalanceCoordinator({
        nodeId: 'node-1',
        systemTableCache: {
          get: () => null,
          filter: () => [],
        },
        cdcIntegrationService: {
          upsertSystemTableRow: async () => ({success: true}),
          updateSystemTableRow: async () => ({success: true}),
        },
        messageRouter: {
          deliver: async (target, payload) => {
            deliveries.push({target, payload});
            return {acknowledged: true, status: 'initiated'};
          },
        },
        tablePolicyService: {
          getPolicyForPartition: () => ({}),
        },
        sqlQueryEngine: {
          executeQuery: async () => ({success: true, rows: [], changes: 1}),
        },
        transactionCoordinator: createMockTransactionCoordinator(),
        controlPlaneReadinessService: createMockControlPlaneReadinessService(),
        storageAdmissionService: {
          checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
          checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
        },
        storageAccountingService: {
          estimateReplicaBytes: () => 1,
        },
        enableTimeouts: false,
      });
      coordinator.initialize();

      const now = Date.now();
      const operation = {
        operationId: 'op-mg-route-1',
        type: 'ADD',
        partitionId: 'mg-1',
        replicaId: 'mg-1-r4',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
        entityType: 'message_group',
        entityId: 'mg-1',
      };

      try {
        await coordinator.executeOperation(operation);
        t.equal(
          deliveries[0]?.target,
          'node-2/service/message-group-handler',
          'message-group operation should route to message-group handler',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'coordinator persists canonical entity fields for message-group operations',
    async (t) => {
      const queries = [];
      const coordinator = new RebalanceCoordinator({
        nodeId: 'node-1',
        systemTableCache: {
          get: () => null,
          filter: () => [],
        },
        cdcIntegrationService: {
          upsertSystemTableRow: async () => ({success: true}),
          updateSystemTableRow: async () => ({success: true}),
        },
        messageRouter: {
          deliver: async () => ({acknowledged: true, status: 'initiated'}),
        },
        tablePolicyService: {
          getPolicyForPartition: () => ({}),
        },
        sqlQueryEngine: {
          executeQuery: async (sql, params) => {
            queries.push({sql, params});
            if (sql.includes('INSERT INTO replica_operations')) {
              return {success: true, changes: 1};
            }
            return {success: true, rows: []};
          },
        },
        transactionCoordinator: createMockTransactionCoordinator(),
        controlPlaneReadinessService: createMockControlPlaneReadinessService(),
        storageAdmissionService: {
          checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
          checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
        },
        storageAccountingService: {
          estimateReplicaBytes: () => 1,
        },
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'mg-1',
          entityType: 'message_group',
          entityId: 'mg-1',
          nodeId: 'node-2',
          replicaId: 'mg-1-r4',
        });

        const dedupeQuery = queries.find((q) =>
          q.sql.includes('target_node_id = ?'),
        );
        t.ok(dedupeQuery, 'should run dedupe query before insert');
        t.ok(
          dedupeQuery.sql.includes('entity_type'),
          'dedupe query should scope by entity_type',
        );
        t.ok(
          dedupeQuery.sql.includes('entity_id'),
          'dedupe query should scope by entity_id',
        );
        t.ok(
          dedupeQuery.params.includes('message_group'),
          'dedupe query params should include message_group entity type',
        );
        t.ok(
          dedupeQuery.params.includes('mg-1'),
          'dedupe query params should include message-group entity id',
        );

        const insertQuery = queries.find((q) =>
          q.sql.includes('INSERT INTO replica_operations'),
        );
        t.ok(insertQuery, 'should insert operation row');
        t.ok(
          insertQuery.sql.includes('entity_type'),
          'insert query should include entity_type column',
        );
        t.ok(
          insertQuery.sql.includes('entity_id'),
          'insert query should include entity_id column',
        );
        t.ok(
          insertQuery.params.includes('message_group'),
          'insert params should include message_group entity type',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
});
