// CL-044 falsifier — a concurrent op stuck SYNCING/moving to a DOWN target must
// not head-of-line-block peer recovery that targets LIVE nodes, and the
// staleness clock that retires such an op must measure time-in-step (not the
// dispatch-retry-churned updatedAt).
//
// Observed in the rolling-restart gate: recovery op A was SYNCING a replica to a
// node that was down/restarting; its remote handoff never acked, so it churned a
// ~1s dispatch-retry loop. The concurrent-partition-operation safety gate in
// evaluateRemoveSafety then deferred the peer ops that would actually restore the
// partition on live nodes ("Quorum check failed: concurrent partition operation
// ... is active") → restart_recovery_timeout. CL-043's stale-step exclusion did
// NOT rescue it because the retry loop kept updatedAt fresh and the staleness
// clock was anchored on updatedAt.
//
// SAFETY CONTRACT this test pins:
//   - A concurrent op whose move target is UNCONTACTABLE must NOT count as active
//     (down-target serialization relief, isolated from the stale-step clock by
//     keeping the op's timestamps fresh).
//   - A concurrent op whose target is CONTACTABLE must STILL block (the relief
//     must not relax genuine concurrency safety).
//   - The staleness clock reads the current step's step-history timestamp, so an
//     op wedged in-step past its timeout is retired even when updatedAt is fresh.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP, NODE_STATE} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

const CRITICAL_PARTITION_ID = 'replica_operations-p1';
const CONCURRENT_OP_ERROR = /concurrent partition operation/i;
const PAST_ANY_STEP_TIMEOUT_MS = 10 * 60 * 1000; // 10m — exceeds any step timeout.

function createReadyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + 60000,
  };
}

function createCriticalPartitionServiceRow({partitionId, replicaId, nodeId, raftRole}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

// A co-resident SYNCING move toward `targetNodeId`. Timestamps are FRESH (so the
// stale-step clock does NOT exclude it — isolating the down-target relief), with
// an optional in-step step-history timestamp to exercise the staleness clock.
function buildSyncingConcurrentOp({targetNodeId, stepEnteredAgoMs = null}) {
  const now = Date.now();
  const op = {
    operationId: 'syncing-toward-target',
    type: OperationType.REPLACE,
    partitionId: CRITICAL_PARTITION_ID,
    entityType: 'partition',
    entityId: CRITICAL_PARTITION_ID,
    replicaId: `${CRITICAL_PARTITION_ID}-r9`,
    targetNodeId,
    status: 'syncing',
    workflowStep: WORKFLOW_STEP.SYNCING,
    createdAt: now,
    updatedAt: now,
  };
  if (stepEnteredAgoMs !== null) {
    op.stepsHistory = [
      {step: WORKFLOW_STEP.SYNCING, timestamp: now - stepEnteredAgoMs},
    ];
  }
  return op;
}

function buildCoordinatorWithConcurrentOp(concurrentOp, {pingNode}) {
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter: {
      deliver: async () => ({acknowledged: true, status: 'completed'}),
      getConnectionState: (nodeId) =>
        nodeId === 'down-node' ? 'reconnecting' : 'connected',
      pingNode,
      isOutboundQueueAvailable: () => true,
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: 3}),
    },
    cacheData: {
      nodes: [
        createReadyNode('node-a'),
        createReadyNode('node-b'),
        createReadyNode('node-c'),
      ],
      services: [
        createCriticalPartitionServiceRow({
          partitionId: CRITICAL_PARTITION_ID,
          replicaId: `${CRITICAL_PARTITION_ID}-r1`,
          nodeId: 'node-a',
          raftRole: 'leader',
        }),
        createCriticalPartitionServiceRow({
          partitionId: CRITICAL_PARTITION_ID,
          replicaId: `${CRITICAL_PARTITION_ID}-r2`,
          nodeId: 'node-b',
          raftRole: 'follower',
        }),
        createCriticalPartitionServiceRow({
          partitionId: CRITICAL_PARTITION_ID,
          replicaId: `${CRITICAL_PARTITION_ID}-r3`,
          nodeId: 'node-c',
          raftRole: 'follower',
        }),
      ],
    },
  });

  coordinator.initialize();
  coordinator.repository.getOperationsByEntity = async () => [concurrentOp];
  return coordinator;
}

async function evaluatePeerRemove(coordinator) {
  const operation = await coordinator.createOperation({
    type: OperationType.REMOVE,
    partitionId: CRITICAL_PARTITION_ID,
    nodeId: 'node-c',
    replicaId: `${CRITICAL_PARTITION_ID}-r3`,
  });
  return coordinator.workflowOwner.evaluateRemoveSafety(operation);
}

function withConfig(fn) {
  return async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    try {
      await fn(t);
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  };
}

test('CL-044 — a fresh concurrent op SYNCING to a DOWN target must not block a peer remove',
  withConfig(async (t) => {
    const coordinator = buildCoordinatorWithConcurrentOp(
      buildSyncingConcurrentOp({targetNodeId: 'down-node'}),
      {pingNode: async (nodeId) => nodeId !== 'down-node'},
    );
    try {
      const evaluation = await evaluatePeerRemove(coordinator);
      t.notMatch(
        String(evaluation?.error ?? ''),
        CONCURRENT_OP_ERROR,
        'a concurrent op whose move target is uncontactable must not be active',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));

test('CL-044 — a fresh concurrent op SYNCING to a CONTACTABLE target must still block (safety preserved)',
  withConfig(async (t) => {
    const coordinator = buildCoordinatorWithConcurrentOp(
      buildSyncingConcurrentOp({targetNodeId: 'node-b'}),
      {pingNode: async () => true},
    );
    try {
      const evaluation = await evaluatePeerRemove(coordinator);
      t.match(
        String(evaluation?.error ?? ''),
        CONCURRENT_OP_ERROR,
        'a concurrent op to a reachable target must still serialize-block',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));

test('CL-044 — staleness clock reads time-in-step: a wedged op past its step timeout is retired even with a fresh updatedAt',
  withConfig(async (t) => {
    const coordinator = buildCoordinatorWithConcurrentOp(
      buildSyncingConcurrentOp({
        targetNodeId: 'node-b',
        stepEnteredAgoMs: PAST_ANY_STEP_TIMEOUT_MS,
      }),
      {pingNode: async () => true},
    );
    try {
      const evaluation = await evaluatePeerRemove(coordinator);
      t.notMatch(
        String(evaluation?.error ?? ''),
        CONCURRENT_OP_ERROR,
        'an op in-step past its timeout must be stale despite a churned updatedAt',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));

test('CL-044 — staleness clock: an op recently in-step (fresh) still blocks',
  withConfig(async (t) => {
    const coordinator = buildCoordinatorWithConcurrentOp(
      buildSyncingConcurrentOp({
        targetNodeId: 'node-b',
        stepEnteredAgoMs: 10 * 1000,
      }),
      {pingNode: async () => true},
    );
    try {
      const evaluation = await evaluatePeerRemove(coordinator);
      t.match(
        String(evaluation?.error ?? ''),
        CONCURRENT_OP_ERROR,
        'an op recently entered its step is genuinely in-flight and still blocks',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));
