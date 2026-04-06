/**
 * Tests for first-class REPLACE replica workflow.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';

test('REPLACE replica workflow', async (t) => {
  await t.test('MovePlanner emits REPLACE moves for spread correction',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        cacheData: {
          nodes: [
            {node_id: 'node-1', status: 'active'},
            {node_id: 'node-2', status: 'active'},
            {node_id: 'node-3', status: 'active'},
          ],
        },
      });

      const currentReplicas = [
        {
          replica_id: 'nodes-p1-r1',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          address: 'node-1/partition/nodes-p1-r1',
          raft_role: 'leader',
        },
        {
          replica_id: 'nodes-p1-r2',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          address: 'node-1/partition/nodes-p1-r2',
          raft_role: 'follower',
        },
        {
          replica_id: 'nodes-p1-r3',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          address: 'node-1/partition/nodes-p1-r3',
          raft_role: 'follower',
        },
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
        availableNodeCount: 3,
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const replaceMoves = moves.filter((move) => move.type === MoveType.REPLACE);
      const addMoves = moves.filter((move) => move.type === MoveType.ADD);
      const nonFailedRemoves = moves.filter(
        (move) => move.type === MoveType.REMOVE && move.reason !== 'replica_failed',
      );

      t.equal(
        replaceMoves.length,
        2,
        'should emit two REPLACE moves to rebalance three replicas across three nodes',
      );
      t.equal(addMoves.length, 0, 'REPLACE moves should avoid standalone ADD growth');
      t.equal(nonFailedRemoves.length, 0, 'REPLACE moves should avoid standalone REMOVE churn');
      t.same(
        replaceMoves.map((move) => move.nodeId).sort(),
        ['node-2', 'node-3'],
        'REPLACE targets should be underrepresented nodes',
      );
    });

  await t.test('RebalanceCoordinator executes REPLACE in create then remove phases',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r3',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        await coordinator.executeOperation(operation);

        t.equal(
          operation.replicaId,
          'nodes-p1-r4',
          'REPLACE create phase should allocate canonical replica id on target',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'first REPLACE phase should issue CREATE_REPLICA to target node',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.REPLICA_IDS],
          ['nodes-p1-r2', 'nodes-p1-r3', 'nodes-p1-r4'],
          'REPLACE create phase should exclude the retiring source replica from bootstrap replica ids',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          [
            'seed-node/partition/nodes-p1-r2',
            'seed-node/partition/nodes-p1-r3',
            'node-2/partition/nodes-p1-r4',
          ],
          'REPLACE create phase should exclude the retiring source replica from bootstrap peer addresses',
        );
        t.equal(
          deliveries[0]?.options?.deliveryPriority,
          'critical',
          'replica dispatch should use the reserved control-plane lane',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'REPLACE operation should transition into CREATING after create dispatch',
        );

        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = ReplicaStatus.ACTIVE;

        await coordinator.executeOperation(operation);

        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'second REPLACE phase should issue REMOVE_REPLICA to source node',
        );
        t.equal(
          deliveries[1]?.payload?.replicaId,
          'nodes-p1-r1',
          'source replica should be removed in second REPLACE phase',
        );
        t.equal(
          deliveries[1]?.target,
          'seed-node/service/replica-handler',
          'source removal should be routed to source node handler',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'REPLACE operation should transition into STOPPING after remove dispatch',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'REPLACE reconciliation dispatches source removal while owner key is already held',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'users-p1-r1',
        });

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;

        const progressed =
          await coordinator.operationWorkflowRunExclusive(
            coordinator.getOperationOwnerSingleFlightKey(
              operation.operationId,
            ),
            () => coordinator.reconcileOperationProgress(operation),
          );

        t.equal(progressed, true,
          'reconciliation should progress a syncing REPLACE with active target');
        t.equal(deliveries.length, 1,
          'reconciliation should dispatch source-removal even with owner key held');
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'reconcile path should dispatch source removal for REPLACE',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'reconcile path should advance REPLACE into STOPPING after remove dispatch',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE reconciliation skips duplicate source removal when ACTIVE transition is already committed',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'users-p1-r1',
        });

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;
        coordinator.operationWorkflowCoordinator
          .markTransitionCommitted(
            operation.operationId,
            WORKFLOW_STEP.ACTIVE,
          );

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(progressed, true,
          'reconciliation should treat ACTIVE replay as observed progress');
        t.equal(deliveries.length, 0,
          'idempotent ACTIVE replays should not redispatch source removal');
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE STOPPING reconciliation completes when the source replica is already failed',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{status: ReplicaStatus.FAILED}],
            affectedRows: 1,
          },
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'users-p1-r1',
        });

        operation.replicaId = 'users-p1-r2';
        operation.sourceReplicaId = 'users-p1-r1';
        operation.workflowStep = WORKFLOW_STEP.STOPPING;
        operation.status = ReplicaStatus.ACTIVE;

        const progressed =
          await coordinator.reconcileOperationProgress(operation);

        t.equal(progressed, true,
          'STOPPING reconciliation should treat a failed source replica as terminal progress for REPLACE');
        t.equal(
          deliveries.length,
          0,
          'terminal failed source state should not redispatch source removal',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'REPLACE should complete once the source replica is already non-serving',
        );
        t.equal(
          operation.status,
          ReplicaStatus.REMOVED,
          'completed REPLACE should persist the removed terminal status',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator reconcileSyncingOperation advances REPLACE into source removal',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{status: ReplicaStatus.ACTIVE}],
            affectedRows: 1,
          },
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'users-p1-r1',
        });

        operation.replicaId = 'users-p1-r2';
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.status = ReplicaStatus.SYNCING;

        await coordinator.reconcileSyncingOperation(operation);

        t.equal(deliveries.length, 1,
          'syncing reconciliation should dispatch the source removal phase');
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'syncing reconciliation should remove the source replica for REPLACE',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'syncing reconciliation should advance REPLACE into STOPPING',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test('RebalanceCoordinator routes REPLACE creation through storage admission',
    async (t) => {
      const admissionCalls = [];
      const coordinator = createTestCoordinator({
        storageAdmissionService: {
          async checkReplace(options) {
            admissionCalls.push(options);
            return {
              allowed: true,
              decision: 'allow',
              decisionType: 'admitted',
            };
          },
        },
      });

      try {
        await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        t.equal(admissionCalls.length, 1,
          'REPLACE creation should consult the admission owner once');
        t.same(admissionCalls[0], {
          sourceNodeId: 'seed-node',
          targetNodeId: 'node-2',
          estimatedBytes: 1,
          isCritical: true,
        }, 'REPLACE admission should use the canonical replace owner path');
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('RebalanceCoordinator reconciles REPLACE creating phase from actual state',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {
              service_id: 'mg-1-r1',
              replica_id: 'mg-1-r1',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/message-group/mg-1-r1',
            },
            {
              service_id: 'mg-1-r2',
              replica_id: 'mg-1-r2',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-2',
              status: 'active',
              address: 'node-2/message-group/mg-1-r2',
            },
            {
              service_id: 'mg-1-r3',
              replica_id: 'mg-1-r3',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/message-group/mg-1-r3',
            },
          ],
        },
      });
      coordinator.initialize();
      coordinator.getActualReplicaStatus = async () => ReplicaStatus.ACTIVE;

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'mg-1',
          entityType: 'message_group',
          entityId: 'mg-1',
          nodeId: 'node-4',
          sourceNodeId: 'seed-node',
          replicaId: 'mg-1-r1',
        });

        await coordinator.executeOperation(operation);
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
        await coordinator.checkTimeouts();
        await coordinator.checkTimeouts();
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(deliveries.length, 2, 'reconcile should dispatch source removal');
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'active replacement should advance REPLACE into remove phase',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'completed remove phase should finish the REPLACE workflow',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('RebalanceCoordinator treats REPLACE ACTIVE as in-flight during timeout checks',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {
              service_id: 'mg-1-r1',
              replica_id: 'mg-1-r1',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/message-group/mg-1-r1',
            },
            {
              service_id: 'mg-1-r2',
              replica_id: 'mg-1-r2',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-2',
              status: 'active',
              address: 'node-2/message-group/mg-1-r2',
            },
            {
              service_id: 'mg-1-r3',
              replica_id: 'mg-1-r3',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/message-group/mg-1-r3',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'mg-1',
          entityType: 'message_group',
          entityId: 'mg-1',
          nodeId: 'node-4',
          sourceNodeId: 'seed-node',
          replicaId: 'mg-1-r1',
        });

        await coordinator.executeOperation(operation);
        await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
        await coordinator.checkTimeouts();
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(deliveries.length, 2, 'ACTIVE replace should remain visible to timeout checks');
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'timeout checks should continue the REPLACE remove phase',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.REMOVED,
          'remove phase completion should terminate the REPLACE operation',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator keeps critical REPLACE in syncing while the authoritative replacement remains learner',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: deliveries.length === 1 ? 'initiated' : 'completed',
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };
      const authoritativeLearnerRow = {
        service_id: 'nodes-p1-r4',
        replica_id: 'nodes-p1-r4',
        service_type: 'partition',
        partition_id: 'nodes-p1',
        node_id: 'node-d',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'learner',
        address: 'node-d/partition/nodes-p1-r4',
      };
      const coordinator = createTestCoordinator({
        nodeId: 'node-a',
        enableTimeouts: false,
        messageRouter,
        sqlQueryResults: {
          'FROM services WHERE service_id = ?': {
            success: true,
            rows: [{...authoritativeLearnerRow}],
            affectedRows: 1,
          },
        },
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/nodes-p1-r3',
            },
          ],
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'nodes-p1-r1',
        });

        await coordinator.executeOperation(operation);
        await coordinator.reconcileOperationProgress(operation);
        const persistedOperation =
          await coordinator.getOperation(operation.operationId);

        t.equal(
          deliveries.length,
          1,
          'critical REPLACE should not dispatch source removal while the target is still learner-only',
        );
        t.equal(
          persistedOperation?.workflowStep,
          WORKFLOW_STEP.SYNCING,
          'critical REPLACE should remain in syncing until the replacement becomes voter-ready',
        );
        t.equal(
          persistedOperation?.status,
          ReplicaStatus.SYNCING,
          'critical REPLACE should keep the operation in syncing while learner promotion is pending',
        );
        t.equal(
          persistedOperation?.errorMessage ||
            persistedOperation?.error_message ||
            null,
          null,
          'critical REPLACE should not fail on the expected learner promotion window',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator in-flight queries stay parser-compatible ' +
      'while filtering terminal workflow states',
    async (t) => {
      const rows = [
        {
          operation_id: 'replace-active',
          type: OperationType.REPLACE,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-2',
          status: 'active',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        },
        {
          operation_id: 'remove-pending',
          type: OperationType.REMOVE,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-3',
          status: 'pending',
          workflow_step: WORKFLOW_STEP.PENDING,
        },
        {
          operation_id: 'remove-removed',
          type: OperationType.REMOVE,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-4',
          status: 'removed',
          workflow_step: WORKFLOW_STEP.REMOVED,
        },
        {
          operation_id: 'add-active',
          type: OperationType.ADD,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-5',
          status: 'active',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        },
        {
          operation_id: 'add-failed',
          type: OperationType.ADD,
          partition_id: 'users-p1',
          source_node_id: 'test-node-1',
          target_node_id: 'node-6',
          status: 'failed',
          workflow_step: WORKFLOW_STEP.FAILED,
        },
      ];
      const parsedSql = [];
      const sqlQueryEngine = {
        async executeQuery(sql, params) {
          parsedSql.push(sql);
          new SQLParser(sql).parse();
          if (sql.includes('WHERE type = ?')) {
            const [operationType] = params;
            return {
              success: true,
              rows: rows.filter((row) => row.type === operationType),
            };
          }
          return {success: true, rows};
        },
      };

      const coordinator = createTestCoordinator({
        enableTimeouts: false,
        cacheData: {
          replicaOperations: rows,
        },
        sqlQueryEngine,
      });

      try {
        const inFlight = await coordinator.getInFlightOperations();
        const removeCount = await coordinator.getConcurrentRemoveCount();

        t.same(
          inFlight.map((operation) => operation.operationId).sort(),
          ['remove-pending', 'replace-active'],
          'coordinator should keep workflow-active REPLACE and exclude terminal rows in code',
        );
        t.equal(
          removeCount,
          1,
          'concurrent remove count should ignore removed workflow-terminal operations',
        );
        const ownerScopedSql = parsedSql.find((sql) => {
          return sql.includes('FROM replica_operations') &&
            sql.includes('source_node_id = ?');
        });
        if (ownerScopedSql) {
          t.notMatch(
            ownerScopedSql,
            /source_node_id IS NULL OR source_node_id = ''/,
            'owner-scoped in-flight SQL should remain parser-safe when used',
          );
        } else {
          t.pass(
            'cache fast-path satisfied in-flight query without issuing SQL',
          );
        }
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test('RebalanceCoordinator allocates canonical replica IDs for ADD',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-1',
              status: 'active',
              address: 'node-1/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-2',
              status: 'active',
              address: 'node-2/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/partition/nodes-p1-r3',
            },
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-4',
        });

        t.equal(
          operation.replicaId,
          'nodes-p1-r4',
          'ADD should allocate next canonical replica id instead of UUID',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('UnifiedRebalancer skips ADD scheduling when storage admission blocks it',
    async (t) => {
      const admissionCalls = [];
      const coordinator = createTestCoordinator({
        storageAdmissionService: {
          async checkAdd(options) {
            admissionCalls.push(options);
            return {
              allowed: false,
              decision: 'deny',
              decisionType: 'blocked',
              blockingReasons: [{
                code: 'insufficient_placement_eligible_nodes',
              }],
            };
          },
        },
      });
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        rebalanceCoordinator: coordinator,
        cacheData: {
          nodes: [
            {node_id: 'node-1', status: 'active'},
            {node_id: 'node-2', status: 'active'},
          ],
        },
      });

      try {
        coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
        const result = await rebalancer.executeMove({
          type: MoveType.ADD,
          nodeId: 'node-2',
          reason: 'spread_replicas',
        });

        t.equal(admissionCalls.length, 1,
          'ADD scheduling should consult the admission owner once');
        t.same(admissionCalls[0], {
          targetNodeId: 'node-2',
          estimatedBytes: 1,
          isCritical: true,
        }, 'ADD admission should use the canonical add owner path');
        t.equal(result.skipped, true,
          'blocked admission should skip scheduling instead of throwing');
        t.equal(result.reason, 'blocked');
        t.equal(
          result.admission.blockingReasons[0].code,
          'insufficient_placement_eligible_nodes',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test(
    'RebalanceCoordinator forwards explicit bootstrap topology on CREATE_REPLICA',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'users-p1',
          entityType: 'partition',
          entityId: 'users-p1',
          nodeId: 'node-2',
        });
        const bootstrapReplicaIds = ['users-p1-r1', 'users-p1-r2', 'users-p1-r3'];
        const bootstrapPeerAddresses = [
          'node-1/partition/users-p1-r1',
          'node-2/partition/users-p1-r2',
          'node-3/partition/users-p1-r3',
        ];
        operation[ReplicaOperationField.REPLICA_IDS] = bootstrapReplicaIds;
        operation[ReplicaOperationField.PEER_ADDRESSES] =
          bootstrapPeerAddresses;

        await coordinator.executeOperation(operation);

        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.REPLICA_IDS],
          bootstrapReplicaIds,
          'bootstrap replica ids should be preserved on the CREATE_REPLICA payload',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          bootstrapPeerAddresses,
          'bootstrap peer addresses should be preserved on the CREATE_REPLICA payload',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator derives canonical topology for message-group CREATE_REPLICA',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {
              service_id: 'mg-1-r1',
              replica_id: 'mg-1-r1',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/message-group/mg-1-r1',
            },
            {
              service_id: 'mg-1-r2',
              replica_id: 'mg-1-r2',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-2',
              status: 'active',
              address: 'node-2/message-group/mg-1-r2',
            },
            {
              service_id: 'mg-1-r3',
              replica_id: 'mg-1-r3',
              service_type: 'message_group',
              group_id: 'mg-1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/message-group/mg-1-r3',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'mg-1',
          entityType: 'message_group',
          entityId: 'mg-1',
          nodeId: 'node-4',
          replicaId: 'mg-1-r4',
        });

        await coordinator.executeOperation(operation);

        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.REPLICA_IDS],
          ['mg-1-r1', 'mg-1-r2', 'mg-1-r3', 'mg-1-r4'],
          'message-group create payload should include canonical replica ids',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          [
            'seed-node/message-group/mg-1-r1',
            'node-2/message-group/mg-1-r2',
            'node-3/message-group/mg-1-r3',
            'node-4/message-group/mg-1-r4',
          ],
          'message-group create payload should include canonical peer addresses',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
});
