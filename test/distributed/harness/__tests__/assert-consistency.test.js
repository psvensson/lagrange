import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertConsistency,
  assertConsistencyFromSnapshots,
  waitForConsistencyConvergence,
} from '../assertions.js';
import {PORTS} from '../constants.js';

const TEST_WS_ADDRESS = `ws://node-2:${PORTS.WS_TRANSPORT}`;
const TEST_LEADER_ADDRESS = `ws://node-1:${PORTS.WS_TRANSPORT}`;
const TEST_NODE_A_ID = 'node-a';
const TEST_NODE_B_ID = 'node-b';
const TEST_CLUSTER_NODE_1_ID = 'node-1';
const TEST_CLUSTER_NODE_2_ID = 'node-2';
const TEST_PUBLICATION_EPOCH = 14;
const TEST_PARTITION_ID = 'p1';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_RECOVERY_STATE_PRIORITY_SPREAD_PENDING = 'priority_spread_pending';
const TEST_RECOVERY_STATE_STEADY_PUBLISHED = 'steady_published';
const TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
  'priority_partitions_not_spread';
const TEST_BLOCKED_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID =
  'control_plane_publications-p1';
const TEST_PRIORITY_RECOVERY_CLOSURE_SATISFIED_FRESH =
  'closure_satisfied_fresh';
const TEST_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE =
  'leader_identities_disagree';
const TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG =
  'observer_snapshot_revision_lag';
const TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REPAIR_DEFERRED =
  'observer_snapshot_repair_deferred';
const TEST_CONSISTENCY_REASON_MIXED_OBSERVATION_MODE =
  'mixed_observation_mode';
const TEST_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const TEST_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED =
  'partition_leader_authority_diverged';
const TEST_CONSISTENCY_REASON_ACTIVE_NODES_DISAGREE =
  'active_nodes_disagree';
const TEST_FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH =
  'leader_map_mismatch';
const TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG =
  'observer_revision_lag';
const TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REPAIR_DEFERRED =
  'observer_repair_deferred';
const TEST_FINAL_CONSISTENCY_STATE_OBSERVATION_MODE_MISMATCH =
  'observation_mode_mismatch';
const TEST_FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const TEST_FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED =
  'authority_diverged';
const TEST_ROOT_CAUSE_TOPOLOGY = 'topology';
const TEST_ROOT_CAUSE_CACHE = 'cache';
const TEST_OBSERVATION_MODE_LOCAL_CACHE = 'local_cache';
const TEST_OBSERVATION_MODE_FRESH_OWNER = 'fresh_owner';
const TEST_OBSERVATION_MODE_REPAIR_DEFERRED = 'repair_deferred';
const TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE = 'stale_usable';
const TEST_SNAPSHOT_REVISION_A = 31;
const TEST_SNAPSHOT_REVISION_B = 29;
const TEST_TOPOLOGY_EPOCH = 7;
const TEST_SHORT_CONVERGENCE_TIMEOUT_MS = 25;
const TEST_SHORT_CONVERGENCE_POLL_MS = 1;
const TEST_EMPTY_COUNT = 0;
const TEST_BLOCKED_COUNT = 1;

const NODE_ROWS = Object.freeze([
  {node_id: 'node-1'},
  {node_id: 'node-2'},
  {node_id: 'node-3'},
]);
const PARTITION_ROWS = Object.freeze([
  {partition_id: 'p1'},
]);

function buildServiceRows(leaderAddress) {
  return [
    {
      service_type: 'partition',
      status: 'active',
      raft_role: 'leader',
      address: leaderAddress,
      partition_id: 'p1',
      node_id: 'node-1',
    },
    {
      service_type: 'partition',
      status: 'active',
      raft_role: 'follower',
      address: TEST_WS_ADDRESS,
      partition_id: 'p1',
      node_id: 'node-2',
    },
  ];
}

function buildQueryableNode(nodeId, leaderAddress = TEST_LEADER_ADDRESS) {
  return {
    id: nodeId,
    async isReachable() {
      return true;
    },
    async query(sql) {
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {rows: PARTITION_ROWS};
      }
      if (sql.includes('FROM services')) {
        return {rows: buildServiceRows(leaderAddress)};
      }
      return {rows: []};
    },
  };
}

function buildControlSnapshotNode(nodeId, snapshotOverrides = {}) {
  return {
    id: nodeId,
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-1', 'node-2', 'node-3'],
          partitions: ['p1'],
          leaders: {
            p1: TEST_LEADER_ADDRESS,
          },
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            },
          },
          ...snapshotOverrides,
        }],
      };
    },
    async query() {
      throw new Error('raw consistency SQL should not run when control snapshot is available');
    },
  };
}

function buildPublicationReadySnapshot(nodeId, controlPlaneDiagnostics) {
  return {
    nodeId,
    nodes: [TEST_CLUSTER_NODE_1_ID, TEST_CLUSTER_NODE_2_ID],
    publishedNodes: [TEST_CLUSTER_NODE_1_ID, TEST_CLUSTER_NODE_2_ID],
    partitions: [TEST_PARTITION_ID],
    leaders: {[TEST_PARTITION_ID]: TEST_LEADER_ADDRESS},
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    controlPlaneDiagnostics,
  };
}

function buildFreshPriorityDecisionClosureWitness() {
  return {
    state: TEST_PRIORITY_RECOVERY_CLOSURE_SATISFIED_FRESH,
    prioritySpreadPending: false,
    publicationRefreshRequired: false,
    blockedPartitionIds: [],
    blockedPartitionCount: TEST_EMPTY_COUNT,
    unresolvedSemanticStateIds: [],
    satisfiedPartitionIds: [TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID],
    decisionPartitionIds: [TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID],
    refreshedPriorityPartitionSummary: {
      satisfied: true,
      blockedPartitionCount: TEST_EMPTY_COUNT,
      largestSpreadGap: TEST_EMPTY_COUNT,
      totalSpreadGap: TEST_EMPTY_COUNT,
    },
    summarySpreadPending: false,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
  };
}

test('assertConsistency ignores nodes that fail query collection', async () => {
  const healthyA = buildQueryableNode('node-a');
  const healthyB = buildQueryableNode('node-b');
  const flapping = {
    id: 'node-c',
    async isReachable() {
      return true;
    },
    async query() {
      throw new Error('Admin API query timed out');
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([healthyA, healthyB, flapping]);
  });
});

test('assertConsistency fails when fewer than two nodes are queryable', async () => {
  const healthy = buildQueryableNode('node-a');
  const flapping = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async query() {
      throw new Error('Admin API query timed out');
    },
  };
  const unreachable = {
    id: 'node-c',
    async isReachable() {
      return false;
    },
    async query() {
      return {rows: []};
    },
  };

  await assert.rejects(
    assertConsistency([healthy, flapping, unreachable]),
    /fewer than 2 queryable nodes/i,
  );
});

test('assertConsistency still fails on real state disagreement', async () => {
  const nodeA = buildQueryableNode('node-a', `ws://node-1:${PORTS.WS_TRANSPORT}`);
  const nodeB = buildQueryableNode('node-b', `ws://node-9:${PORTS.WS_TRANSPORT}`);

  await assert.rejects(
    assertConsistency([nodeA, nodeB]),
    /Leader identities disagree/i,
  );
});

test('assertConsistency attaches control-plane diagnostics on mismatch errors',
  async () => {
    const nodeA = buildControlSnapshotNode('node-a', {
      nodes: ['node-1', 'node-2'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          sourceSnapshotVersion: TEST_SNAPSHOT_REVISION_A,
          status: 'ACK_PENDING',
        },
      },
    });
    const nodeB = buildControlSnapshotNode('node-b', {
      nodes: ['node-1', 'node-3'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          sourceSnapshotVersion: TEST_SNAPSHOT_REVISION_B,
          status: 'ACK_PENDING',
        },
      },
    });

    try {
      await assertConsistency([nodeA, nodeB]);
      assert.fail('expected mismatch');
    } catch (error) {
      assert.match(String(error?.message || ''), /Active nodes disagree/i);
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.publicationConvergence
          ?.publicationEpoch,
        14,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.publicationConvergence
          ?.sourceSnapshotVersion,
        TEST_SNAPSHOT_REVISION_A,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.mismatch?.reasonCode,
        'active_nodes_disagree',
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-a']?.publicationEpoch,
        14,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-a']?.sourceSnapshotVersion,
        TEST_SNAPSHOT_REVISION_A,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-b']?.publicationEpoch,
        14,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics
          ?.publicationConvergenceByNodeId?.['node-b']?.sourceSnapshotVersion,
        TEST_SNAPSHOT_REVISION_B,
      );
      assert.equal(
        error?.diagnostics?.failure?.rootCauseClass,
        TEST_ROOT_CAUSE_TOPOLOGY,
      );
      assert.equal(
        error?.diagnostics?.failure?.dominantReason,
        TEST_CONSISTENCY_REASON_ACTIVE_NODES_DISAGREE,
      );
    }
  });

test('assertConsistency attaches final leader-map mismatch diagnostics',
  async () => {
    const referenceNode = buildControlSnapshotNode('node-a', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_LEADER_ADDRESS,
      },
      observationMode: TEST_OBSERVATION_MODE_FRESH_OWNER,
    });
    const otherNode = buildControlSnapshotNode('node-b', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_WS_ADDRESS,
      },
      observationMode: TEST_OBSERVATION_MODE_LOCAL_CACHE,
    });

    try {
      await assertConsistency([referenceNode, otherNode]);
      assert.fail('expected leader mismatch');
    } catch (error) {
      assert.match(String(error?.message || ''), /Leader identities disagree/i);
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency?.state,
        TEST_FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH,
      );
      assert.deepEqual(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.differingPartitionIds,
        [TEST_PARTITION_ID],
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
      );
      assert.equal(
        error?.diagnostics?.failure?.dominantReason,
        TEST_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
      );
      assert.deepEqual(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.observationModesByNodeId,
        {
          'node-a': TEST_OBSERVATION_MODE_FRESH_OWNER,
          'node-b': TEST_OBSERVATION_MODE_LOCAL_CACHE,
        },
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.leaderEvidenceByPartitionId?.[TEST_PARTITION_ID]?.['node-b']
          ?.observationMode,
        TEST_OBSERVATION_MODE_LOCAL_CACHE,
      );
    }
  });

test('assertConsistency classifies stale revision leader mismatch as observer lag',
  async () => {
    const referenceNode = buildControlSnapshotNode('node-a', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_LEADER_ADDRESS,
      },
      snapshotRevision: TEST_SNAPSHOT_REVISION_A,
      snapshotExpectedMinimumRevision: TEST_SNAPSHOT_REVISION_A,
      snapshotRevisionGap: TEST_EMPTY_COUNT,
    });
    const laggingNode = buildControlSnapshotNode('node-b', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_WS_ADDRESS,
      },
      snapshotRevision: TEST_SNAPSHOT_REVISION_B,
      snapshotExpectedMinimumRevision: TEST_SNAPSHOT_REVISION_A,
      snapshotRevisionGap: TEST_BLOCKED_COUNT,
    });

    try {
      await assertConsistency([referenceNode, laggingNode]);
      assert.fail('expected observer revision lag');
    } catch (error) {
      assert.match(
        String(error?.message || ''),
        /Observer snapshot revisions lag/i,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency?.state,
        TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.observedMismatchReasonCode,
        TEST_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
      );
      assert.deepEqual(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.revisionBarrier?.laggingNodeIds,
        ['node-b'],
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.leaderEvidenceByPartitionId?.[TEST_PARTITION_ID]?.['node-a']
          ?.leaderNodeId,
        TEST_LEADER_ADDRESS,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.leaderEvidenceByPartitionId?.[TEST_PARTITION_ID]?.['node-b']
          ?.snapshotRevisionGap,
        TEST_BLOCKED_COUNT,
      );
      assert.equal(
        error?.diagnostics?.failure?.rootCauseClass,
        TEST_ROOT_CAUSE_CACHE,
      );
    }
  });

test('assertConsistency does not treat peer capture timestamp skew as revision lag',
  async () => {
    const referenceNode = buildControlSnapshotNode('node-a', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_LEADER_ADDRESS,
      },
      snapshotRevision: TEST_SNAPSHOT_REVISION_A,
      snapshotExpectedMinimumRevision: TEST_SNAPSHOT_REVISION_B,
      snapshotRevisionGap: TEST_EMPTY_COUNT,
    });
    const peerSkewNode = buildControlSnapshotNode('node-b', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_WS_ADDRESS,
      },
      snapshotRevision: TEST_SNAPSHOT_REVISION_B,
      snapshotExpectedMinimumRevision: TEST_SNAPSHOT_REVISION_B,
      snapshotRevisionGap: TEST_EMPTY_COUNT,
    });

    try {
      await assertConsistency([referenceNode, peerSkewNode]);
      assert.fail('expected leader mismatch');
    } catch (error) {
      assert.match(String(error?.message || ''), /Leader identities disagree/i);
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
      );
      assert.notEqual(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG,
      );
    }
  });

test('assertConsistency discounts repair-deferred stale snapshots for final leader comparison',
  async () => {
    const referenceNode = buildControlSnapshotNode('node-a', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_LEADER_ADDRESS,
      },
      observationMode: TEST_OBSERVATION_MODE_FRESH_OWNER,
      snapshotRevisionState: TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE,
      snapshotRevisionGap: TEST_EMPTY_COUNT,
    });
    const repairDeferredNode = buildControlSnapshotNode('node-b', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_WS_ADDRESS,
      },
      observationMode: TEST_OBSERVATION_MODE_REPAIR_DEFERRED,
      snapshotRevisionState: TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE,
      snapshotRevisionGap: TEST_EMPTY_COUNT,
    });

    await assert.doesNotReject(
      assertConsistency([referenceNode, repairDeferredNode]),
    );
  });

test('assertConsistency reports repair deferred when all final leader evidence is stale',
  async () => {
    const firstDeferredNode = buildControlSnapshotNode('node-a', {
      observationMode: TEST_OBSERVATION_MODE_REPAIR_DEFERRED,
      snapshotRevisionState: TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE,
      snapshotRevisionGap: TEST_EMPTY_COUNT,
    });
    const secondDeferredNode = buildControlSnapshotNode('node-b', {
      observationMode: TEST_OBSERVATION_MODE_REPAIR_DEFERRED,
      snapshotRevisionState: TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE,
      snapshotRevisionGap: TEST_EMPTY_COUNT,
    });

    try {
      await assertConsistency([firstDeferredNode, secondDeferredNode]);
      assert.fail('expected repair deferred mismatch');
    } catch (error) {
      assert.match(
        String(error?.message || ''),
        /repair is deferred/i,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REPAIR_DEFERRED,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency?.state,
        TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REPAIR_DEFERRED,
      );
    }
  });

test('assertConsistency uses authority certificates to classify observer visibility lag',
  async () => {
    const authorityCertificate = {
      schemaVersion: 1,
      partitionId: TEST_PARTITION_ID,
      leaderNodeId: TEST_LEADER_ADDRESS,
      leaderSource: 'partitions',
      topologyEpoch: TEST_TOPOLOGY_EPOCH,
      membershipEpoch: TEST_PUBLICATION_EPOCH,
      snapshotRevision: TEST_SNAPSHOT_REVISION_A,
      replicaRoleConsistent: true,
      replicaLeaderNodeIds: [TEST_LEADER_ADDRESS],
    };
    const referenceNode = buildControlSnapshotNode('node-a', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_LEADER_ADDRESS,
      },
      partitionLeaderAuthority: {
        [TEST_PARTITION_ID]: authorityCertificate,
      },
    });
    const staleObserverNode = buildControlSnapshotNode('node-b', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_WS_ADDRESS,
      },
      partitionLeaderAuthority: {
        [TEST_PARTITION_ID]: authorityCertificate,
      },
    });

    try {
      await assertConsistency([referenceNode, staleObserverNode]);
      assert.fail('expected observer authority visibility lag');
    } catch (error) {
      assert.match(
        String(error?.message || ''),
        /observer_authority_visibility_lag/i,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency?.state,
        TEST_FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.authorityEvidenceByPartitionId?.[TEST_PARTITION_ID]?.['node-a']
          ?.leaderNodeId,
        TEST_LEADER_ADDRESS,
      );
      assert.equal(
        error?.diagnostics?.failure?.rootCauseClass,
        TEST_ROOT_CAUSE_CACHE,
      );
    }
  });

test('assertConsistency uses authority certificates to classify authority divergence',
  async () => {
    const buildAuthorityCertificate = (leaderNodeId) => ({
      schemaVersion: 1,
      partitionId: TEST_PARTITION_ID,
      leaderNodeId,
      leaderSource: 'partitions',
      topologyEpoch: TEST_TOPOLOGY_EPOCH,
      membershipEpoch: TEST_PUBLICATION_EPOCH,
      snapshotRevision: TEST_SNAPSHOT_REVISION_A,
      replicaRoleConsistent: true,
      replicaLeaderNodeIds: [leaderNodeId],
    });
    const referenceNode = buildControlSnapshotNode('node-a', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_LEADER_ADDRESS,
      },
      partitionLeaderAuthority: {
        [TEST_PARTITION_ID]: buildAuthorityCertificate(TEST_LEADER_ADDRESS),
      },
    });
    const divergedNode = buildControlSnapshotNode('node-b', {
      leaders: {
        [TEST_PARTITION_ID]: TEST_WS_ADDRESS,
      },
      partitionLeaderAuthority: {
        [TEST_PARTITION_ID]: buildAuthorityCertificate(TEST_WS_ADDRESS),
      },
    });

    try {
      await assertConsistency([referenceNode, divergedNode]);
      assert.fail('expected authority divergence');
    } catch (error) {
      assert.match(
        String(error?.message || ''),
        /partition_leader_authority_diverged/i,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency?.state,
        TEST_FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED,
      );
      assert.equal(
        error?.diagnostics?.failure?.rootCauseClass,
        TEST_ROOT_CAUSE_TOPOLOGY,
      );
    }
  });

test('waitForConsistencyConvergence escalates to authoritative snapshot repair',
  async () => {
    const controlSnapshotCalls = [];
    const buildRepairableNode = (nodeId, staleLeader, repairedLeader) => ({
      id: nodeId,
      async isReachable() {
        return true;
      },
      async getControlSnapshot(options = {}) {
        controlSnapshotCalls.push({
          nodeId,
          forceAuthoritativeRepair: options.forceAuthoritativeRepair === true,
        });
        let leaderAddress = staleLeader;
        if (options.forceAuthoritativeRepair === true) {
          leaderAddress = repairedLeader;
        }
        return {
          rows: [{
            nodes: [TEST_CLUSTER_NODE_1_ID, TEST_CLUSTER_NODE_2_ID],
            partitions: [TEST_PARTITION_ID],
            leaders: {
              [TEST_PARTITION_ID]: leaderAddress,
            },
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: TEST_PUBLICATION_EPOCH,
                publishedActiveNodeIds: [
                  TEST_CLUSTER_NODE_1_ID,
                  TEST_CLUSTER_NODE_2_ID,
                ],
              },
            },
          }],
        };
      },
    });

    await waitForConsistencyConvergence([
      buildRepairableNode(
        TEST_CLUSTER_NODE_1_ID,
        TEST_LEADER_ADDRESS,
        TEST_LEADER_ADDRESS,
      ),
      buildRepairableNode(
        TEST_CLUSTER_NODE_2_ID,
        TEST_WS_ADDRESS,
        TEST_LEADER_ADDRESS,
      ),
    ], {
      timeoutMs: TEST_SHORT_CONVERGENCE_TIMEOUT_MS,
      pollIntervalMs: TEST_SHORT_CONVERGENCE_POLL_MS,
      forceRepairAfterMs: TEST_EMPTY_COUNT,
    });

    assert.equal(
      controlSnapshotCalls.some((call) => call.forceAuthoritativeRepair),
      true,
    );
  });

test('assertConsistency uses control snapshots when available', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
});

test('assertConsistency prefers published membership over effective node disagreement', async () => {
  const publishedNodes = ['node-1', 'node-2', 'node-3'];
  const nodeA = buildControlSnapshotNode('node-a', {
    nodes: ['node-1'],
    publishedNodes,
    projectedNodes: ['node-1'],
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: publishedNodes,
      },
      activeNodeViews: {
        effectiveSource: 'published_membership',
        effectiveNodeIds: publishedNodes,
        projectedNodeIds: ['node-1'],
        publishedNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });
  const nodeB = buildControlSnapshotNode('node-b', {
    nodes: ['node-1', 'node-2', 'node-3'],
    publishedNodes,
    projectedNodes: ['node-1', 'node-2', 'node-3'],
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: publishedNodes,
      },
      activeNodeViews: {
        effectiveSource: 'published_membership',
        effectiveNodeIds: publishedNodes,
        projectedNodeIds: ['node-1', 'node-2', 'node-3'],
        publishedNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
});

test('assertConsistency does not repair missing published membership inline', async () => {
  const publishedNodes = ['node-1', 'node-2'];
  const nodeACalls = [];
  const nodeA = {
    id: 'node-a',
    async isReachable() {
      return true;
    },
    async getControlSnapshot(options = {}) {
      nodeACalls.push(options);
      if (options.forceRepair === true) {
        return {
          rows: [{
            nodes: ['node-1', 'node-2'],
            publishedNodes,
            partitions: ['p1'],
            leaders: {p1: TEST_LEADER_ADDRESS},
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 14,
                publishedActiveNodeIds: publishedNodes,
              },
              activeNodeViews: {
                effectiveSource: 'published_membership',
                effectiveNodeIds: publishedNodes,
                projectedNodeIds: ['node-1', 'node-2'],
                publishedNodeIds: publishedNodes,
                publishedMembershipAvailable: true,
              },
            },
          }],
        };
      }
      return {
        rows: [{
          nodes: ['node-1', 'node-2'],
          partitions: ['p1'],
          leaders: {p1: TEST_LEADER_ADDRESS},
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: publishedNodes,
            },
            activeNodeViews: {
              effectiveSource: 'projected',
              effectiveNodeIds: ['node-1', 'node-2'],
              projectedNodeIds: ['node-1', 'node-2'],
              publishedNodeIds: [],
              publishedMembershipAvailable: false,
            },
          },
        }],
      };
    },
    async query() {
      throw new Error('raw consistency SQL should not run when control snapshot is available');
    },
  };
  const nodeB = buildControlSnapshotNode('node-b', {
    nodes: ['node-1', 'node-2'],
    publishedNodes,
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: publishedNodes,
      },
      activeNodeViews: {
        effectiveSource: 'published_membership',
        effectiveNodeIds: publishedNodes,
        projectedNodeIds: ['node-1', 'node-2'],
        publishedNodeIds: publishedNodes,
        publishedMembershipAvailable: true,
      },
    },
  });

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB]);
  });
  assert.equal(nodeACalls.length, 1);
  assert.equal(nodeACalls[0]?.forceRepair, false);
});

test('assertConsistency does not reopen raw SQL when a control snapshot fails', async () => {
  const splitPartitions = ['logs-p2', 'logs-p3'];
  const leaderMap = {
    'logs-p2': TEST_LEADER_ADDRESS,
    'logs-p3': TEST_WS_ADDRESS,
  };
  const nodeA = buildControlSnapshotNode('node-a', {
    partitions: splitPartitions,
    leaders: leaderMap,
  });
  const nodeB = buildControlSnapshotNode('node-b', {
    partitions: splitPartitions,
    leaders: leaderMap,
  });
  let fallbackQueryCount = 0;
  const fallbackNode = {
    id: 'node-c',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      throw new Error('Admin API query timed out');
    },
    async query(sql) {
      fallbackQueryCount += 1;
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {
          rows: [
            {partition_id: 'logs-p1'},
            {partition_id: 'logs-p2'},
            {partition_id: 'logs-p3'},
          ],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p1',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p2',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_WS_ADDRESS,
              partition_id: 'logs-p3',
              node_id: 'node-2',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB, fallbackNode]);
  });
  assert.equal(fallbackQueryCount, TEST_EMPTY_COUNT);
});

test('assertConsistency fails rather than reopening SQL after one snapshot owner failure', async () => {
  const splitPartitions = ['logs-p2', 'logs-p3'];
  const leaderMap = {
    'logs-p2': TEST_LEADER_ADDRESS,
    'logs-p3': TEST_WS_ADDRESS,
  };
  const nodeA = buildControlSnapshotNode('node-a', {
    partitions: splitPartitions,
    leaders: leaderMap,
  });
  let fallbackQueryCount = 0;
  const fallbackNode = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      throw new Error('Admin API query timed out');
    },
    async query(sql) {
      fallbackQueryCount += 1;
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {
          rows: [
            {partition_id: 'logs-p1'},
            {partition_id: 'logs-p2'},
            {partition_id: 'logs-p3'},
          ],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p1',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_LEADER_ADDRESS,
              partition_id: 'logs-p2',
              node_id: 'node-1',
            },
            {
              service_type: 'partition',
              status: 'active',
              raft_role: 'leader',
              address: TEST_WS_ADDRESS,
              partition_id: 'logs-p3',
              node_id: 'node-2',
            },
          ],
        };
      }
      return {rows: []};
    },
  };

  try {
    await assertConsistency([nodeA, fallbackNode]);
    assert.fail('expected owner observation failure');
  } catch (error) {
    assert.match(
      String(error?.message || ''),
      /fewer than 2 queryable nodes/i,
    );
  }
  assert.equal(fallbackQueryCount, TEST_EMPTY_COUNT);
});

test('assertConsistency rejects one control snapshot mixed with SQL compatibility mode',
  async () => {
    const nodeA = buildControlSnapshotNode('node-a');
    const sqlNode = buildQueryableNode('node-b');

    try {
      await assertConsistency([nodeA, sqlNode]);
      assert.fail('expected mixed observation mode failure');
    } catch (error) {
      assert.match(
        String(error?.message || ''),
        /mixed observation modes/i,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency
          ?.reasonCode,
        TEST_CONSISTENCY_REASON_MIXED_OBSERVATION_MODE,
      );
      assert.equal(
        error?.diagnostics?.controlPlaneDiagnostics?.finalConsistency?.state,
        TEST_FINAL_CONSISTENCY_STATE_OBSERVATION_MODE_MISMATCH,
      );
    }
  });

test('assertConsistency allows pure SQL compatibility mode without control snapshots',
  async () => {
    const nodeA = buildQueryableNode('node-a');
    const nodeB = buildQueryableNode('node-b');

    await assert.doesNotReject(
      assertConsistency([nodeA, nodeB]),
    );
  });

test('assertConsistency supplements SQL compatibility partitions from service-visible topology',
  async () => {
    let fallbackQueryCount = 0;
    const nodeA = buildQueryableNode('node-a');
    const fallbackNode = {
      id: 'node-b',
      async isReachable() {
        return true;
      },
      async query(sql) {
        fallbackQueryCount += 1;
        if (sql.includes('FROM nodes')) {
          return {rows: NODE_ROWS};
        }
        if (sql.includes('FROM partitions')) {
          return {rows: []};
        }
        if (sql.includes('FROM services')) {
          return {
            rows: [
              {
                service_type: 'partition',
                status: 'active',
                raft_role: 'leader',
                address: TEST_LEADER_ADDRESS,
                partition_id: 'p1',
                node_id: 'node-1',
              },
              {
                service_type: 'partition',
                status: 'active',
                raft_role: 'follower',
                address: TEST_WS_ADDRESS,
                partition_id: 'p1',
                node_id: 'node-2',
              },
            ],
          };
        }
        return {rows: []};
      },
    };

    await assert.doesNotReject(async () => {
      await assertConsistency([nodeA, fallbackNode]);
    });
    assert.ok(
      fallbackQueryCount > TEST_EMPTY_COUNT,
      'expected compatibility SQL node to exercise raw SQL path',
    );
  });

test('assertConsistency ignores bootstrap-only control-snapshot nodes', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');
  let fallbackQueryCalled = false;
  const restartingNode = {
    id: 'node-c',
    async getReachabilityDiagnostics() {
      return {
        nodeId: 'node-c',
        reachable: true,
        adminReady: false,
        reachableBy: 'bootstrap_health',
        lastError: 'connect ECONNREFUSED 172.20.0.3:8081',
      };
    },
    async getControlSnapshot() {
      throw new Error('Admin API query failed: connect ECONNREFUSED');
    },
    async query() {
      fallbackQueryCalled = true;
      return {rows: []};
    },
  };

  await assert.doesNotReject(async () => {
    await assertConsistency([nodeA, nodeB, restartingNode]);
  });
  assert.equal(fallbackQueryCalled, false);
});

test('assertConsistency fails on published control-plane epoch disagreement', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b', {
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 13,
        publishedActiveNodeIds: ['node-1', 'node-3'],
      },
    },
  });

  await assert.rejects(
    assertConsistency([nodeA, nodeB]),
    /Publication epochs disagree/i,
  );
});

test('assertConsistencyFromSnapshots throws on published active-node mismatch', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-3'],
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Published active-node sets disagree/i,
  );
});

test('assertConsistencyFromSnapshots prefers published membership over effective node disagreement', async () => {
  const publishedNodes = ['node-1', 'node-2'];
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1'],
      publishedNodes,
      projectedNodes: ['node-1'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: publishedNodes,
        },
        activeNodeViews: {
          effectiveSource: 'published_membership',
          effectiveNodeIds: publishedNodes,
          projectedNodeIds: ['node-1'],
          publishedNodeIds: publishedNodes,
          publishedMembershipAvailable: true,
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes,
      projectedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: publishedNodes,
        },
        activeNodeViews: {
          effectiveSource: 'published_membership',
          effectiveNodeIds: publishedNodes,
          projectedNodeIds: ['node-1', 'node-2'],
          publishedNodeIds: publishedNodes,
          publishedMembershipAvailable: true,
        },
      },
    },
  ];

  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots(snapshots);
  });
});

test('assertConsistencyFromSnapshots passes with ' +
  'consistent evaluator snapshots', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2', 'node-3'],
      partitions: ['p1', 'p2'],
      leaders: {p1: TEST_LEADER_ADDRESS, p2: TEST_WS_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2', 'node-3'],
      partitions: ['p2', 'p1'],
      leaders: {p2: TEST_WS_ADDRESS, p1: TEST_LEADER_ADDRESS},
    },
  ];

  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots(snapshots);
  });
});

test('assertConsistencyFromSnapshots throws on partition ' +
  'set mismatch — uses evaluator snapshots as single ' +
  'consistency owner', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1', 'p2'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Partition assignments disagree/i,
  );
});

test('assertConsistencyFromSnapshots throws on leader ' +
  'identity mismatch', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_WS_ADDRESS},
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Leader identities disagree/i,
  );
});

test('assertConsistencyFromSnapshots is a no-op when ' +
  'fewer than 2 snapshots provided', async () => {
  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots([
      {
        nodeId: 'node-a',
        nodes: ['node-1'],
        partitions: ['p1'],
        leaders: {p1: TEST_LEADER_ADDRESS},
      },
    ]);
  });
  assert.doesNotThrow(() => {
    assertConsistencyFromSnapshots([]);
  });
});

test('waitForConsistencyConvergence resolves when nodes ' +
  'agree on first attempt', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b');

  await assert.doesNotReject(async () => {
    await waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 2000, pollIntervalMs: 50},
    );
  });
});

test('waitForConsistencyConvergence retries until nodes ' +
  'converge within timeout', async () => {
  let callCount = 0;
  const convergenceThreshold = 3;
  const divergentLeader = TEST_WS_ADDRESS;

  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      callCount += 1;
      const leader = callCount >= convergenceThreshold ?
        TEST_LEADER_ADDRESS :
        divergentLeader;
      return {
        rows: [{
          nodes: ['node-1', 'node-2', 'node-3'],
          partitions: ['p1'],
          leaders: {p1: leader},
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            },
          },
        }],
      };
    },
    async query() {
      throw new Error('should not be called');
    },
  };

  await assert.doesNotReject(async () => {
    await waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 5000, pollIntervalMs: 50},
    );
  });
  assert.ok(
    callCount >= convergenceThreshold,
    'Expected at least ' + convergenceThreshold +
    ' probes, got ' + callCount,
  );
});

test('waitForConsistencyConvergence throws last error ' +
  'when timeout expires', async () => {
  const nodeA = buildControlSnapshotNode('node-a');
  const nodeB = buildControlSnapshotNode('node-b', {
    leaders: {p1: TEST_WS_ADDRESS},
  });

  await assert.rejects(
    waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 500, pollIntervalMs: 50},
    ),
    /Leader identities disagree/i,
  );
});

test('waitForConsistencyConvergence tolerates transient empty leader maps',
  async () => {
    const nodeA = buildControlSnapshotNode('node-a', {
      leaders: {p1: TEST_LEADER_ADDRESS},
    });
    const nodeB = buildControlSnapshotNode('node-b', {
      leaders: {},
    });

    await assert.doesNotReject(async () => {
      await waitForConsistencyConvergence(
        [nodeA, nodeB],
        {timeoutMs: 500, pollIntervalMs: 50},
      );
    });
  });

test('assertConsistency defers strict leader comparison until the ' +
  'publication recovery gate is ready', async () => {
  const snapshotPayloadA = {
    nodes: ['node-1', 'node-2', 'node-3'],
    publishedNodes: ['node-1', 'node-2', 'node-3'],
    partitions: ['p1'],
    leaders: {p1: TEST_LEADER_ADDRESS},
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
      },
      publicationConvergenceGate: {
        ready: false,
        state: 'publication_pending',
        publicationEpoch: 15,
        publicationStatus: 'OPEN',
        reasonCodes: ['publication_epoch_pending'],
      },
    },
  };
  const snapshotPayloadB = {
    ...snapshotPayloadA,
    leaders: {p1: TEST_WS_ADDRESS},
  };

  const nodeA = {
    id: 'node-a',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      return {rows: [snapshotPayloadA]};
    },
    async query() {
      throw new Error('should not be called');
    },
  };
  const nodeB = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      return {rows: [snapshotPayloadB]};
    },
    async query() {
      throw new Error('should not be called');
    },
  };

  await assert.rejects(
    assertConsistency([nodeA, nodeB]),
    /Publication-scoped consistency not ready/i,
  );
});

test('assertConsistencyFromSnapshots defers strict leader comparison until the ' +
  'publication recovery gate is ready', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
        publicationConvergenceGate: {
          ready: false,
          state: 'priority_spread_pending',
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          reasonCodes: ['priority_partitions_not_spread'],
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_WS_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
        publicationConvergenceGate: {
          ready: false,
          state: 'priority_spread_pending',
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          reasonCodes: ['priority_partitions_not_spread'],
        },
      },
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Publication-scoped consistency not ready/i,
  );
});

test('assertConsistencyFromSnapshots rebuilds a same-epoch stale publication ' +
  'gate from canonical convergence evidence', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          recoveryProtocolState: 'steady_published',
          publishedActiveNodeIds: ['node-1', 'node-2'],
          pendingAckNodeIds: [],
          priorityRecoveryReasonCodes: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            largestSpreadGap: 0,
            totalSpreadGap: 0,
          },
        },
        publicationConvergenceGate: {
          ready: false,
          state: 'priority_spread_pending',
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          reasonCodes: ['priority_partitions_not_spread'],
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          recoveryProtocolState: 'steady_published',
          publishedActiveNodeIds: ['node-1', 'node-2'],
          pendingAckNodeIds: [],
          priorityRecoveryReasonCodes: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            largestSpreadGap: 0,
            totalSpreadGap: 0,
          },
        },
        publicationConvergenceGate: {
          ready: false,
          state: 'priority_spread_pending',
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          reasonCodes: ['priority_partitions_not_spread'],
        },
      },
    },
  ];

  assert.doesNotThrow(() => assertConsistencyFromSnapshots(snapshots));
});

test('assertConsistencyFromSnapshots prefers canonical priority-recovery ' +
  'observation over a conflicting stale publication gate', async () => {
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          recoveryProtocolState: 'priority_spread_pending',
          publishedActiveNodeIds: ['node-1', 'node-2'],
          pendingAckNodeIds: [],
          priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            largestSpreadGap: 1,
            totalSpreadGap: 1,
          },
        },
        publicationConvergenceGate: {
          ready: false,
          state: 'priority_spread_pending',
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          reasonCodes: ['priority_partitions_not_spread'],
        },
        priorityRecoveryObservation: {
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          recoveryProtocolState: 'steady_published',
          prioritySpreadPending: false,
          pendingAckNodeIds: [],
          priorityRecoveryReasonCodes: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            largestSpreadGap: 0,
            totalSpreadGap: 0,
          },
          closureRecordId: 'CL-003',
          closureWitnessClass:
            'publication_converged_priority_spread_pending',
          priorityRecoveryClosureState: 'closure_satisfied_stale_publication',
        },
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          recoveryProtocolState: 'priority_spread_pending',
          publishedActiveNodeIds: ['node-1', 'node-2'],
          pendingAckNodeIds: [],
          priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            largestSpreadGap: 1,
            totalSpreadGap: 1,
          },
        },
        publicationConvergenceGate: {
          ready: false,
          state: 'priority_spread_pending',
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          reasonCodes: ['priority_partitions_not_spread'],
        },
        priorityRecoveryObservation: {
          publicationEpoch: 14,
          publicationStatus: 'PUBLISHED',
          recoveryProtocolState: 'steady_published',
          prioritySpreadPending: false,
          pendingAckNodeIds: [],
          priorityRecoveryReasonCodes: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            largestSpreadGap: 0,
            totalSpreadGap: 0,
          },
          closureRecordId: 'CL-003',
          closureWitnessClass:
            'publication_converged_priority_spread_pending',
          priorityRecoveryClosureState: 'closure_satisfied_stale_publication',
        },
      },
    },
  ];

  assert.doesNotThrow(() => assertConsistencyFromSnapshots(snapshots));
});

test('assertConsistencyFromSnapshots consumes fresh priority decision closure ' +
  'over stale publication gates', async () => {
  const stalePublicationConvergence = {
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    recoveryProtocolState: TEST_RECOVERY_STATE_PRIORITY_SPREAD_PENDING,
    publishedActiveNodeIds: [TEST_CLUSTER_NODE_1_ID, TEST_CLUSTER_NODE_2_ID],
    pendingAckNodeIds: [],
    priorityRecoveryReasonCodes: [
      TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    ],
    priorityPartitionSummary: {
      satisfied: false,
      blockedPartitionCount: TEST_BLOCKED_COUNT,
      largestSpreadGap: TEST_BLOCKED_COUNT,
      totalSpreadGap: TEST_BLOCKED_COUNT,
    },
  };
  const stalePublicationGate = {
    ready: false,
    state: TEST_RECOVERY_STATE_PRIORITY_SPREAD_PENDING,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    reasonCodes: [
      TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    ],
  };
  const priorityRecoveryDecisionSnapshots = {
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    priorityPartitionSummary: {
      satisfied: true,
      blockedPartitionCount: TEST_EMPTY_COUNT,
      largestSpreadGap: TEST_EMPTY_COUNT,
      totalSpreadGap: TEST_EMPTY_COUNT,
    },
    closureWitness: buildFreshPriorityDecisionClosureWitness(),
  };
  const snapshots = [
    buildPublicationReadySnapshot(TEST_NODE_A_ID, {
      publicationConvergence: stalePublicationConvergence,
      publicationConvergenceGate: stalePublicationGate,
      priorityRecoveryDecisionSnapshots,
    }),
    buildPublicationReadySnapshot(TEST_NODE_B_ID, {
      publicationConvergence: stalePublicationConvergence,
      publicationConvergenceGate: stalePublicationGate,
      priorityRecoveryDecisionSnapshots,
    }),
  ];

  assert.doesNotThrow(() => assertConsistencyFromSnapshots(snapshots));
});

test('assertConsistencyFromSnapshots lets a ready publication gate override ' +
  'stale observation reasons with no concrete priority blockers', async () => {
  const staleObservation = {
    publicationEpoch: 14,
    publicationStatus: 'PUBLISHED',
    recoveryProtocolState: 'steady_published',
    prioritySpreadPending: true,
    pendingAckNodeIds: [],
    priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
    priorityPartitionSummary: {
      satisfied: true,
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
    },
    priorityRecoveryBlockedPartitionCount: 0,
    priorityRecoveryUnresolvedPartitionCount: 0,
    priorityRecoveryCurrentSummary: {
      blockedPartitionCount: 0,
      unresolvedClassCount: 0,
      unresolvedSemanticStateCount: 0,
      blockedPartitionIds: [],
      blockerPartitionIdsByReason: {
        eligible_but_no_operation_created: [],
        operation_created_but_no_step_transitions: [],
        learner_active_but_never_promotable: [],
        publication_recovery_eligible_but_coordinator_excludes_node: [],
      },
    },
  };
  const readyGate = {
    ready: true,
    state: 'ready',
    publicationEpoch: 14,
    publicationStatus: 'PUBLISHED',
    reasonCodes: [],
    priorityPartitionSummary: {
      satisfied: true,
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
    },
  };
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergenceGate: readyGate,
        priorityRecoveryObservation: staleObservation,
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergenceGate: readyGate,
        priorityRecoveryObservation: staleObservation,
      },
    },
  ];

  assert.doesNotThrow(() => assertConsistencyFromSnapshots(snapshots));
});

test('assertConsistencyFromSnapshots keeps concrete priority blockers ' +
  'authoritative over a conflicting ready publication gate', async () => {
  const blockedObservation = {
    publicationEpoch: 14,
    publicationStatus: 'PUBLISHED',
    recoveryProtocolState: 'steady_published',
    prioritySpreadPending: true,
    pendingAckNodeIds: [],
    priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
    priorityPartitionSummary: {
      satisfied: false,
      blockedPartitionCount: 1,
      largestSpreadGap: 1,
      totalSpreadGap: 1,
    },
    priorityRecoveryBlockedPartitionIds: ['replica_operations-p1'],
    priorityRecoveryBlockedPartitionCount: 1,
    priorityRecoveryUnresolvedPartitionCount: 0,
  };
  const readyGate = {
    ready: true,
    state: 'ready',
    publicationEpoch: 14,
    publicationStatus: 'PUBLISHED',
    reasonCodes: [],
  };
  const snapshots = [
    {
      nodeId: 'node-a',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergenceGate: readyGate,
        priorityRecoveryObservation: blockedObservation,
      },
    },
    {
      nodeId: 'node-b',
      nodes: ['node-1', 'node-2'],
      publishedNodes: ['node-1', 'node-2'],
      partitions: ['p1'],
      leaders: {p1: TEST_LEADER_ADDRESS},
      controlPlaneDiagnostics: {
        publicationConvergenceGate: readyGate,
        priorityRecoveryObservation: blockedObservation,
      },
    },
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Publication-scoped consistency not ready/i,
  );
});

test('assertConsistencyFromSnapshots discounts reason-only stale priority ' +
  'recovery observations after steady publication', async () => {
  const staleObservation = {
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    recoveryProtocolState: TEST_RECOVERY_STATE_STEADY_PUBLISHED,
    pendingAckNodeIds: [],
    priorityRecoveryReasonCodes: [
      TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    ],
    priorityRecoveryBlockedPartitionCount: TEST_EMPTY_COUNT,
    priorityRecoveryUnresolvedPartitionCount: TEST_EMPTY_COUNT,
    priorityRecoveryCurrentSummary: {
      blockedPartitionCount: TEST_EMPTY_COUNT,
      unresolvedClassCount: TEST_EMPTY_COUNT,
      unresolvedSemanticStateCount: TEST_EMPTY_COUNT,
      blockedPartitionIds: [],
      blockerPartitionIdsByReason: {},
    },
  };
  const snapshots = [
    buildPublicationReadySnapshot(TEST_NODE_A_ID, {
      priorityRecoveryObservation: staleObservation,
    }),
    buildPublicationReadySnapshot(TEST_NODE_B_ID, {
      priorityRecoveryObservation: staleObservation,
    }),
  ];

  assert.doesNotThrow(() => assertConsistencyFromSnapshots(snapshots));
});

test('assertConsistencyFromSnapshots keeps current priority blockers ' +
  'authoritative after steady publication', async () => {
  const blockedObservation = {
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    recoveryProtocolState: TEST_RECOVERY_STATE_STEADY_PUBLISHED,
    pendingAckNodeIds: [],
    priorityRecoveryReasonCodes: [
      TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
    ],
    priorityRecoveryBlockedPartitionCount: TEST_BLOCKED_COUNT,
    priorityRecoveryUnresolvedPartitionCount: TEST_EMPTY_COUNT,
    priorityRecoveryCurrentSummary: {
      blockedPartitionCount: TEST_BLOCKED_COUNT,
      unresolvedClassCount: TEST_EMPTY_COUNT,
      unresolvedSemanticStateCount: TEST_EMPTY_COUNT,
      blockedPartitionIds: [TEST_BLOCKED_PRIORITY_PARTITION_ID],
      blockerPartitionIdsByReason: {},
    },
  };
  const snapshots = [
    buildPublicationReadySnapshot(TEST_NODE_A_ID, {
      priorityRecoveryObservation: blockedObservation,
    }),
    buildPublicationReadySnapshot(TEST_NODE_B_ID, {
      priorityRecoveryObservation: blockedObservation,
    }),
  ];

  assert.throws(
    () => assertConsistencyFromSnapshots(snapshots),
    /Publication-scoped consistency not ready/i,
  );
});

test('assertConsistencyFromSnapshots treats repair-deferred priority gate ' +
  'evidence as stale when a same-epoch ready gate exists', async () => {
  const readyNode = buildPublicationReadySnapshot(TEST_NODE_A_ID, {
    publicationConvergence: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
      recoveryProtocolState: TEST_RECOVERY_STATE_STEADY_PUBLISHED,
      publishedActiveNodeIds: [
        TEST_CLUSTER_NODE_1_ID,
        TEST_CLUSTER_NODE_2_ID,
      ],
    },
    publicationConvergenceGate: {
      ready: true,
      state: TEST_RECOVERY_STATE_STEADY_PUBLISHED,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
      reasonCodes: [],
    },
  });
  const repairDeferredNode = {
    ...buildPublicationReadySnapshot(TEST_NODE_B_ID, {
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        recoveryProtocolState: TEST_RECOVERY_STATE_PRIORITY_SPREAD_PENDING,
        priorityRecoveryReasonCodes: [
          TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        publishedActiveNodeIds: [
          TEST_CLUSTER_NODE_1_ID,
          TEST_CLUSTER_NODE_2_ID,
        ],
      },
      publicationConvergenceGate: {
        ready: false,
        state: TEST_RECOVERY_STATE_PRIORITY_SPREAD_PENDING,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        reasonCodes: [TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD],
      },
    }),
    observationMode: TEST_OBSERVATION_MODE_REPAIR_DEFERRED,
    snapshotRevisionState: TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE,
  };

  assert.doesNotThrow(() => assertConsistencyFromSnapshots([
    readyNode,
    repairDeferredNode,
  ]));
});

test('waitForConsistencyConvergence retries until the publication recovery ' +
  'gate is ready before enforcing leaders', async () => {
  let callCount = 0;
  const convergenceThreshold = 3;
  const nodeA = buildControlSnapshotNode('node-a', {
    publishedNodes: ['node-1', 'node-2', 'node-3'],
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: 14,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
      },
      publicationConvergenceGate: {
        ready: true,
        state: 'ready',
        publicationEpoch: 14,
        publicationStatus: 'PUBLISHED',
        reasonCodes: [],
      },
    },
  });
  const nodeB = {
    id: 'node-b',
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      callCount += 1;
      const ready = callCount >= convergenceThreshold;
      return {
        rows: [{
          nodes: ['node-1', 'node-2', 'node-3'],
          publishedNodes: ['node-1', 'node-2', 'node-3'],
          partitions: ['p1'],
          leaders: {p1: ready ? TEST_LEADER_ADDRESS : TEST_WS_ADDRESS},
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            },
            publicationConvergenceGate: {
              ready,
              state: ready ? 'ready' : 'publication_pending',
              publicationEpoch: 14,
              publicationStatus: ready ? 'PUBLISHED' : 'OPEN',
              reasonCodes: ready ? [] : ['publication_epoch_pending'],
            },
          },
        }],
      };
    },
    async query() {
      throw new Error('should not be called');
    },
  };

  await assert.doesNotReject(async () => {
    await waitForConsistencyConvergence(
      [nodeA, nodeB],
      {timeoutMs: 5000, pollIntervalMs: 50},
    );
  });
  assert.ok(
    callCount >= convergenceThreshold,
    'Expected at least ' + convergenceThreshold +
    ' probes, got ' + callCount,
  );
});
