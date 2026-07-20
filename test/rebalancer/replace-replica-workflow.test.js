/**
 * Tests for first-class REPLACE replica workflow.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';
import {registerReplaceReplicaWorkflowCreateSatisfactionTests} from './replace-replica-workflow-create-satisfaction-test-cases.js';
import {registerReplaceReplicaWorkflowSourceRemovalRetryTests} from './replace-replica-workflow-source-removal-retry-test-cases.js';
import {registerReplaceReplicaWorkflowTailTests} from './replace-replica-workflow-tail-test-cases.js';

const TEST_REPLACE_REMOVE_SAFETY_BLOCKED = 'replace_remove_safety_blocked';
const TEST_PRIORITY_SPREAD_PENDING = 'priority_spread_pending';
const TEST_VISIBILITY_OBSERVATION_STATE_PRESENT = 'present';
const TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED =
  'authoritative_operation_read_deferred';
const TEST_COMPLETED_REMOVE_TEST_NAME =
  'REPLACE source-removal completed response waits for source visibility';
const TEST_COMPLETED_REMOVE_OPERATION_ID =
  'replace-source-remove-completed-op';
const TEST_COMPLETED_REMOVE_PARTITION_ID = 'sql_write_operations-p1';
const TEST_COMPLETED_REMOVE_SOURCE_NODE_ID = 'node-completed-remove-a';
const TEST_COMPLETED_REMOVE_STABLE_NODE_ID = 'node-completed-remove-b';
const TEST_COMPLETED_REMOVE_SECOND_STABLE_NODE_ID = 'node-completed-remove-c';
const TEST_COMPLETED_REMOVE_TARGET_NODE_ID = 'node-completed-remove-d';
const TEST_COMPLETED_REMOVE_SOURCE_REPLICA_ID =
  'sql_write_operations-p1-r1';
const TEST_COMPLETED_REMOVE_STABLE_REPLICA_ID =
  'sql_write_operations-p1-r2';
const TEST_COMPLETED_REMOVE_SECOND_STABLE_REPLICA_ID =
  'sql_write_operations-p1-r3';
const TEST_COMPLETED_REMOVE_TARGET_REPLICA_ID =
  'sql_write_operations-p1-r4';
const TEST_COMPLETED_REMOVE_SERVICE_TYPE = 'partition';
const TEST_COMPLETED_REMOVE_CONNECTION_CONNECTED = 'connected';
const TEST_COMPLETED_REMOVE_CONNECTION_READY = 'ready';
const TEST_COMPLETED_REMOVE_LEADER_ROLE = 'leader';
const TEST_COMPLETED_REMOVE_FOLLOWER_ROLE = 'follower';
const TEST_COMPLETED_REMOVE_READY_LEASE_EXTENSION_MS = 60000;
const TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE =
  OPERATION_WORKFLOW_OWNER_SHARED.OPERATION_WORKFLOW_OWNER_LITERAL
    .REPLICA_OPERATION_DISPATCH;
const TEST_REPLICA_OPERATION_DISPATCH_TIMEOUT_MS =
  OPERATION_WORKFLOW_OWNER_SHARED.REPLICA_OPERATION_DISPATCH_TIMEOUT_MS;
const TEST_DISPATCH_DEADLINE_FAST_TIMEOUT_MS = 5;
const TEST_DISPATCH_DEADLINE_RETRY_POLL_LIMIT = 10;
const TEST_DISPATCH_DEADLINE_TEST_NAME =
  'critical dispatch delivery timeout defers a stuck local handler';
const TEST_DISPATCH_DEADLINE_PARTITION_ID = 'replica_operations-p1';
const TEST_DISPATCH_DEADLINE_ENTITY_TYPE = 'partition';
const TEST_DISPATCH_DEADLINE_OWNER_NODE_ID = 'node-dispatch-deadline-owner';
const TEST_DISPATCH_DEADLINE_SEED_NODE_ID = 'node-dispatch-deadline-seed';
const TEST_DISPATCH_DEADLINE_PEER_NODE_ID = 'node-dispatch-deadline-peer';
const TEST_DISPATCH_DEADLINE_SOURCE_REPLICA_ID =
  'replica_operations-p1-r1';
const TEST_DISPATCH_DEADLINE_PEER_REPLICA_ID =
  'replica_operations-p1-r2';
const TEST_DISPATCH_DEADLINE_SERVICE_TYPE = 'partition';
const TEST_DISPATCH_DEADLINE_ACTIVE_STATUS = 'active';
const TEST_DISPATCH_DEADLINE_ADDRESS_PARTITION_SEGMENT = '/partition/';
const TEST_DEFERRED_RETRY_PENDING_REASON = 'deferred_retry_pending';
const TEST_RECENT_REPLICA_ID_ALLOCATION_TEST_NAME =
  'REPLACE allocation skips recently completed target replica ids';
const TEST_RECENT_REPLICA_ID_PARTITION_ID =
  'sql_transaction_participants-p1';
const TEST_RECENT_REPLICA_ID_ENTITY_TYPE = 'partition';
const TEST_RECENT_REPLICA_ID_SOURCE_NODE_ID = 'node-recent-a';
const TEST_RECENT_REPLICA_ID_SECOND_NODE_ID = 'node-recent-b';
const TEST_RECENT_REPLICA_ID_THIRD_NODE_ID = 'node-recent-c';
const TEST_RECENT_REPLICA_ID_COMPLETED_TARGET_NODE_ID = 'node-recent-d';
const TEST_RECENT_REPLICA_ID_NEW_TARGET_NODE_ID = 'node-recent-e';
const TEST_RECENT_REPLICA_ID_SOURCE_REPLICA_ID =
  'sql_transaction_participants-p1-r1';
const TEST_RECENT_REPLICA_ID_SECOND_REPLICA_ID =
  'sql_transaction_participants-p1-r2';
const TEST_RECENT_REPLICA_ID_THIRD_REPLICA_ID =
  'sql_transaction_participants-p1-r3';
const TEST_RECENT_REPLICA_ID_COMPLETED_TARGET_REPLICA_ID =
  'sql_transaction_participants-p1-r4';
const TEST_RECENT_REPLICA_ID_COMPLETED_OPERATION_ID =
  'completed-replace-target-r4';
const TEST_RECENT_REPLICA_ID_COMPLETED_AGE_MS = 1;
const TEST_RETIRED_SOURCE_SAFETY_TEST_NAME =
  'REPLACE creation skips source replica retired by completed replacement';
const TEST_RETIRED_SOURCE_PARTITION_ID =
  'sql_transaction_participants-p1';
const TEST_RETIRED_SOURCE_ENTITY_TYPE = 'partition';
const TEST_RETIRED_SOURCE_STABLE_NODE_ID = 'node-retired-a';
const TEST_RETIRED_SOURCE_SECOND_STABLE_NODE_ID = 'node-retired-b';
const TEST_RETIRED_SOURCE_RETIRED_NODE_ID = 'node-retired-c';
const TEST_RETIRED_SOURCE_TARGET_NODE_ID = 'node-retired-d';
const TEST_RETIRED_SOURCE_STABLE_REPLICA_ID =
  'sql_transaction_participants-p1-r1';
const TEST_RETIRED_SOURCE_SECOND_STABLE_REPLICA_ID =
  'sql_transaction_participants-p1-r2';
const TEST_RETIRED_SOURCE_RETIRED_REPLICA_ID =
  'sql_transaction_participants-p1-r4';
const TEST_RETIRED_SOURCE_COMPLETED_TARGET_REPLICA_ID =
  'sql_transaction_participants-p1-r5';
const TEST_RETIRED_SOURCE_COMPLETED_OPERATION_ID =
  'completed-replace-retired-source-r4';
const TEST_RETIRED_SOURCE_SAFETY_ERROR =
  'replace source replica already retired by completed operation';
const TEST_RETIRED_SOURCE_COMPLETED_AGE_MS = 1;
const TEST_RETIRED_SOURCE_CREATE_ERROR_MESSAGE =
  'createOperation should reject retired replacement source';

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

      // nodes-p1 is the formation-liveness-dependency partition: its serial
      // goal-state planner emits at most one executable move per tick, so the
      // spread cure converges over two planning ticks.
      const applyReplaceMove = (replicas, move) => replicas.map((replica) =>
        replica.replica_id === move.replicaId ?
          {
            ...replica,
            node_id: move.nodeId,
            address: move.nodeId + '/partition/' + replica.replica_id,
            raft_role: 'follower',
          } :
          replica,
      );
      const firstMoves = rebalancer.calculateMoves(currentReplicas, targetState);
      const firstReplaceMoves =
        firstMoves.filter((move) => move.type === MoveType.REPLACE);
      t.equal(
        firstReplaceMoves.length,
        1,
        'serial formation planner should emit one REPLACE per tick',
      );
      const secondTickReplicas =
        applyReplaceMove(currentReplicas, firstReplaceMoves[0]);
      const secondMoves =
        rebalancer.calculateMoves(secondTickReplicas, targetState);
      const moves = [...firstMoves, ...secondMoves];
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
        nodeId: 'node-2',
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

        // REPLACE creation is idempotent across creators: the target replica
        // id is derived deterministically from the move intent identity
        // (rebalance-replace-intent-identity.js), not the canonical -rN pool.
        const replacementReplicaId = operation.replicaId;
        t.match(
          replacementReplicaId,
          /^replace-replica-[0-9a-f]{32}$/,
          'REPLACE create phase should allocate the deterministic ' +
          'intent-derived replica id on target',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'first REPLACE phase should issue CREATE_REPLICA to target node',
        );
        t.equal(
          deliveries[0]?.payload?.[ReplicaOperationField.OPERATION_TYPE],
          OperationType.REPLACE,
          'first REPLACE phase should carry the enclosing operation type explicitly',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.REPLICA_IDS],
          ['nodes-p1-r2', 'nodes-p1-r3', replacementReplicaId],
          'REPLACE create phase should exclude the retiring source replica from bootstrap replica ids',
        );
        t.same(
          deliveries[0]?.payload?.[ReplicaOperationField.PEER_ADDRESSES],
          [
            'seed-node/partition/nodes-p1-r2',
            'seed-node/partition/nodes-p1-r3',
            'node-2/partition/' + replacementReplicaId,
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

  await t.test(TEST_RECENT_REPLICA_ID_ALLOCATION_TEST_NAME, async (t) => {
    const nowMs = Date.now();
    const buildService = (replicaId, nodeId) => ({
      service_id: replicaId,
      replica_id: replicaId,
      service_type: TEST_RECENT_REPLICA_ID_ENTITY_TYPE,
      partition_id: TEST_RECENT_REPLICA_ID_PARTITION_ID,
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      address:
        nodeId +
        '/' +
        TEST_RECENT_REPLICA_ID_ENTITY_TYPE +
        '/' +
        replicaId,
    });
    const coordinator = createTestCoordinator({
      cacheData: {
        services: [
          buildService(
            TEST_RECENT_REPLICA_ID_SOURCE_REPLICA_ID,
            TEST_RECENT_REPLICA_ID_SOURCE_NODE_ID,
          ),
          buildService(
            TEST_RECENT_REPLICA_ID_SECOND_REPLICA_ID,
            TEST_RECENT_REPLICA_ID_SECOND_NODE_ID,
          ),
          buildService(
            TEST_RECENT_REPLICA_ID_THIRD_REPLICA_ID,
            TEST_RECENT_REPLICA_ID_THIRD_NODE_ID,
          ),
        ],
        replicaOperations: [
          {
            operation_id: TEST_RECENT_REPLICA_ID_COMPLETED_OPERATION_ID,
            type: OperationType.REPLACE,
            partition_id: TEST_RECENT_REPLICA_ID_PARTITION_ID,
            entity_type: TEST_RECENT_REPLICA_ID_ENTITY_TYPE,
            entity_id: TEST_RECENT_REPLICA_ID_PARTITION_ID,
            replica_id: TEST_RECENT_REPLICA_ID_COMPLETED_TARGET_REPLICA_ID,
            source_node_id: TEST_RECENT_REPLICA_ID_SOURCE_NODE_ID,
            target_node_id: TEST_RECENT_REPLICA_ID_COMPLETED_TARGET_NODE_ID,
            status: ReplicaStatus.REMOVED,
            workflow_step: WORKFLOW_STEP.REMOVED,
            created_at: nowMs - TEST_RECENT_REPLICA_ID_COMPLETED_AGE_MS,
            updated_at: nowMs,
            completed_at: nowMs,
          },
        ],
      },
    });
    coordinator.initialize();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: TEST_RECENT_REPLICA_ID_PARTITION_ID,
        entityType: TEST_RECENT_REPLICA_ID_ENTITY_TYPE,
        entityId: TEST_RECENT_REPLICA_ID_PARTITION_ID,
        nodeId: TEST_RECENT_REPLICA_ID_NEW_TARGET_NODE_ID,
        sourceNodeId: TEST_RECENT_REPLICA_ID_SOURCE_NODE_ID,
        replicaId: TEST_RECENT_REPLICA_ID_SOURCE_REPLICA_ID,
      });

      // Deterministic REPLACE intent identity (a66f909d): the target replica
      // id is a digest of the move identity, not a canonical -rN allocation;
      // the sealed contract is only that it never reuses the recently
      // completed target id.
      t.match(
        operation.replicaId,
        /^replace-replica-[0-9a-f]{32}$/,
        'replacement target uses the deterministic intent-identity digest',
      );
      t.not(
        operation.replicaId,
        TEST_RECENT_REPLICA_ID_COMPLETED_TARGET_REPLICA_ID,
        'allocator should not reuse a recently completed replacement target replica id',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test(TEST_RETIRED_SOURCE_SAFETY_TEST_NAME, async (t) => {
    const nowMs = Date.now();
    const buildService = (replicaId, nodeId) => ({
      service_id: replicaId,
      replica_id: replicaId,
      service_type: TEST_RETIRED_SOURCE_ENTITY_TYPE,
      partition_id: TEST_RETIRED_SOURCE_PARTITION_ID,
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      address:
        nodeId +
        '/' +
        TEST_RETIRED_SOURCE_ENTITY_TYPE +
        '/' +
        replicaId,
    });
    const replaceMove = {
      type: OperationType.REPLACE,
      partitionId: TEST_RETIRED_SOURCE_PARTITION_ID,
      entityType: TEST_RETIRED_SOURCE_ENTITY_TYPE,
      entityId: TEST_RETIRED_SOURCE_PARTITION_ID,
      nodeId: TEST_RETIRED_SOURCE_TARGET_NODE_ID,
      sourceNodeId: TEST_RETIRED_SOURCE_RETIRED_NODE_ID,
      replicaId: TEST_RETIRED_SOURCE_RETIRED_REPLICA_ID,
    };
    const coordinator = createTestCoordinator({
      cacheData: {
        services: [
          buildService(
            TEST_RETIRED_SOURCE_STABLE_REPLICA_ID,
            TEST_RETIRED_SOURCE_STABLE_NODE_ID,
          ),
          buildService(
            TEST_RETIRED_SOURCE_SECOND_STABLE_REPLICA_ID,
            TEST_RETIRED_SOURCE_SECOND_STABLE_NODE_ID,
          ),
          buildService(
            TEST_RETIRED_SOURCE_RETIRED_REPLICA_ID,
            TEST_RETIRED_SOURCE_RETIRED_NODE_ID,
          ),
        ],
        replicaOperations: [
          {
            operation_id: TEST_RETIRED_SOURCE_COMPLETED_OPERATION_ID,
            type: OperationType.REPLACE,
            partition_id: TEST_RETIRED_SOURCE_PARTITION_ID,
            entity_type: TEST_RETIRED_SOURCE_ENTITY_TYPE,
            entity_id: TEST_RETIRED_SOURCE_PARTITION_ID,
            replica_id: TEST_RETIRED_SOURCE_COMPLETED_TARGET_REPLICA_ID,
            source_node_id: TEST_RETIRED_SOURCE_RETIRED_NODE_ID,
            target_node_id: TEST_RETIRED_SOURCE_TARGET_NODE_ID,
            status: ReplicaStatus.REMOVED,
            workflow_step: WORKFLOW_STEP.REMOVED,
            steps_history: JSON.stringify([
              {
                step: WORKFLOW_STEP.PENDING,
                [OPERATION_METADATA_KEY.SOURCE_REPLICA_ID]:
                  TEST_RETIRED_SOURCE_RETIRED_REPLICA_ID,
              },
            ]),
            created_at: nowMs - TEST_RETIRED_SOURCE_COMPLETED_AGE_MS,
            updated_at: nowMs,
            completed_at: nowMs,
          },
        ],
      },
    });
    coordinator.initialize();

    try {
      let createError = null;
      try {
        await coordinator.createOperation(replaceMove);
      } catch (error) {
        createError = error;
      }
      t.equal(
        createError?.message,
        TEST_RETIRED_SOURCE_SAFETY_ERROR,
        TEST_RETIRED_SOURCE_CREATE_ERROR_MESSAGE,
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test(TEST_COMPLETED_REMOVE_TEST_NAME, async (t) => {
    const deliveries = [];
    const nowMs = Date.now();
    const buildReadyNode = (nodeId) => ({
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      connection_state: TEST_COMPLETED_REMOVE_CONNECTION_READY,
      ready_lease_expires_at:
        nowMs + TEST_COMPLETED_REMOVE_READY_LEASE_EXTENSION_MS,
    });
    const buildService = (replicaId, nodeId, raftRole) => ({
      service_id: replicaId,
      replica_id: replicaId,
      service_type: TEST_COMPLETED_REMOVE_SERVICE_TYPE,
      partition_id: TEST_COMPLETED_REMOVE_PARTITION_ID,
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      raft_role: raftRole,
      address:
        nodeId +
        '/' +
        TEST_COMPLETED_REMOVE_SERVICE_TYPE +
        '/' +
        replicaId,
    });
    const activeReplaceOperation = {
      operation_id: TEST_COMPLETED_REMOVE_OPERATION_ID,
      operationId: TEST_COMPLETED_REMOVE_OPERATION_ID,
      type: OperationType.REPLACE,
      partition_id: TEST_COMPLETED_REMOVE_PARTITION_ID,
      partitionId: TEST_COMPLETED_REMOVE_PARTITION_ID,
      replica_id: TEST_COMPLETED_REMOVE_TARGET_REPLICA_ID,
      replicaId: TEST_COMPLETED_REMOVE_TARGET_REPLICA_ID,
      sourceReplicaId: TEST_COMPLETED_REMOVE_SOURCE_REPLICA_ID,
      source_node_id: TEST_COMPLETED_REMOVE_SOURCE_NODE_ID,
      sourceNodeId: TEST_COMPLETED_REMOVE_SOURCE_NODE_ID,
      target_node_id: TEST_COMPLETED_REMOVE_TARGET_NODE_ID,
      targetNodeId: TEST_COMPLETED_REMOVE_TARGET_NODE_ID,
      status: ReplicaStatus.ACTIVE,
      workflow_step: WORKFLOW_STEP.ACTIVE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      created_at: nowMs,
      createdAt: nowMs,
      updated_at: nowMs,
      updatedAt: nowMs,
      completed_at: null,
      completedAt: null,
      error_message: null,
      errorMessage: null,
      entity_type: TEST_COMPLETED_REMOVE_SERVICE_TYPE,
      entityType: TEST_COMPLETED_REMOVE_SERVICE_TYPE,
      entity_id: TEST_COMPLETED_REMOVE_PARTITION_ID,
      entityId: TEST_COMPLETED_REMOVE_PARTITION_ID,
      stepsHistory: [
        {
          step: WORKFLOW_STEP.PENDING,
          timestamp: nowMs,
          [OPERATION_METADATA_KEY.SOURCE_REPLICA_ID]:
            TEST_COMPLETED_REMOVE_SOURCE_REPLICA_ID,
        },
        {
          step: WORKFLOW_STEP.ACTIVE,
          timestamp: nowMs,
          previousStep: WORKFLOW_STEP.SYNCING,
        },
      ],
    };
    const messageRouter = {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.COMPLETED,
        };
      },
      getConnectionState: () => TEST_COMPLETED_REMOVE_CONNECTION_CONNECTED,
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    };
    const coordinator = createTestCoordinator({
      nodeId: TEST_COMPLETED_REMOVE_TARGET_NODE_ID,
      enableTimeouts: false,
      messageRouter,
      cacheData: {
        nodes: [
          buildReadyNode(TEST_COMPLETED_REMOVE_SOURCE_NODE_ID),
          buildReadyNode(TEST_COMPLETED_REMOVE_STABLE_NODE_ID),
          buildReadyNode(TEST_COMPLETED_REMOVE_SECOND_STABLE_NODE_ID),
          buildReadyNode(TEST_COMPLETED_REMOVE_TARGET_NODE_ID),
        ],
        services: [
          buildService(
            TEST_COMPLETED_REMOVE_SOURCE_REPLICA_ID,
            TEST_COMPLETED_REMOVE_SOURCE_NODE_ID,
            TEST_COMPLETED_REMOVE_FOLLOWER_ROLE,
          ),
          buildService(
            TEST_COMPLETED_REMOVE_STABLE_REPLICA_ID,
            TEST_COMPLETED_REMOVE_STABLE_NODE_ID,
            TEST_COMPLETED_REMOVE_LEADER_ROLE,
          ),
          buildService(
            TEST_COMPLETED_REMOVE_SECOND_STABLE_REPLICA_ID,
            TEST_COMPLETED_REMOVE_SECOND_STABLE_NODE_ID,
            TEST_COMPLETED_REMOVE_FOLLOWER_ROLE,
          ),
          buildService(
            TEST_COMPLETED_REMOVE_TARGET_REPLICA_ID,
            TEST_COMPLETED_REMOVE_TARGET_NODE_ID,
            TEST_COMPLETED_REMOVE_FOLLOWER_ROLE,
          ),
        ],
        replicaOperations: [activeReplaceOperation],
      },
    });
    const originalEvaluateRemoveSafety =
      coordinator.workflowOwner.evaluateRemoveSafety.bind(
        coordinator.workflowOwner,
      );
    coordinator.workflowOwner.evaluateRemoveSafety = async (operation) => {
      if (operation?.operationId === TEST_COMPLETED_REMOVE_OPERATION_ID) {
        return coordinator.workflowOwner.buildSafeRemoveSafetyEvaluation();
      }
      return originalEvaluateRemoveSafety(operation);
    };

    try {
      const result = await coordinator.executeOperation(activeReplaceOperation);
      const persistedOperation =
        await coordinator.queryOperationById(TEST_COMPLETED_REMOVE_OPERATION_ID);

      t.equal(
        deliveries.length,
        1,
        'source removal should dispatch once',
      );
      t.equal(
        deliveries[0]?.payload?.type,
        ReplicaOperationMessageType.REMOVE_REPLICA,
        'completed response should come from source-removal dispatch',
      );
      t.equal(
        result?.status,
        ReplicaOperationResponseStatus.IN_PROGRESS,
        'completed dispatch response should remain in-progress until source visibility closes',
      );
      t.equal(
        activeReplaceOperation.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'operation should advance to STOPPING instead of terminal REMOVED',
      );
      t.equal(
        activeReplaceOperation.completedAt,
        null,
        'operation should not complete while the source service row remains visible',
      );
      t.equal(
        persistedOperation?.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'durable operation row should remain in source-removal drain',
      );
      t.equal(
        persistedOperation?.status,
        ReplicaStatus.REMOVING,
        'durable operation row should record the source-removal state',
      );
      t.equal(
        persistedOperation?.completedAt,
        null,
        'durable operation row should not have a terminal timestamp yet',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test(
    'critical dispatch defers retryable control-plane failures instead of ' +
      'failing terminally',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (deliveries.length === 1) {
            return {
              acknowledged: false,
              error: {
                message: 'control_plane_pressure_degraded',
                retryAfterMs: 10,
              },
            };
          }
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-2',
        enableTimeouts: false,
        messageRouter,
        setTimeoutFn(fn, delayMs) {
          const handle = {fn, delayMs};
          deferredTimers.push(handle);
          return handle;
        },
        clearTimeoutFn() {},
        cacheData: {
          services: [
            {
              service_id: 'replica_operations-p1-r1',
              replica_id: 'replica_operations-p1-r1',
              service_type: 'partition',
              partition_id: 'replica_operations-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/replica_operations-p1-r1',
            },
            {
              service_id: 'replica_operations-p1-r2',
              replica_id: 'replica_operations-p1-r2',
              service_type: 'partition',
              partition_id: 'replica_operations-p1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/partition/replica_operations-p1-r2',
            },
          ],
        },
      });

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'replica_operations-p1',
          entityType: 'partition',
          entityId: 'replica_operations-p1',
          nodeId: 'node-2',
        });

        const firstAttempt = await coordinator.executeOperation(operation);
        t.equal(
          firstAttempt.reason,
          'deferred_retry_pending',
          'retryable critical dispatch failures should defer instead of failing',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.SENDING,
          'the in-flight operation should remain dispatchable',
        );
        t.equal(deliveries.length, 1, 'first dispatch attempt should execute');
        t.equal(
          deliveries[0]?.options?.deliverySource,
          TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
          'critical system dispatch should use an owned transport source',
        );
        t.equal(
          deliveries[0]?.options?.timeoutMs,
          TEST_REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
          'critical system dispatch should use a bounded delivery deadline',
        );
        t.equal(
          deferredTimers.length,
          1,
          'a bounded deferred retry should be armed',
        );

        const persistedBeforeRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          persistedBeforeRetry.workflowStep,
          WORKFLOW_STEP.SENDING,
          'the persisted row should remain in SENDING while retry is pending',
        );
        t.equal(
          persistedBeforeRetry.status,
          ReplicaStatus.PENDING,
          'the persisted row should not be marked failed on a retryable error',
        );

        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(deliveries.length, 2, 'deferred retry should replay dispatch');
        t.equal(
          persistedAfterRetry.workflowStep,
          WORKFLOW_STEP.CREATING,
          'successful retry should advance the same operation',
        );
        t.equal(
          persistedAfterRetry.status,
          ReplicaStatus.CREATING,
          'successful retry should keep the existing operation alive',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(TEST_DISPATCH_DEADLINE_TEST_NAME, async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    let hangFirstDispatch = true;
    const messageRouter = {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        if (hangFirstDispatch) {
          hangFirstDispatch = false;
          return new Promise(() => {});
        }
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    };

    const coordinator = createTestCoordinator({
      nodeId: TEST_DISPATCH_DEADLINE_OWNER_NODE_ID,
      enableTimeouts: false,
      messageRouter,
      replicaOperationDispatchTimeoutMs:
        TEST_DISPATCH_DEADLINE_FAST_TIMEOUT_MS,
      setTimeoutFn(fn, delayMs) {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
      cacheData: {
        services: [
          {
            service_id: TEST_DISPATCH_DEADLINE_SOURCE_REPLICA_ID,
            replica_id: TEST_DISPATCH_DEADLINE_SOURCE_REPLICA_ID,
            service_type: TEST_DISPATCH_DEADLINE_SERVICE_TYPE,
            partition_id: TEST_DISPATCH_DEADLINE_PARTITION_ID,
            node_id: TEST_DISPATCH_DEADLINE_SEED_NODE_ID,
            status: TEST_DISPATCH_DEADLINE_ACTIVE_STATUS,
            address:
              TEST_DISPATCH_DEADLINE_SEED_NODE_ID +
              TEST_DISPATCH_DEADLINE_ADDRESS_PARTITION_SEGMENT +
              TEST_DISPATCH_DEADLINE_SOURCE_REPLICA_ID,
          },
          {
            service_id: TEST_DISPATCH_DEADLINE_PEER_REPLICA_ID,
            replica_id: TEST_DISPATCH_DEADLINE_PEER_REPLICA_ID,
            service_type: TEST_DISPATCH_DEADLINE_SERVICE_TYPE,
            partition_id: TEST_DISPATCH_DEADLINE_PARTITION_ID,
            node_id: TEST_DISPATCH_DEADLINE_PEER_NODE_ID,
            status: TEST_DISPATCH_DEADLINE_ACTIVE_STATUS,
            address:
              TEST_DISPATCH_DEADLINE_PEER_NODE_ID +
              TEST_DISPATCH_DEADLINE_ADDRESS_PARTITION_SEGMENT +
              TEST_DISPATCH_DEADLINE_PEER_REPLICA_ID,
          },
        ],
      },
    });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: TEST_DISPATCH_DEADLINE_PARTITION_ID,
        entityType: TEST_DISPATCH_DEADLINE_ENTITY_TYPE,
        entityId: TEST_DISPATCH_DEADLINE_PARTITION_ID,
        nodeId: TEST_DISPATCH_DEADLINE_OWNER_NODE_ID,
      });

      const firstAttempt = await coordinator.executeOperation(operation);
      t.equal(
        firstAttempt.reason,
        TEST_DEFERRED_RETRY_PENDING_REASON,
        'dispatch deadline should keep critical operation retryable',
      );
      t.equal(
        deliveries.length,
        1,
        'first dispatch should be abandoned after the delivery deadline',
      );
      t.equal(
        deliveries[0]?.options?.timeoutMs,
        TEST_DISPATCH_DEADLINE_FAST_TIMEOUT_MS,
        'dispatch should use the configured owner deadline',
      );
      t.equal(
        deferredTimers.length,
        1,
        'deadline failure should arm the existing dispatch retry timer',
      );

      const persistedBeforeRetry =
        await coordinator.queryOperationById(operation.operationId);
      t.equal(
        persistedBeforeRetry.workflowStep,
        WORKFLOW_STEP.SENDING,
        'timed-out dispatch should remain replayable from SENDING',
      );
      t.equal(
        persistedBeforeRetry.status,
        ReplicaStatus.PENDING,
        'timed-out dispatch should not fail the operation row',
      );

      await deferredTimers[0].fn();
      for (
        let attempt = 0;
        attempt < TEST_DISPATCH_DEADLINE_RETRY_POLL_LIMIT &&
          deliveries.length < 2;
        attempt++
      ) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const persistedAfterRetry =
        await coordinator.queryOperationById(operation.operationId);
      t.equal(deliveries.length, 2, 'deferred retry should replay dispatch');
      t.equal(
        persistedAfterRetry.workflowStep,
        WORKFLOW_STEP.CREATING,
        'successful retry should advance the original operation',
      );
      t.equal(
        persistedAfterRetry.status,
        ReplicaStatus.CREATING,
        'successful retry should keep the operation alive',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  await registerReplaceReplicaWorkflowCreateSatisfactionTests({
    t,
    WORKFLOW_STEP,
    OperationType,
    ReplicaStatus,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    createTestCoordinator,
    TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
    TEST_PRIORITY_SPREAD_PENDING,
  });

  await registerReplaceReplicaWorkflowSourceRemovalRetryTests({
    t,
    WORKFLOW_STEP,
    OperationType,
    ReplicaStatus,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    ROUTER_ERROR_MSG,
    createTestCoordinator,
    TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
    TEST_PRIORITY_SPREAD_PENDING,
    TEST_VISIBILITY_OBSERVATION_STATE_PRESENT,
    TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
  });

  await registerReplaceReplicaWorkflowTailTests({
    t,
    WORKFLOW_STEP,
    OperationType,
    ReplicaStatus,
    ReplicaOperationField,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    SQLParser,
    MoveType,
    createTestCoordinator,
    createTestRebalancer,
    TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
    TEST_PRIORITY_SPREAD_PENDING,
    TEST_VISIBILITY_OBSERVATION_STATE_PRESENT,
    TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
  });
});
