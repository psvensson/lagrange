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
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';
import {registerReplaceReplicaWorkflowTailTests} from './replace-replica-workflow-tail-test-cases.js';

const TEST_REPLACE_REMOVE_SAFETY_BLOCKED = 'replace_remove_safety_blocked';
const TEST_PRIORITY_SPREAD_PENDING = 'priority_spread_pending';
const TEST_VISIBILITY_OBSERVATION_STATE_PRESENT = 'present';
const TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED =
  'authoritative_operation_read_deferred';

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
        t.equal(
          deliveries[0]?.payload?.[ReplicaOperationField.OPERATION_TYPE],
          OperationType.REPLACE,
          'first REPLACE phase should carry the enclosing operation type explicitly',
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
        nodeId: 'seed-node',
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

  await t.test(
    'REPLACE create ALREADY_EXISTS re-arms observed progress instead of ' +
      'redispatching duplicate create work',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let failActiveTransition = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
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

      const basePersistOperationUpdate =
        coordinator.repository.persistOperationUpdate.bind(
          coordinator.repository,
        );
      coordinator.repository.persistOperationUpdate =
        async (nextOperation, options = {}) => {
          if (nextOperation?.workflowStep === WORKFLOW_STEP.ACTIVE &&
              failActiveTransition) {
            failActiveTransition = false;
            const error = new Error('control_plane_pressure_degraded');
            error.retryAfterMs = 10;
            throw error;
          }
          return basePersistOperationUpdate(nextOperation, options);
        };
      coordinator.workflowOwner.getActualReplicaStatus =
        async (_replicaId, partitionId, targetNodeId) => {
          if (partitionId === 'nodes-p1' && targetNodeId === 'node-2') {
            return ReplicaStatus.ACTIVE;
          }
          return null;
        };

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

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt.reason,
          'deferred_retry_pending',
          'retryable ACTIVE promotion failures should defer through observed progress',
        );
        t.equal(
          deliveries.length,
          1,
          'the first attempt should only send the create phase once',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the initial dispatch should be the replacement create',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.SENDING,
          'the operation should stay dispatchable until observed progress resumes it',
        );
        t.equal(
          deferredTimers.length,
          1,
          'a bounded observed-progress retry should be armed',
        );

        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          deliveries.length,
          2,
          'the retry should continue with source removal, not a second create',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'observed progress should advance directly into source removal',
        );
        t.equal(
          persistedAfterRetry.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replacement should advance once observed progress resumes',
        );
        t.equal(
          persistedAfterRetry.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'REPLACE create ALREADY_EXISTS resumes source removal when ACTIVE is ' +
      'already committed but authoritative reread is empty',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
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

        coordinator.operationWorkflowCoordinator
          .markTransitionCommitted(
            operation.operationId,
            WORKFLOW_STEP.ACTIVE,
          );
        coordinator.repository.queryAuthoritativeOperationById =
          async () => null;

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result?.status,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          'the create-side response should still surface as already exists',
        );
        t.equal(
          deliveries.length,
          2,
          'the owner should still resume source removal from the local ACTIVE row',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the first dispatch should be the replacement create',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the second dispatch should retire the source replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replacement should advance into source removal even without an authoritative reread',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'critical REPLACE create ALREADY_EXISTS resumes source removal after ' +
      'deferred safety opens',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let sourceRemovalBlocked = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter,
        setTimeoutFn(fn, delayMs) {
          const handle = {fn, delayMs};
          deferredTimers.push(handle);
          return handle;
        },
        clearTimeoutFn() {},
        cacheData: {
          nodes: [
            {
              node_id: 'node-a',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-b',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-c',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-d',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'control_plane_publications-p1-r1',
              replica_id: 'control_plane_publications-p1-r1',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/control_plane_publications-p1-r1',
            },
            {
              service_id: 'control_plane_publications-p1-r2',
              replica_id: 'control_plane_publications-p1-r2',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/control_plane_publications-p1-r2',
            },
            {
              service_id: 'control_plane_publications-p1-r3',
              replica_id: 'control_plane_publications-p1-r3',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/control_plane_publications-p1-r3',
            },
            {
              service_id: 'control_plane_publications-p1-r4',
              replica_id: 'control_plane_publications-p1-r4',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-d',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-d/partition/control_plane_publications-p1-r4',
            },
          ],
        },
      });

      const originalEvaluateRemoveSafety =
        coordinator.workflowOwner.evaluateRemoveSafety.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.evaluateRemoveSafety =
        async (operation) => {
          if (operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            if (sourceRemovalBlocked) {
              return coordinator.workflowOwner
                .buildDeferredRemoveSafetyEvaluation(
                  TEST_PRIORITY_SPREAD_PENDING,
                  TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
                );
            }
            return coordinator.workflowOwner
              .buildSafeRemoveSafetyEvaluation();
          }
          return originalEvaluateRemoveSafety(operation);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'control_plane_publications-p1-r1',
        });

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt?.status,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          'the create-side satisfied response should surface as already exists',
        );
        t.equal(
          deliveries.length,
          1,
          'the first attempt should only dispatch the replacement create',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the first dispatch should be the replacement create',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'the replacement should remain at ACTIVE while source removal is deferred',
        );
        t.equal(
          deferredTimers.length,
          1,
          'the deferred safety lane should arm one retry',
        );

        sourceRemovalBlocked = false;
        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          deliveries.length,
          2,
          'the deferred retry should continue with source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the replayed ACTIVE row should dispatch source removal',
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the durable row should advance into source removal after the retry',
        );
        t.equal(
          persistedAfterRetry?.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress after the retry',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'critical REPLACE create ALREADY_EXISTS rearms dispatch retry when ' +
      'inline source removal leaves the row parked at ACTIVE',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let suppressInlineSourceRemoval = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter,
        setTimeoutFn(fn, delayMs) {
          const handle = {fn, delayMs};
          deferredTimers.push(handle);
          return handle;
        },
        clearTimeoutFn() {},
        cacheData: {
          nodes: [
            {
              node_id: 'node-a',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-b',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-c',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-d',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'sql_transaction_participants-p1-r1',
              replica_id: 'sql_transaction_participants-p1-r1',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/sql_transaction_participants-p1-r1',
            },
            {
              service_id: 'sql_transaction_participants-p1-r2',
              replica_id: 'sql_transaction_participants-p1-r2',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/sql_transaction_participants-p1-r2',
            },
            {
              service_id: 'sql_transaction_participants-p1-r3',
              replica_id: 'sql_transaction_participants-p1-r3',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/sql_transaction_participants-p1-r3',
            },
            {
              service_id: 'sql_transaction_participants-p1-r4',
              replica_id: 'sql_transaction_participants-p1-r4',
              service_type: 'partition',
              partition_id: 'sql_transaction_participants-p1',
              node_id: 'node-d',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-d/partition/sql_transaction_participants-p1-r4',
            },
          ],
        },
      });

      const originalEvaluateRemoveSafety =
        coordinator.workflowOwner.evaluateRemoveSafety.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.evaluateRemoveSafety =
        async (operation) => {
          if (operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            return coordinator.workflowOwner
              .buildSafeRemoveSafetyEvaluation();
          }
          return originalEvaluateRemoveSafety(operation);
        };

      const originalExecuteOperationFromReconcilePath =
        coordinator.workflowOwner.executeOperationFromReconcilePath.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.executeOperationFromReconcilePath =
        async (operation) => {
          if (suppressInlineSourceRemoval &&
              operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            suppressInlineSourceRemoval = false;
            const testDeferredRetryReason = 'deferred_retry_pending';
            return coordinator.workflowOwner.buildSkippedOperationResult(
              testDeferredRetryReason,
              operation.operationId,
            );
          }
          return originalExecuteOperationFromReconcilePath(operation);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'sql_transaction_participants-p1',
          entityType: 'partition',
          entityId: 'sql_transaction_participants-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'sql_transaction_participants-p1-r1',
        });

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt?.status,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          'the create-side satisfied response should still surface as already exists',
        );
        t.equal(
          deliveries.length,
          1,
          'the first attempt should only dispatch the replacement create',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the first dispatch should be the replacement create',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'the replacement should remain at ACTIVE when inline source removal does not advance it',
        );
        t.equal(
          deferredTimers.length,
          1,
          'the owner should arm the bounded dispatch retry lane instead of leaving the row stranded',
        );

        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          deliveries.length,
          2,
          'the deferred retry should continue with source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the retried ACTIVE row should dispatch source removal',
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the durable row should advance into source removal after the retry',
        );
        t.equal(
          persistedAfterRetry?.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress after the retry',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'critical REPLACE deferred safety retry reconciles stale CREATING state ' +
      'forward instead of dropping the retry lane',
    async (t) => {
      const deliveries = [];
      const deferredTimers = [];
      let sourceRemovalBlocked = true;
      let staleSafetyRetryRead = true;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter,
        setTimeoutFn(fn, delayMs) {
          const handle = {fn, delayMs};
          deferredTimers.push(handle);
          return handle;
        },
        clearTimeoutFn() {},
        cacheData: {
          nodes: [
            {
              node_id: 'node-a',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-b',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-c',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-d',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'control_plane_publications-p1-r1',
              replica_id: 'control_plane_publications-p1-r1',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/control_plane_publications-p1-r1',
            },
            {
              service_id: 'control_plane_publications-p1-r2',
              replica_id: 'control_plane_publications-p1-r2',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/control_plane_publications-p1-r2',
            },
            {
              service_id: 'control_plane_publications-p1-r3',
              replica_id: 'control_plane_publications-p1-r3',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/control_plane_publications-p1-r3',
            },
            {
              service_id: 'control_plane_publications-p1-r4',
              replica_id: 'control_plane_publications-p1-r4',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-d',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-d/partition/control_plane_publications-p1-r4',
            },
          ],
        },
      });

      const originalEvaluateRemoveSafety =
        coordinator.workflowOwner.evaluateRemoveSafety.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.evaluateRemoveSafety =
        async (operation) => {
          if (operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            if (sourceRemovalBlocked) {
              return coordinator.workflowOwner
                .buildDeferredRemoveSafetyEvaluation(
                  TEST_PRIORITY_SPREAD_PENDING,
                  TEST_REPLACE_REMOVE_SAFETY_BLOCKED,
                );
            }
            return coordinator.workflowOwner
              .buildSafeRemoveSafetyEvaluation();
          }
          return originalEvaluateRemoveSafety(operation);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'control_plane_publications-p1-r1',
        });
        const baseQueryAuthoritativeOperationById =
          coordinator.repository.queryAuthoritativeOperationById.bind(
            coordinator.repository,
          );
        coordinator.repository.queryAuthoritativeOperationById =
          async (operationId, options = {}) => {
            const persistedOperation =
              await baseQueryAuthoritativeOperationById(
                operationId,
                options,
              );
            if (staleSafetyRetryRead &&
                operationId === operation.operationId &&
                persistedOperation) {
              staleSafetyRetryRead = false;
              return {
                ...persistedOperation,
                workflowStep: WORKFLOW_STEP.CREATING,
                status: ReplicaStatus.CREATING,
              };
            }
            return persistedOperation;
          };

        const firstAttempt = await coordinator.executeOperation(operation);

        t.equal(
          firstAttempt?.status,
          ReplicaOperationResponseStatus.ALREADY_EXISTS,
          'the create-side satisfied response should surface as already exists',
        );
        t.equal(
          deliveries.length,
          1,
          'the first attempt should only dispatch the replacement create',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'the first dispatch should be the replacement create',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'the replacement should remain at ACTIVE while source removal is deferred',
        );
        t.equal(
          deferredTimers.length,
          1,
          'the deferred safety lane should arm one retry',
        );

        sourceRemovalBlocked = false;
        await deferredTimers[0].fn();
        for (let attempt = 0; attempt < 10 && deliveries.length < 2; attempt++) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);
        t.equal(
          deliveries.length,
          2,
          'the deferred retry should recover from stale creating visibility and continue with source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the recovered retry should dispatch source removal',
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the durable row should advance into source removal after the recovered retry',
        );
        t.equal(
          persistedAfterRetry?.status,
          ReplicaStatus.REMOVING,
          'the durable row should reflect source removal in progress after the recovered retry',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'critical REPLACE create-rearm ALREADY_EXISTS resumes source removal ' +
      'from CREATING on transition-retry resume',
    async (t) => {
      const deliveries = [];
      let createResponseStatus =
        ReplicaOperationResponseStatus.INITIATED;
      const messageRouter = {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          if (payload?.type === ReplicaOperationMessageType.CREATE_REPLICA) {
            return {
              acknowledged: true,
              status: createResponseStatus,
            };
          }
          return {
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          };
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      };

      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          nodes: [
            {
              node_id: 'node-a',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-b',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-c',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
            {
              node_id: 'node-d',
              status: 'active',
              connection_state: 'ready',
              ready_lease_expires_at: Date.now() + 60000,
            },
          ],
          services: [
            {
              service_id: 'control_plane_publications-p1-r1',
              replica_id: 'control_plane_publications-p1-r1',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-a',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
              address: 'node-a/partition/control_plane_publications-p1-r1',
            },
            {
              service_id: 'control_plane_publications-p1-r2',
              replica_id: 'control_plane_publications-p1-r2',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-b',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-b/partition/control_plane_publications-p1-r2',
            },
            {
              service_id: 'control_plane_publications-p1-r3',
              replica_id: 'control_plane_publications-p1-r3',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-c',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-c/partition/control_plane_publications-p1-r3',
            },
            {
              service_id: 'control_plane_publications-p1-r4',
              replica_id: 'control_plane_publications-p1-r4',
              service_type: 'partition',
              partition_id: 'control_plane_publications-p1',
              node_id: 'node-d',
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
              address: 'node-d/partition/control_plane_publications-p1-r4',
            },
          ],
        },
      });

      const originalEvaluateRemoveSafety =
        coordinator.workflowOwner.evaluateRemoveSafety.bind(
          coordinator.workflowOwner,
        );
      coordinator.workflowOwner.evaluateRemoveSafety =
        async (operation) => {
          if (operation?.type === OperationType.REPLACE &&
              operation?.workflowStep === WORKFLOW_STEP.ACTIVE) {
            return coordinator.workflowOwner
              .buildSafeRemoveSafetyEvaluation();
          }
          return originalEvaluateRemoveSafety(operation);
        };

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'control_plane_publications-p1-r1',
        });

        const initialAttempt = await coordinator.executeOperation(operation);

        t.equal(
          initialAttempt?.status,
          'in_progress',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
        );
        t.equal(
          deliveries.length,
          1,
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
        );

        createResponseStatus =
          ReplicaOperationResponseStatus.ALREADY_EXISTS;

        const visibilityObservationCalls = [];
        coordinator.repository.getOperationByIdVisibilityObservation =
          async (operationId, options = {}) => {
            visibilityObservationCalls.push({
              operationId,
              options: {...options},
            });
            return {
            state: TEST_VISIBILITY_OBSERVATION_STATE_PRESENT,
            operation: {
              ...operation,
            },
            deferredOutcome: {
              completionState: TEST_AUTHORITATIVE_OPERATION_READ_DEFERRED,
              retryAfterMs: 25,
            },
            retryAfterMs: 25,
          };
          };

        await coordinator.workflowOwner
          .resumeDeferredTransitionOperation(operation.operationId);
        const persistedAfterRetry =
          await coordinator.queryOperationById(operation.operationId);

        t.equal(
          deliveries.length,
          3,
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
        );
        t.equal(
          deliveries[2]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
        );
        t.equal(
          persistedAfterRetry?.workflowStep,
          WORKFLOW_STEP.STOPPING,
        );
        t.same(
          visibilityObservationCalls,
          [{
            operationId: operation.operationId,
            options: {
              requireOwnerRpcRead: false,
              allowPriorityRecoveryDeferredVisibility: true,
            },
          }],
          'transition resume should load operation visibility through the repository-owned observation contract',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

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
