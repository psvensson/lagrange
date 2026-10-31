const arrayMap = Function.call.bind(Array.prototype.map);

const makeMilestone = ([id, v, sha, at, lbl]) => ({
  milestoneId: id, version: v, commitSha: sha, recordedAt: at, label: lbl,
  status: 'not measured',
  reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
  evidenceTier: 'none', executionPath: 'none',
  scenarioATxPerSec: null, scenarioAP50Ms: null, scenarioAP95Ms: null, scenarioAP99Ms: null,
  semanticProofPassed: null, semanticProofRequired: 33,
  scenarioBDecisionsPerSec: null, scenarioBP99Ms: null, scenarioBWanBytes: null,
  scenarioBMoveP99Ms: null, scenarioBConvergenceMs: null, scenarioCFresh0msDecPerSec: null,
});

export function buildLagrangeEvolutionTimeline() {
  return [
    makeMilestone(['v0.2.0-tidb-ref', '0.2.0', 'b0b2f9abcc', '2026-09-12T20:07:34Z',
      'TiDB Reference Baseline Established']),
    makeMilestone(['v0.3.0-lab-paired', '0.3.0', '8039e45f2a', '2026-10-29T18:53:52Z',
      '5-Node Lab Paired Scenario A Baseline']),
    makeMilestone(['v0.3.0-conflict-retry', '0.3.0', '66d054c9c9', '2026-10-30T11:45:00Z',
      'Retryable Conflict & Visibility Gate']),
    makeMilestone(['v0.3.0-semantic-closure', '0.3.0', '27af74dc7b', '2026-10-30T12:11:36Z',
      'Full 33/33 Semantic Proof Closure']),
    makeMilestone(['v0.3.0-scenario-b-model', '0.3.0', '2d416de6e5', '2026-10-30T16:05:00Z',
      'Scenario B 3-Island RF=3 Risk & Movement Model']),
    makeMilestone(['v0.3.2-provenance-matrix', '0.3.2', '4dc6db6b93', '2026-10-30T20:11:52Z',
      '13-Target Matrix, Scenario C & Provenance Audit']),
    makeMilestone(['v0.3.2-scaleout-3to5-rf3', '0.3.2', '89300e4d8a', '2026-10-30T21:40:00Z',
      '3-to-5-Node RF=3 Scale-Out & Scenario A 3-Mode Separation']),
    makeMilestone(['v0.3.2-partition-sweep-p6to60', '0.3.2', '2025f7780d', '2026-10-30T22:10:00Z',
      '5-Node RF=3 Partition Granularity Sweep (P=6..60)']),
    makeMilestone(['v0.3.2-rtt-working-set-crossover', '0.3.2', 'bdee84d5fc', '2026-10-30T23:00:00Z',
      'Scenario B RTT Crossover (0.2..30ms) & Heavy-Correlation Working Set']),
    makeMilestone(['v0.3.2-live-movement-scenario-c-scale', '0.3.2', '72c76c6629', '2026-10-30T23:50:00Z',
      'Live Movement Under Load & Scenario C 5x Joint Scaling']),
    makeMilestone(['v0.3.3-tx-fast-path-5node-summary', '0.3.3', 'b41d4ccec4', '2026-10-30T22:05:28Z',
      'v0.3.3 Scenario A Fast-Path & 5-Node Summary']),
    makeMilestone(['v0.4.0-scaleout-scenario-c-release', '0.4.0', '7565d8c09a', '2026-10-31T06:50:00Z',
      'v0.4.0 5-Node Scale-Out & Scenario C Summary Release']),
  ];
}

export function buildScaleout3To5Rf3Experiment() {
  const mkA = ([targetId, label, isUnsupported = false]) => ({
    targetId, label,
    status: isUnsupported ? 'unsupported' : 'not measured',
    reason: isUnsupported ?
      'Single-node configuration does not support multi-node scale-out' :
      'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    tx3Node: null, p95Ms3Node: null, tx5Node: null, p95Ms5Node: null, scaleGainPct: null,
    evidenceTier: 'none',
  });
  const mkB = ([targetId, label]) => ({
    targetId, label,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    dec3Node100Pct: null, p99Ms3Node: null, wire3Node: null,
    dec5Node60Pct: null, p99Ms5Node: null, wire5Node: null,
    aggregate5NodeDecPerSec: null, evidenceTier: 'none',
  });
  const c = (nodes, pct, abs) => ({nodes, rf: 3, replicaCoveragePct: pct, absentPartitionPct: abs});
  return {
    replicationFactor: 3, nodeCounts: [3, 5],
    replicaCoverageByNodes: {'3': c(3, 100.0, 0.0), '5': c(5, 60.0, 40.0)},
    scenarioAModes: {
      'fixed-workload-scaleout': [
        mkA(['lagrange', 'Lagrange (0.3.0 Lab Baseline)']),
        mkA(['lagrange-033-fast-path', 'Lagrange 0.3.3 (Tx Fast-Path)']),
        mkA(['tidb-tikv', 'TiDB + TiKV']),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)']),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)']),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)']),
      ],
      'proportional-growth-scaleout': [
        mkA(['lagrange', 'Lagrange 0.3.3']),
        mkA(['tidb-tikv', 'TiDB + TiKV']),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)']),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)']),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)']),
      ],
      'hot-contention-baseline': [
        mkA(['lagrange', 'Lagrange 0.3.3']),
        mkA(['tidb-tikv', 'TiDB + TiKV']),
        mkA(['pg-patroni-sync-ha-rf3', 'PG 17 (Patroni Sync HA + App)']),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)']),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)']),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)']),
        mkA(['pg-single-primary', 'PG 17 (Single Primary + App Svc)', true]),
        mkA(['pg-plpgsql-single-primary', 'PG 17 (Single Primary + PL/pgSQL)', true]),
      ],
    },
    scenarioBCoverage: [
      mkB(['lagrange', 'Lagrange']),
      mkB(['tidb-tikv', 'TiDB + TiKV']),
      mkB(['citus-distributed-function', 'Citus 13 (Dist Function)']),
      mkB(['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)']),
      mkB(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)']),
    ],
  };
}

export function buildPartitionGranularitySweepExperiment() {
  const mkPt = (p, avg, bal, regime) => ({
    partitionCount: p, partitionsPerNodeLeaderAvg: avg, leaderBalanceFactor: bal, regime,
  });
  const mkS = (p) => ({
    partitionCount: p,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    decisionsPerSec: null, p99Ms: null,
    coordinationOverheadPct: null, raftHeartbeatOpsPerSec: null,
    evidenceTier: 'none',
  });
  const mkT = (id, label, seriesCounts) => ({
    targetId: id, label,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    optimalPartitions: null,
    peakDecisionsPerSec: null, overPartitionDropPct: null,
    series: arrayMap(seriesCounts, (p) => mkS(p)),
  });
  return {
    experimentId: 'partition-granularity-sweep-5node-rf3',
    nodeCount: 5,
    replicationFactor: 3,
    replicaCoveragePct: 60.0,
    partitionCounts: [6, 15, 30, 60],
    partitionPoints: [
      mkPt(6, 1.2, 0.83, 'under-partitioned-leader-skew'),
      mkPt(15, 3.0, 1.0, 'balanced-baseline'),
      mkPt(30, 6.0, 1.0, 'parallel-sweet-spot'),
      mkPt(60, 12.0, 1.0, 'over-partitioned-coordination-tax'),
    ],
    targets: [
      mkT('lagrange', 'Lagrange', [6, 15, 30, 60]),
      mkT('tidb-tikv', 'TiDB + TiKV', [6, 15, 30, 60]),
      mkT('citus-distributed-function', 'Citus 13 (Dist Function)', [6, 15, 30, 60]),
      mkT('yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', [6, 15, 30, 60]),
      mkT('ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', [6, 15, 30, 60]),
    ],
  };
}

export function buildScenarioBRttWorkingSetExperiment() {
  const mkRttPt = (rttMs) => ({
    rttMs,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    decisionsPerSec: null, p99Ms: null, evidenceTier: 'none',
  });
  const mkRttTarget = (id, label, hops, pts) => ({
    targetId: id, label,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    localOnly02msDecPerSec: null,
    localOnly02msP99Ms: null, oneWayHopsSequential: hops,
    rttSeries: arrayMap(pts, (p) => mkRttPt(p)),
  });
  const mkWs = ([id, label]) => ({
    targetId: id, label,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    moderateDecPerSec: null, moderateP99Ms: null,
    moderateWanBytes: null, heavyDecPerSec: null, heavyP99Ms: null,
    heavyWanBytes: null, throughputDropPct: null, evidenceTier: 'none',
  });
  const rttPoints = [0.2, 2.0, 10.0, 30.0];
  return {
    experimentId: 'scenario-b-rtt-crossover-and-working-set-growth',
    nodeCount: 5, replicationFactor: 3, rttPointsMs: rttPoints,
    sequentialRttSeries: [
      mkRttTarget('lagrange', 'Lagrange', 2, rttPoints),
      mkRttTarget('ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 6, rttPoints),
      mkRttTarget('citus-distributed-function', 'Citus 13 (Dist Function)', 6, rttPoints),
      mkRttTarget('pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL', 6, rttPoints),
      mkRttTarget('yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 6, rttPoints),
      mkRttTarget('tidb-tikv', 'TiDB + TiKV', 12, rttPoints),
    ],
    workingSetComparison: [
      mkWs(['lagrange', 'Lagrange']),
      mkWs(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)']),
      mkWs(['citus-distributed-function', 'Citus 13 (Dist Function)']),
      mkWs(['pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL']),
      mkWs(['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)']),
      mkWs(['tidb-tikv', 'TiDB + TiKV']),
    ],
  };
}

export function buildLiveMovementAndScenarioCScalingExperiment() {
  const mkMv = ([targetId, label]) => ({
    targetId, label,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    preMoveP99Ms: null, duringMoveP99Ms: null,
    postMoveP99Ms: null, routingConvergenceMs: null, writeStallMs: null,
    zeroLossIdentityVerified: null, evidenceTier: 'none',
  });
  const mkSc = ([targetId, label]) => ({
    targetId, label,
    status: 'not measured',
    reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
    scale1xFresh0msDecPerSec: null,
    scale5xFresh0msDecPerSec: null, scale5xFresh1000msDecPerSec: null,
    staleDecisionRatePct: null, ruleChangeBackfillSec: null,
    cacheRestartRecoverySec: null, operationalPipelines: null,
    evidenceTier: 'none',
  });
  const mkOb = (id, desc) => ({
    regimeId: id, workloadDescription: desc,
    status: 'not measured',
    winningSystem: 'Awaiting admitted GCP/lab measurement',
    architecturalReason: 'Comparative conclusions await admitted GCP/lab measurements on both arms over public interfaces.',
  });
  return {
    experimentId: 'live-movement-under-load-and-scenario-c-joint-scaling',
    nodeCount: 5, replicationFactor: 3,
    liveMovementPhases: [
      mkMv(['lagrange', 'Lagrange']),
      mkMv(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)']),
      mkMv(['citus-distributed-function', 'Citus 13 (Dist Function)']),
      mkMv(['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)']),
      mkMv(['tidb-tikv', 'TiDB + TiKV']),
    ],
    scenarioCJointScaling: [
      mkSc(['lagrange', 'Lagrange']),
      mkSc(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)']),
      mkSc(['pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL']),
      mkSc(['pg-valkey-sync-write-through', 'PG 17 + Valkey 8 (Sync)']),
      mkSc(['pg-valkey-async-stream', 'PG 17 + Valkey 8 (Async)']),
    ],
    operatingBoundaryMap: [
      mkOb('ordinary-oltp-single-region',
        'Contended SQL transactions without cross-partition compute'),
      mkOb('single-key-colocated-analytics-udf',
        'Single-distribution-key local aggregation at LAN RTT (0.2 ms)'),
      mkOb('relaxed-staleness-precomputed-cache',
        'High-read-fanout feature lookups tolerating 100-1000 ms staleness'),
      mkOb('multi-entity-cross-az-colocated-workflow',
        'Multi-stage cross-entity risk decisions at >= 2 ms RTT and 256 KB working sets'),
      mkOb('zero-stall-live-rebalance-and-0ms-freshness-scaleout',
        '5x joint ingestion/decision scale-out under 0 ms read-your-writes SLA and live movement'),
    ],
  };
}
