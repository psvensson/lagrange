import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertConsistency,
  waitForConsistencyConvergence,
} from '../assertions.js';
import {
  TEST_WS_ADDRESS,
  TEST_LEADER_ADDRESS,
  TEST_CLUSTER_NODE_1_ID,
  TEST_CLUSTER_NODE_2_ID,
  TEST_PUBLICATION_EPOCH,
  TEST_PARTITION_ID,
  TEST_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
  TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG,
  TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REPAIR_DEFERRED,
  TEST_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG,
  TEST_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED,
  TEST_CONSISTENCY_REASON_ACTIVE_NODES_DISAGREE,
  TEST_FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH,
  TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG,
  TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REPAIR_DEFERRED,
  TEST_FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
  TEST_FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED,
  TEST_ROOT_CAUSE_TOPOLOGY,
  TEST_ROOT_CAUSE_CACHE,
  TEST_OBSERVATION_MODE_LOCAL_CACHE,
  TEST_OBSERVATION_MODE_FRESH_OWNER,
  TEST_OBSERVATION_MODE_REPAIR_DEFERRED,
  TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE,
  TEST_SNAPSHOT_REVISION_A,
  TEST_SNAPSHOT_REVISION_B,
  TEST_TOPOLOGY_EPOCH,
  TEST_SHORT_CONVERGENCE_TIMEOUT_MS,
  TEST_SHORT_CONVERGENCE_POLL_MS,
  TEST_EMPTY_COUNT,
  TEST_BLOCKED_COUNT,
  buildControlSnapshotNode,
} from './assert-consistency-fixtures.js';

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
