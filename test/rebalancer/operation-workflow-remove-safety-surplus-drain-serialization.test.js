// CL-045 falsifier — over-count surplus-drain serialization relief.
//
// The voter-ready-60s deadlock (s14): a critical control-plane partition stacks
// at 4 raft voters vs target 3. The surplus voter is the un-removed SOURCE of an
// in-flight REPLACE; the learner-promotion guard defers the paired learner
// (would exceed target) → 60s "did not become voter-ready" timeout → the
// timeout's ~1s promotion-retry churn keeps a concurrent op alive on the
// partition → the CL-043 concurrent-partition-operation serialization gate defers
// the REPLACE's own source-removal ("Quorum check failed: concurrent partition
// operation … is active") → the surplus never drains → deadlock. CL-043's
// stale-step relief does NOT rescue it (the retry keeps the step timestamp
// fresh); CL-044's down-target relief does NOT rescue it (the concurrent op
// targets a live node).
//
// SAFETY CONTRACT this test pins (sibling to CL-043/CL-044, resting on the SAME
// invariant: the downstream floor / published-membership / leader-handoff checks
// independently protect quorum, so the concurrent-op gate is a SERIALIZATION
// guard, not the sole quorum protector):
//   - A REPLACE source-removal draining a voter-ready SURPLUS (voter-ready count >
//     minReplicaCount) must NOT be deferred by the concurrent-op serialization —
//     draining one surplus voter cannot violate the floor, and it is exactly what
//     breaks the deadlock. (RED on revert: without CL-045 it defers on the
//     concurrent op.)
//   - AT target (no surplus, voter-ready == min) the SAME REPLACE + concurrent op
//     must STILL serialize-block (the relief must not fire without a surplus).
//   - A plain REMOVE (not a REPLACE source-removal) with a surplus + concurrent op
//     must STILL block (CL-045 is scoped to the REPLACE drain that deadlocks).

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP, NODE_STATE} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

const CRITICAL_PARTITION_ID = 'replica_operations-p1';
const CONCURRENT_OP_ERROR = /concurrent partition operation/i;
const MIN_REPLICA_COUNT = 3;
// A ready node per replica slot (a..e), all contactable.
const NODE_BY_INDEX = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'];

function createReadyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + 60000,
  };
}

function voterRow(index, raftRole) {
  const nodeId = NODE_BY_INDEX[index];
  const replicaId = `${CRITICAL_PARTITION_ID}-r${index + 1}`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: CRITICAL_PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

// A genuinely-active concurrent op: contactable target + recently-in-step, so
// NEITHER CL-043 (stale-step) nor CL-044 (down-target) excludes it. This is the
// promotion-retry op that keeps the partition "busy" in the real deadlock.
function buildActiveConcurrentOp() {
  const now = Date.now();
  return {
    operationId: 'concurrent-promotion-retry',
    type: OperationType.REPLACE,
    partitionId: CRITICAL_PARTITION_ID,
    entityType: 'partition',
    entityId: CRITICAL_PARTITION_ID,
    replicaId: `${CRITICAL_PARTITION_ID}-r9`,
    targetNodeId: 'node-a', // contactable
    status: 'syncing',
    workflowStep: WORKFLOW_STEP.SYNCING,
    createdAt: now,
    updatedAt: now,
    stepsHistory: [{step: WORKFLOW_STEP.SYNCING, timestamp: now - 10 * 1000}],
  };
}

// The REPLACE whose source is a surplus voter, in its remove (ACTIVE) phase.
function buildSurplusDrainReplaceOp(sourceIndex) {
  const now = Date.now();
  const sourceReplicaId = `${CRITICAL_PARTITION_ID}-r${sourceIndex + 1}`;
  return {
    operationId: 'surplus-drain-replace',
    type: OperationType.REPLACE,
    partitionId: CRITICAL_PARTITION_ID,
    entityType: 'partition',
    entityId: CRITICAL_PARTITION_ID,
    sourceReplicaId,
    replicaId: `${CRITICAL_PARTITION_ID}-replacement`,
    status: 'active',
    workflowStep: WORKFLOW_STEP.ACTIVE,
    createdAt: now,
    updatedAt: now,
  };
}

// voterCount voter-ready rows (r1 leader, rest followers) — voterCount > min is a
// genuine over-count surplus; voterCount === min is at-target.
function buildCoordinator(voterCount) {
  const services = [];
  for (let i = 0; i < voterCount; i++) {
    services.push(voterRow(i, i === 0 ? 'leader' : 'follower'));
  }
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter: {
      deliver: async () => ({acknowledged: true, status: 'completed'}),
      getConnectionState: () => 'connected',
      pingNode: async () => true, // every target contactable → no CL-044 relief
      isOutboundQueueAvailable: () => true,
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: MIN_REPLICA_COUNT}),
    },
    cacheData: {
      nodes: NODE_BY_INDEX.slice(0, voterCount).map(createReadyNode),
      services,
    },
  });
  coordinator.initialize();
  coordinator.repository.getOperationsByEntity = async () => [
    buildActiveConcurrentOp(),
  ];
  return coordinator;
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

test('CL-045 — a REPLACE draining a voter-ready SURPLUS (4/3) is NOT blocked by the ' +
  'concurrent-op serialization (red on revert)',
withConfig(async (t) => {
  const coordinator = buildCoordinator(4); // 4 voter-ready > min 3 = surplus
  try {
    // Drain a NON-leader surplus voter (r4).
    const evaluation = await coordinator.workflowOwner.evaluateRemoveSafety(
      buildSurplusDrainReplaceOp(3),
    );
    t.notMatch(
      String(evaluation?.error ?? ''),
      CONCURRENT_OP_ERROR,
      'over-count surplus drain must not be held by the concurrent-op serialization',
    );
  } finally {
    await coordinator.shutdown();
  }
}));

test('CL-045 SAFETY — AT target (3/3, no surplus) the same REPLACE + concurrent op ' +
  'STILL serialize-blocks',
withConfig(async (t) => {
  const coordinator = buildCoordinator(3); // 3 voter-ready == min = no surplus
  try {
    const evaluation = await coordinator.workflowOwner.evaluateRemoveSafety(
      buildSurplusDrainReplaceOp(2),
    );
    t.match(
      String(evaluation?.error ?? ''),
      CONCURRENT_OP_ERROR,
      'without a surplus the concurrent-op serialization must still block (relief is surplus-gated)',
    );
  } finally {
    await coordinator.shutdown();
  }
}));

test('CL-045 SCOPE — a plain REMOVE with a surplus + concurrent op STILL blocks ' +
  '(relief is scoped to the REPLACE source-removal that deadlocks)',
withConfig(async (t) => {
  const coordinator = buildCoordinator(4); // surplus present
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: CRITICAL_PARTITION_ID,
      nodeId: NODE_BY_INDEX[3],
      replicaId: `${CRITICAL_PARTITION_ID}-r4`,
    });
    const evaluation =
        await coordinator.workflowOwner.evaluateRemoveSafety(operation);
    t.match(
      String(evaluation?.error ?? ''),
      CONCURRENT_OP_ERROR,
      'a plain REMOVE is not the deadlocking REPLACE drain → serialization still applies',
    );
  } finally {
    await coordinator.shutdown();
  }
}));
