import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  assertConsistency,
  assertConsistencyFromSnapshots,
  waitForConsistencyConvergence,
} from '../assertions.js';
import {
  TEST_WS_ADDRESS,
  TEST_LEADER_ADDRESS,
  TEST_NODE_A_ID,
  TEST_NODE_B_ID,
  TEST_CLUSTER_NODE_1_ID,
  TEST_CLUSTER_NODE_2_ID,
  TEST_PUBLICATION_EPOCH,
  TEST_PUBLICATION_STATUS_PUBLISHED,
  TEST_RECOVERY_STATE_PRIORITY_SPREAD_PENDING,
  TEST_RECOVERY_STATE_STEADY_PUBLISHED,
  TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD,
  TEST_BLOCKED_PRIORITY_PARTITION_ID,
  TEST_OBSERVATION_MODE_REPAIR_DEFERRED,
  TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE,
  TEST_EMPTY_COUNT,
  TEST_BLOCKED_COUNT,
  buildControlSnapshotNode,
  buildPublicationReadySnapshot,
  buildFreshPriorityDecisionClosureWitness,
} from './assert-consistency-fixtures.js';

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
