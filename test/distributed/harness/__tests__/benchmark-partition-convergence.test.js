import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_OWNER_BACKPRESSURED,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_PENDING_WRITE_GROWTH,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE,
  BENCHMARK_DEGRADATION_STATE,
  BENCHMARK_DISPATCH_CONTRIBUTION_STATE,
  BENCHMARK_LOAD_ADMISSION_STATE,
  BENCHMARK_PARTITION_DISPATCH_MODE,
  BENCHMARK_PARTITION_CONVERGENCE_STATE,
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  buildBenchmarkLoadAdmissionSnapshot,
  buildBenchmarkPartitionConvergenceSnapshot,
  resolveBenchmarkPartitionDispatchMode,
} from '../benchmark-partition-convergence.js';

test('benchmark-partition-convergence preserves local versus routed ' +
  'benchmark admission states', async () => {
  const nodeLocal = {id: 'node-local'};
  const nodeReplicaBlocked = {id: 'node-replica-blocked'};
  const nodeRouted = {id: 'node-routed'};
  const nodeGateBlocked = {id: 'node-gate-blocked'};

  const snapshot = buildBenchmarkLoadAdmissionSnapshot({
    evaluations: [
      {
        node: nodeLocal,
        localReplicaSeen: true,
        localAdmissionReady: true,
        admissionReady: true,
        admissionCheckEligible: true,
      },
      {
        node: nodeReplicaBlocked,
        localReplicaSeen: true,
        localAdmissionReady: false,
        admissionReady: true,
        admissionCheckEligible: true,
        routingReady: true,
        schemaReady: false,
        topologyReady: false,
        localReplicaRole: 'candidate',
        localReplicaVoterReady: false,
        leadershipStable: false,
        degradationState: 'promotion_pending',
        discoveryReasonDetails: [{
          code: 'leadership_unstable',
          detail: 'p1',
        }],
        degradedByOperationIds: ['op-promote'],
        retryAfterMs: 125,
      },
      {
        node: nodeRouted,
        localReplicaSeen: false,
        localAdmissionReady: false,
        admissionReady: true,
        admissionCheckEligible: true,
        loadLaneReasonCodes: [],
      },
      {
        node: nodeGateBlocked,
        localReplicaSeen: false,
        localAdmissionReady: false,
        admissionReady: false,
        admissionCheckEligible: false,
        reasonCodes: ['recovery_gate_closed'],
      },
    ],
  });
  const stateByNodeId = new Map(
    snapshot.evaluations.map((evaluation) => [evaluation.nodeId, evaluation]),
  );

  assert.deepStrictEqual(
    snapshot.admissionReadyNodeIds,
    ['node-local', 'node-replica-blocked', 'node-routed'],
  );
  assert.deepStrictEqual(snapshot.localReadyNodeIds, ['node-local']);
  assert.equal(
    stateByNodeId.get('node-local')?.state,
    BENCHMARK_LOAD_ADMISSION_STATE.LOCAL_READY,
  );
  assert.equal(
    stateByNodeId.get('node-replica-blocked')?.state,
    BENCHMARK_LOAD_ADMISSION_STATE.ROUTED_READY,
  );
  assert.equal(
    stateByNodeId.get('node-replica-blocked')?.localReplicaRole,
    'candidate',
  );
  assert.equal(
    stateByNodeId.get('node-replica-blocked')?.localReplicaVoterReady,
    false,
  );
  assert.equal(
    stateByNodeId.get('node-replica-blocked')?.degradationState,
    'promotion_pending',
  );
  assert.deepStrictEqual(
    stateByNodeId.get('node-replica-blocked')?.discoveryReasonCodes,
    ['leadership_unstable'],
  );
  assert.equal(
    stateByNodeId.get('node-replica-blocked')?.retryAfterMs,
    125,
  );
  assert.equal(
    stateByNodeId.get('node-routed')?.state,
    BENCHMARK_LOAD_ADMISSION_STATE.ROUTED_READY,
  );
  assert.equal(
    stateByNodeId.get('node-gate-blocked')?.state,
    BENCHMARK_LOAD_ADMISSION_STATE.GATE_BLOCKED,
  );
  assert.deepStrictEqual(snapshot.readinessReasonHistogram, {
    recovery_gate_closed: 1,
  });
  assert.deepStrictEqual(snapshot.degradationStateHistogram, {
    unknown: 3,
    promotion_pending: 1,
  });
});

test('benchmark-partition-convergence classifies blocked replica spread ' +
  'separately from routed-only admission', async () => {
  const admissionSnapshot = buildBenchmarkLoadAdmissionSnapshot({
    evaluations: [
      {
        node: {id: 'node-ready-replica'},
        localReplicaSeen: true,
        localAdmissionReady: true,
        admissionReady: true,
        admissionCheckEligible: true,
      },
      {
        node: {id: 'node-blocked-replica'},
        localReplicaSeen: true,
        localAdmissionReady: false,
        admissionReady: true,
        admissionCheckEligible: true,
        reasonCodes: ['local_replica_not_voter_ready'],
      },
      {
        node: {id: 'node-routed-only'},
        localReplicaSeen: false,
        localAdmissionReady: false,
        admissionReady: true,
        admissionCheckEligible: true,
      },
      {
        node: {id: 'node-absent'},
        localReplicaSeen: false,
        localAdmissionReady: false,
        admissionReady: false,
        admissionCheckEligible: true,
      },
    ],
  });

  const snapshot = buildBenchmarkPartitionConvergenceSnapshot({
    admissionSnapshot,
    replicaBearingNodeIds: [
      'node-ready-replica',
      'node-blocked-replica',
    ],
  });
  const stateByNodeId = new Map(
    snapshot.evaluations.map((evaluation) => [evaluation.nodeId, evaluation]),
  );

  assert.deepStrictEqual(snapshot.readyReplicaNodeIds, ['node-ready-replica']);
  assert.deepStrictEqual(snapshot.replicaBlockedNodeIds, [
    'node-blocked-replica',
  ]);
  assert.deepStrictEqual(snapshot.admissionReadyNodeIds, [
    'node-ready-replica',
    'node-blocked-replica',
    'node-routed-only',
  ]);
  assert.equal(
    stateByNodeId.get('node-ready-replica')?.state,
    BENCHMARK_PARTITION_CONVERGENCE_STATE.READY_REPLICA,
  );
  assert.equal(
    stateByNodeId.get('node-ready-replica')?.dispatchContributionState,
    BENCHMARK_DISPATCH_CONTRIBUTION_STATE.LOCAL_PRIMARY,
  );
  assert.equal(
    stateByNodeId.get('node-blocked-replica')?.state,
    BENCHMARK_PARTITION_CONVERGENCE_STATE.REPLICA_BLOCKED,
  );
  assert.equal(
    stateByNodeId.get('node-blocked-replica')?.dispatchContributionState,
    BENCHMARK_DISPATCH_CONTRIBUTION_STATE.LOCAL_BLOCKED,
  );
  assert.equal(
    stateByNodeId.get('node-routed-only')?.state,
    BENCHMARK_PARTITION_CONVERGENCE_STATE.ROUTED_ADMISSION_ONLY,
  );
  assert.equal(
    stateByNodeId.get('node-routed-only')?.dispatchContributionState,
    BENCHMARK_DISPATCH_CONTRIBUTION_STATE.ROUTED_SUPPORT,
  );
  assert.equal(
    stateByNodeId.get('node-absent')?.state,
    BENCHMARK_PARTITION_CONVERGENCE_STATE.ABSENT,
  );
  assert.equal(
    stateByNodeId.get('node-absent')?.dispatchContributionState,
    BENCHMARK_DISPATCH_CONTRIBUTION_STATE.NONE,
  );
  assert.deepStrictEqual(snapshot.localPrimaryNodeIds, ['node-ready-replica']);
  assert.deepStrictEqual(snapshot.routedSupportNodeIds, ['node-routed-only']);
  assert.deepStrictEqual(snapshot.readinessReasonHistogram, {
    local_replica_not_voter_ready: 1,
  });
  assert.deepStrictEqual(snapshot.degradationStateHistogram, {
    [BENCHMARK_DEGRADATION_STATE.UNKNOWN]: 4,
  });
  assert.deepStrictEqual(snapshot.convergenceStateHistogram, {
    ready_replica: 1,
    replica_blocked: 1,
    routed_admission_only: 1,
    absent: 1,
  });
  assert.deepStrictEqual(snapshot.dispatchContributionHistogram, {
    local_primary: 1,
    local_blocked: 1,
    routed_support: 1,
    none: 1,
  });
});

test('benchmark-partition-convergence treats local replica visibility as ' +
  'replica-bearing evidence when table distribution lags', async () => {
  const snapshot = buildBenchmarkPartitionConvergenceSnapshot({
    admissionSnapshot: buildBenchmarkLoadAdmissionSnapshot({
      evaluations: [
        {
          node: {id: 'node-lagged-replica'},
          localReplicaSeen: true,
          localAdmissionReady: false,
          admissionReady: true,
          admissionCheckEligible: true,
          reasonCodes: ['leadership_unstable'],
        },
        {
          node: {id: 'node-routed-only'},
          localReplicaSeen: false,
          localAdmissionReady: false,
          admissionReady: true,
          admissionCheckEligible: true,
        },
      ],
    }),
    replicaBearingNodeIds: [],
  });
  const stateByNodeId = new Map(
    snapshot.evaluations.map((evaluation) => [evaluation.nodeId, evaluation]),
  );

  assert.deepStrictEqual(snapshot.replicaBearingNodeIds, [
    'node-lagged-replica',
  ]);
  assert.deepStrictEqual(snapshot.replicaBlockedNodeIds, [
    'node-lagged-replica',
  ]);
  assert.equal(
    stateByNodeId.get('node-lagged-replica')?.state,
    BENCHMARK_PARTITION_CONVERGENCE_STATE.REPLICA_BLOCKED,
  );
  assert.equal(
    stateByNodeId.get('node-routed-only')?.state,
    BENCHMARK_PARTITION_CONVERGENCE_STATE.ROUTED_ADMISSION_ONLY,
  );
});

test('benchmark-partition-convergence keeps backfill active until the ' +
  'target usable-spread contributor set exists', async () => {
  const readyReplicaSnapshot = buildBenchmarkPartitionConvergenceSnapshot({
    admissionSnapshot: buildBenchmarkLoadAdmissionSnapshot({
      evaluations: [
        {
          node: {id: 'node-1'},
          localReplicaSeen: true,
          localAdmissionReady: true,
          admissionReady: true,
          admissionCheckEligible: true,
        },
        {
          node: {id: 'node-2'},
          localReplicaSeen: true,
          localAdmissionReady: true,
          admissionReady: true,
          admissionCheckEligible: true,
        },
        {
          node: {id: 'node-3'},
          localReplicaSeen: true,
          localAdmissionReady: true,
          admissionReady: true,
          admissionCheckEligible: true,
        },
        {
          node: {id: 'node-4'},
          localReplicaSeen: false,
          localAdmissionReady: false,
          admissionReady: true,
          admissionCheckEligible: true,
        },
      ],
    }),
    replicaBearingNodeIds: ['node-1', 'node-2', 'node-3'],
  });
  const targetBackfillSnapshot = buildBenchmarkPartitionConvergenceSnapshot({
    admissionSnapshot: buildBenchmarkLoadAdmissionSnapshot({
      evaluations: [
        {
          node: {id: 'node-1'},
          localReplicaSeen: true,
          localAdmissionReady: true,
          admissionReady: true,
          admissionCheckEligible: true,
        },
        {
          node: {id: 'node-2'},
          localReplicaSeen: true,
          localAdmissionReady: false,
          admissionReady: true,
          admissionCheckEligible: true,
          reasonCodes: ['local_replica_not_voter_ready'],
        },
        {
          node: {id: 'node-3'},
          localReplicaSeen: true,
          localAdmissionReady: false,
          admissionReady: true,
          admissionCheckEligible: true,
          reasonCodes: ['leadership_unstable'],
        },
      ],
    }),
    replicaBearingNodeIds: ['node-1', 'node-2', 'node-3'],
  });

  assert.equal(
    resolveBenchmarkPartitionDispatchMode({
      convergenceSnapshot: readyReplicaSnapshot,
      bootstrapRequiredNodeCount: 2,
      targetNodeCount: 3,
    }),
    BENCHMARK_PARTITION_DISPATCH_MODE.LOCAL_READY_ONLY,
    'once local contributors satisfy the usable-spread target, dispatch should stay on local contributors',
  );
  assert.equal(
    resolveBenchmarkPartitionDispatchMode({
      convergenceSnapshot: targetBackfillSnapshot,
      bootstrapRequiredNodeCount: 2,
      targetNodeCount: 3,
    }),
    BENCHMARK_PARTITION_DISPATCH_MODE.BOOTSTRAP_BACKFILL_REQUIRED,
    'meeting bootstrap quorum alone is not enough when the usable-spread target still needs backfill',
  );
});


test('benchmark-partition-convergence classifies control-plane backlog as a pending stability gate', async () => {
  const snapshot = buildBenchmarkCriticalControlPlaneStabilitySnapshot({
    publicationConvergenceGate: {
      ready: true,
      reasons: [],
      publicationStatus: 'PUBLISHED',
      recoveryProtocolState: 'published',
    },
    controlPlaneOwnerQueueDepth: {
      pendingWrites: 6,
      pendingWriteGrowthCount: 2,
      retainedBacklogGrowthCount: 0,
      sharedPressureBackpressured: true,
    },
    cdcReplayLag: {
      bufferedEvents: 0,
      replayBufferGrowthCount: 0,
      replayRetryDepth: 1,
    },
    snapshotCoverageComplete: true,
    snapshotCoverageNodeCount: 3,
    expectedNodeCount: 3,
    selectedNodeId: 'node-1',
    controlPlaneDiagnosticsAvailable: true,
  });

  assert.equal(
    snapshot.state,
    BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE.PENDING,
  );
  assert.deepStrictEqual(snapshot.reasonCodes, [
    BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_OWNER_BACKPRESSURED,
    BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_PENDING_WRITE_GROWTH,
  ]);
  assert.equal(snapshot.selectedNodeId, 'node-1');
  assert.equal(snapshot.controlPlaneDiagnosticsAvailable, true);
});

test('benchmark-partition-convergence keeps bootstrap backfill active while the critical control-plane gate is pending', async () => {
  const criticalControlPlaneStability =
    buildBenchmarkCriticalControlPlaneStabilitySnapshot({
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus: 'PUBLISHED',
        recoveryProtocolState: 'published',
      },
      controlPlaneOwnerQueueDepth: {
        pendingWrites: 3,
        pendingWriteGrowthCount: 1,
        retainedBacklogGrowthCount: 0,
        sharedPressureBackpressured: false,
      },
      cdcReplayLag: {
        bufferedEvents: 0,
        replayBufferGrowthCount: 0,
        replayRetryDepth: 1,
      },
    });

  assert.equal(
    resolveBenchmarkPartitionDispatchMode({
      criticalControlPlaneStability,
      localPrimaryNodeCount: 3,
      readyReplicaNodeCount: 3,
      bootstrapRequiredNodeCount: 2,
      targetNodeCount: 3,
    }),
    BENCHMARK_PARTITION_DISPATCH_MODE.BOOTSTRAP_BACKFILL_REQUIRED,
  );
});
