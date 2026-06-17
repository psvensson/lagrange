// CL-043 falsifier — a persist-failed surplus-drain REPLACE must not block peer
// drains forever.
//
// The concurrent-partition-operation safety gate in evaluateRemoveSafety
// (operation-workflow-remove-safety-evaluator.js ~283-298) defers a critical
// REMOVE/REPLACE whenever getOperationsByEntity returns ANY non-terminal op on
// the same partition. CL-043: a REPLACE whose replica_operations coordination
// row NEVER PERSISTED (control-plane write timeout) is stuck non-terminal with
// no terminal-timeout anchor — so it stays "active" forever, blocking every
// peer surplus-drain → surplus 5/3 → readiness oscillation → scheduler-leader
// thrash → leadership_unstable (~25% of rolling-restart scenario-PASS failures).
//
// SAFETY CONTRACT this test pins (both directions):
//   - A concurrent op that is STALE past its own step timeout (the phantom) must
//     NOT count as active — the gate must let the peer drain proceed.
//   - A concurrent op that is FRESH (within its step timeout, genuinely
//     in-flight) must STILL block — the fix must not relax genuine concurrency
//     safety.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP, NODE_STATE} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

const CRITICAL_PARTITION_ID = 'replica_operations-p1';
const CONCURRENT_OP_ERROR = /concurrent partition operation/i;
const STALE_AGE_MS = 60 * 60 * 1000; // 1h — exceeds any configured step timeout.

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

// A co-resident REPLACE whose coordination row never persisted: non-terminal,
// CREATING, with createdAt/updatedAt set `ageMs` in the past.
function buildPhantomConcurrentOp(ageMs) {
  const stamp = Date.now() - ageMs;
  return {
    operationId: 'phantom-replace-never-persisted',
    type: OperationType.REPLACE,
    partitionId: CRITICAL_PARTITION_ID,
    entityType: 'partition',
    entityId: CRITICAL_PARTITION_ID,
    replicaId: `${CRITICAL_PARTITION_ID}-r9`,
    status: 'creating',
    workflowStep: WORKFLOW_STEP.CREATING,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function buildCoordinatorWithConcurrentOp(concurrentOp) {
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter: {
      deliver: async () => ({acknowledged: true, status: 'completed'}),
      getConnectionState: () => 'connected',
      pingNode: async () => true,
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
  // The exact seam the gate reads. workflowOwner.repository === coordinator.repository.
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

test('CL-043 — a stale persist-failed concurrent REPLACE must not block a peer remove forever',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    const coordinator = buildCoordinatorWithConcurrentOp(
      buildPhantomConcurrentOp(STALE_AGE_MS),
    );
    try {
      const evaluation = await evaluatePeerRemove(coordinator);
      t.notMatch(
        String(evaluation?.error ?? ''),
        CONCURRENT_OP_ERROR,
        'a concurrent op stale past its step timeout must not be treated as active',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('CL-043 — a FRESH concurrent REPLACE must still block the peer remove (safety preserved)',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    const coordinator = buildCoordinatorWithConcurrentOp(
      buildPhantomConcurrentOp(0),
    );
    try {
      const evaluation = await evaluatePeerRemove(coordinator);
      t.match(
        String(evaluation?.error ?? ''),
        CONCURRENT_OP_ERROR,
        'a genuinely in-flight concurrent op (within its step timeout) must still block',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
