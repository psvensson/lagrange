const arrayMap = Function.call.bind(Array.prototype.map);

const makeMilestone = ([
  id, v, sha, at, lbl, tier, pth, tps, p50, p95, p99, pass, dps, bp99, wan, mp99, conv, cfresh,
]) => ({
  milestoneId: id, version: v, commitSha: sha, recordedAt: at, label: lbl,
  evidenceTier: tier, executionPath: pth,
  scenarioATxPerSec: tps, scenarioAP50Ms: p50, scenarioAP95Ms: p95, scenarioAP99Ms: p99,
  semanticProofPassed: pass, semanticProofRequired: 33,
  scenarioBDecisionsPerSec: dps, scenarioBP99Ms: bp99, scenarioBWanBytes: wan,
  scenarioBMoveP99Ms: mp99, scenarioBConvergenceMs: conv, scenarioCFresh0msDecPerSec: cfresh,
});

export function buildLagrangeEvolutionTimeline() {
  const o = 'observed-docker-cluster';
  const m = 'modeled-topology-oracle';
  const w = 'live-cluster-wire';
  const l = 'local-js-oracle';
  return [
    makeMilestone(['v0.2.0-tidb-ref', '0.2.0', 'b0b2f9abcc', '2026-09-12T20:07:34Z',
      'TiDB Reference Baseline Established', o, w, 0.0, 0.0, 0.0, 0.0, 0, 0.0, 0.0, 0, 0.0, 0.0, 0.0]),
    makeMilestone(['v0.3.0-lab-paired', '0.3.0', '8039e45f2a', '2026-10-29T18:53:52Z',
      '5-Node Lab Paired Scenario A Baseline', o, w, 0.83, 2269.44, 4418.93, 5343.1, 4, 0.0, 0.0, 0, 0.0, 0.0, 0.0]),
    makeMilestone(['v0.3.0-conflict-retry', '0.3.0', '66d054c9c9', '2026-10-30T11:45:00Z',
      'Retryable Conflict & Visibility Gate', o, w, 0.83, 2269.44, 4418.93, 5343.1, 16, 0.0, 0.0, 0, 0.0, 0.0, 0.0]),
    makeMilestone(['v0.3.0-semantic-closure', '0.3.0', '27af74dc7b', '2026-10-30T12:11:36Z',
      'Full 33/33 Semantic Proof Closure', o, w, 0.83, 2269.44, 4418.93, 5343.1, 33, 0.0, 0.0, 0, 0.0, 0.0, 0.0]),
    makeMilestone(['v0.3.0-scenario-b-model', '0.3.0', '2d416de6e5', '2026-10-30T16:05:00Z',
      'Scenario B 3-Island RF=3 Risk & Movement Model', m, l, 0.83, 2269.44, 4418.93, 5343.1, 33, 441.15, 18.09, 144, 18.0, 45.0, 0.0]),
    makeMilestone(['v0.3.2-provenance-matrix', '0.3.2', '4dc6db6b93', '2026-10-30T20:11:52Z',
      '13-Target Matrix, Scenario C & Provenance Audit', m, l, 0.83, 2269.44, 4418.93, 5343.1, 33, 441.15, 18.09, 144, 18.0, 45.0, 441.15]),
    makeMilestone(['v0.3.2-scaleout-3to5-rf3', '0.3.2', '89300e4d8a', '2026-10-30T21:40:00Z',
      '3-to-5-Node RF=3 Scale-Out & Scenario A 3-Mode Separation', m, l,
      2.24, 1380.0, 2590.0, 3120.0, 33, 720.4, 18.09, 144, 18.0, 45.0, 441.15]),
    makeMilestone(['v0.3.2-partition-sweep-p6to60', '0.3.2', '2025f7780d', '2026-10-30T22:10:00Z',
      '5-Node RF=3 Partition Granularity Sweep (P=6..60)', m, l,
      2.24, 1520.0, 2590.0, 3120.0, 33, 784.0, 16.9, 144, 42.0, 45.0, 441.15]),
    makeMilestone(['v0.3.2-rtt-working-set-crossover', '0.3.2', 'bdee84d5fc', '2026-10-30T23:00:00Z',
      'Scenario B RTT Crossover (0.2..30ms) & Heavy-Correlation Working Set', m, l,
      2.24, 1520.0, 2590.0, 3120.0, 33, 368.0, 21.8, 144, 42.0, 45.0, 441.15]),
    makeMilestone(['v0.3.2-live-movement-scenario-c-scale', '0.3.2', '72c76c6629', '2026-10-30T23:50:00Z',
      'Live Movement Under Load & Scenario C 5x Joint Scaling', m, l,
      2.24, 1520.0, 2590.0, 3120.0, 33, 1840.0, 17.8, 144, 26.4, 45.0, 1840.0]),
    makeMilestone(['v0.3.3-tx-fast-path-5node-summary', '0.3.3', 'b41d4ccec4', '2026-10-30T22:05:28Z',
      'v0.3.3 Scenario A Fast-Path & 5-Node Summary', m, l,
      3.84, 845.0, 1490.0, 1820.0, 33, 720.4, 18.09, 144, 26.4, 45.0, 1840.0]),
    makeMilestone(['v0.4.0-scaleout-scenario-c-release', '0.4.0', '7565d8c09a', '2026-10-31T06:50:00Z',
      'v0.4.0 5-Node Scale-Out & Scenario C Summary Release', m, l,
      3.84, 845.0, 1490.0, 1820.0, 33, 720.4, 18.09, 144, 26.4, 45.0, 1840.0]),
    makeMilestone(['v0.4.0-scenario-c-in-partition-rollup', '0.4.0', '9edb45bdcba', '2026-10-31T08:40:18Z',
      'Scenario C In-Partition Feature Rollup & Epoch-Lazy Backfill', m, l,
      3.84, 845.0, 1490.0, 1820.0, 33, 720.4, 18.09, 144, 26.4, 45.0, 2420.0]),
  ];
}

export function buildScaleout3To5Rf3Experiment() {
  const o = 'observed-docker-cluster';
  const m = 'modeled-topology-oracle';
  const mkA = ([
    targetId, label, tx3Node, p95Ms3Node, tx5Node, p95Ms5Node, scaleGainPct, evidenceTier = m,
  ]) => ({
    targetId, label, tx3Node, p95Ms3Node, tx5Node, p95Ms5Node, scaleGainPct, evidenceTier,
  });
  const mkB = ([targetId, label, dec3Node100Pct, p99Ms3Node, wire3Node, dec5Node60Pct, p99Ms5Node,
    wire5Node, aggregate5NodeDecPerSec, evidenceTier = m]) => ({
    targetId, label, dec3Node100Pct, p99Ms3Node, wire3Node, dec5Node60Pct, p99Ms5Node,
    wire5Node, aggregate5NodeDecPerSec, evidenceTier,
  });
  const c = (nodes, pct, abs) => ({nodes, rf: 3, replicaCoveragePct: pct, absentPartitionPct: abs});
  return {
    replicationFactor: 3, nodeCounts: [3, 5],
    replicaCoverageByNodes: {'3': c(3, 100.0, 0.0), '5': c(5, 60.0, 40.0)},
    scenarioAModes: {
      'fixed-workload-scaleout': [
        mkA(['lagrange', 'Lagrange (0.3.0 Lab Baseline)', 0.88, 4120.0, 0.83, 4418.93, -5.7, o]),
        mkA(['lagrange-033-fast-path', 'Lagrange 0.3.3 (Tx Fast-Path)', 1.48, 1380.0, 1.41, 1450.0, -4.7]),
        mkA(['tidb-tikv', 'TiDB + TiKV', 6.9, 1310.0, 6.75, 1383.18, -2.2, o]),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)', 11.2, 685.0, 10.6, 730.0, -5.4]),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)', 7.4, 1190.0, 7.1, 1245.0, -4.1]),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 9.6, 845.0, 9.15, 890.0, -4.7]),
      ],
      'proportional-growth-scaleout': [
        mkA(['lagrange', 'Lagrange 0.3.3', 2.38, 1410.0, 3.84, 1490.0, 61.3]),
        mkA(['tidb-tikv', 'TiDB + TiKV', 7.85, 1120.0, 11.9, 1185.0, 51.6]),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)', 12.8, 590.0, 19.4, 625.0, 51.6]),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)', 8.3, 1040.0, 12.4, 1095.0, 49.4]),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 10.8, 740.0, 16.5, 780.0, 52.8]),
      ],
      'hot-contention-baseline': [
        mkA(['lagrange', 'Lagrange 0.3.3', 1.18, 2180.0, 1.11, 2310.0, -5.9]),
        mkA(['tidb-tikv', 'TiDB + TiKV', 6.8, 1350.0, 6.45, 1440.0, -5.1]),
        mkA(['pg-patroni-sync-ha-rf3', 'PG 17 (Patroni Sync HA + App)', 8.4, 920.5, 8.4, 920.5, 0.0]),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)', 9.4, 790.0, 8.6, 865.0, -8.5]),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)', 6.9, 1260.0, 6.4, 1340.0, -7.2]),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 8.9, 910.0, 8.3, 975.0, -6.7]),
      ],
    },
    scenarioBCoverage: [
      mkB(['lagrange', 'Lagrange', 486.0, 15.2, 96, 441.15, 18.09, 144, 720.4]),
      mkB(['tidb-tikv', 'TiDB + TiKV', 268.0, 29.4, 4096, 221.44, 36.08, 6144, 318.0]),
      mkB(['citus-distributed-function', 'Citus 13 (Dist Function)', 412.0, 18.4, 1020, 364.2, 22.9, 1540, 524.0]),
      mkB(['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 328.0, 23.6, 1680, 286.5, 28.4, 2420, 412.0]),
      mkB(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 452.0, 16.8, 560, 408.6, 20.1, 820, 618.0]),
    ],
  };
}

export function buildPartitionGranularitySweepExperiment() {
  const mkPt = (p, avg, bal, regime) => ({
    partitionCount: p, partitionsPerNodeLeaderAvg: avg, leaderBalanceFactor: bal, regime,
  });
  const mkS = (p, dec, p99, coord, hb) => ({
    partitionCount: p, decisionsPerSec: dec, p99Ms: p99,
    coordinationOverheadPct: coord, raftHeartbeatOpsPerSec: hb,
    evidenceTier: 'modeled-topology-oracle',
  });
  const mkT = (id, label, optP, peakDec, dropPct, series) => ({
    targetId: id, label, optimalPartitions: optP,
    peakDecisionsPerSec: peakDec, overPartitionDropPct: dropPct,
    series: arrayMap(series, (s) => mkS(s[0], s[1], s[2], s[3], s[4])),
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
      mkT('lagrange', 'Lagrange', 30, 784.0, -5.9, [
        [6, 590.0, 19.8, 4.2, 180], [15, 720.4, 18.09, 6.8, 450],
        [30, 784.0, 16.9, 9.4, 900], [60, 738.0, 20.4, 16.5, 1800],
      ]),
      mkT('tidb-tikv', 'TiDB + TiKV', 15, 318.0, -17.0, [
        [6, 274.0, 38.4, 11.0, 360], [15, 318.0, 36.08, 14.5, 900],
        [30, 302.0, 41.2, 22.8, 1800], [60, 264.0, 49.6, 31.4, 3600],
      ]),
      mkT('citus-distributed-function', 'Citus 13 (Dist Function)', 30, 542.0, -10.3, [
        [6, 448.0, 24.2, 7.5, 240], [15, 524.0, 22.9, 10.2, 600],
        [30, 542.0, 23.8, 15.6, 1200], [60, 486.0, 28.9, 24.0, 2400],
      ]),
      mkT('yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 15, 412.0, -15.5, [
        [6, 356.0, 30.2, 9.8, 300], [15, 412.0, 28.4, 13.4, 750],
        [30, 398.0, 31.8, 19.8, 1500], [60, 348.0, 38.4, 28.2, 3000],
      ]),
      mkT('ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 30, 662.0, -7.9, [
        [6, 520.0, 21.4, 5.4, 210], [15, 618.0, 20.1, 8.2, 525],
        [30, 662.0, 19.2, 11.8, 1050], [60, 610.0, 23.6, 19.4, 2100],
      ]),
    ],
  };
}

export function buildScenarioBRttWorkingSetExperiment() {
  const mkRttPt = (rttMs, dec, p99) => ({
    rttMs, decisionsPerSec: dec, p99Ms: p99, evidenceTier: 'modeled-topology-oracle',
  });
  const mkRttTarget = (id, label, locDec, locP99, hops, pts) => ({
    targetId: id, label, localOnly02msDecPerSec: locDec,
    localOnly02msP99Ms: locP99, oneWayHopsSequential: hops,
    rttSeries: arrayMap(pts, (p) => mkRttPt(p[0], p[1], p[2])),
  });
  const mkWs = (a) => ({
    targetId: a[0], label: a[1], moderateDecPerSec: a[2], moderateP99Ms: a[3],
    moderateWanBytes: a[4], heavyDecPerSec: a[5], heavyP99Ms: a[6],
    heavyWanBytes: a[7], throughputDropPct: a[8], evidenceTier: 'modeled-topology-oracle',
  });
  return {
    experimentId: 'scenario-b-rtt-crossover-and-working-set-growth',
    nodeCount: 5, replicationFactor: 3, rttPointsMs: [0.2, 2.0, 10.0, 30.0],
    sequentialRttSeries: [
      mkRttTarget('lagrange', 'Lagrange', 628.0, 4.0, 2, [
        [0.2, 540.0, 7.8], [2.0, 380.0, 22.4], [10.0, 168.0, 52.4], [30.0, 68.0, 134.0],
      ]),
      mkRttTarget('ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 618.0, 4.3, 6, [
        [0.2, 495.0, 8.9], [2.0, 274.0, 22.8], [10.0, 108.0, 74.6], [30.0, 41.0, 208.0],
      ]),
      mkRttTarget('citus-distributed-function', 'Citus 13 (Dist Function)', 612.0, 4.6, 6, [
        [0.2, 440.0, 10.8], [2.0, 228.0, 26.8], [10.0, 86.0, 92.4], [30.0, 32.0, 262.0],
      ]),
      mkRttTarget('pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL', 510.0, 6.8, 6, [
        [0.2, 395.0, 12.4], [2.0, 234.0, 25.2], [10.0, 82.0, 96.0], [30.0, 30.0, 274.0],
      ]),
      mkRttTarget('yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 472.0, 8.6, 6, [
        [0.2, 340.0, 14.8], [2.0, 184.0, 34.6], [10.0, 68.0, 114.0], [30.0, 24.0, 328.0],
      ]),
      mkRttTarget('tidb-tikv', 'TiDB + TiKV', 345.0, 12.4, 12, [
        [0.2, 295.0, 18.2], [2.0, 190.0, 48.6], [10.0, 54.0, 148.0], [30.0, 19.0, 412.0],
      ]),
    ],
    workingSetComparison: [
      mkWs(['lagrange', 'Lagrange', 441.15, 18.09, 144, 368.0, 21.8, 144, -16.6]),
      mkWs(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 408.6, 20.1, 820, 312.0, 26.4, 1140, -23.6]),
      mkWs(['citus-distributed-function', 'Citus 13 (Dist Function)', 364.2, 22.9, 1540, 246.0, 34.2, 4860, -32.5]),
      mkWs(['pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL', 316.8, 24.1, 960, 198.0, 39.6, 1420, -37.5]),
      mkWs(['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 286.5, 28.4, 2420, 176.0, 46.8, 8400, -38.6]),
      mkWs(['tidb-tikv', 'TiDB + TiKV', 221.44, 36.08, 6144, 118.0, 68.4, 24576, -46.7]),
    ],
  };
}

export function buildLiveMovementAndScenarioCScalingExperiment() {
  const mkMv = (a) => ({
    targetId: a[0], label: a[1], preMoveP99Ms: a[2], duringMoveP99Ms: a[3],
    postMoveP99Ms: a[4], routingConvergenceMs: a[5], writeStallMs: a[6],
    zeroLossIdentityVerified: a[7], evidenceTier: 'modeled-topology-oracle',
  });
  const mkSc = (a) => ({
    targetId: a[0], label: a[1], scale1xFresh0msDecPerSec: a[2],
    scale5xFresh0msDecPerSec: a[3], scale5xFresh1000msDecPerSec: a[4],
    staleDecisionRatePct: a[5], ruleChangeBackfillSec: a[6],
    cacheRestartRecoverySec: a[7], operationalPipelines: a[8],
    evidenceTier: 'modeled-topology-oracle',
  });
  const mkOb = (id, desc, win, reason) => ({
    regimeId: id, workloadDescription: desc, winningSystem: win, architecturalReason: reason,
  });
  return {
    experimentId: 'live-movement-under-load-and-scenario-c-joint-scaling',
    nodeCount: 5, replicationFactor: 3,
    liveMovementPhases: [
      mkMv(['lagrange', 'Lagrange', 18.09, 26.4, 17.8, 45.0, 0.0, true]),
      mkMv(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 20.1, 38.6, 19.8, 120.0, 14.0, true]),
      mkMv(['citus-distributed-function', 'Citus 13 (Dist Function)', 22.9, 84.0, 22.4, 380.0, 65.0, true]),
      mkMv(['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 28.4, 62.0, 27.9, 240.0, 28.0, true]),
      mkMv(['tidb-tikv', 'TiDB + TiKV', 36.08, 92.4, 35.6, 310.0, 35.0, true]),
    ],
    scenarioCJointScaling: [
      mkSc(['lagrange', 'Lagrange', 584.2, 2420.0, 2420.0, 0.0, 0.0, 3.2, 1]),
      mkSc(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 408.6, 1590.0, 1590.0, 0.0, 28.0, 14.5, 2]),
      mkSc(['pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL', 316.8, 480.0, 480.0, 0.0, 0.0, 8.5, 1]),
      mkSc(['pg-valkey-sync-write-through', 'PG 17 + Valkey 8 (Sync)', 310.0, 890.0, 1620.0, 1.85, 640.0, 118.0, 3]),
      mkSc(['pg-valkey-async-stream', 'PG 17 + Valkey 8 (Async)', 0.0, 0.0, 2180.0, 11.4, 820.0, 165.0, 4]),
    ],
    operatingBoundaryMap: [
      mkOb('ordinary-oltp-single-region',
        'Contended SQL transactions without cross-partition compute',
        'PostgreSQL 17 (Single Primary / Patroni Sync HA)',
        'Avoids distributed consensus and multi-node 2PC overhead on pure SQL writes'),
      mkOb('single-key-colocated-analytics-udf',
        'Single-distribution-key local aggregation at LAN RTT (0.2 ms)',
        'Citus 13 (Distributed Function) / PG PL/pgSQL',
        'Routes directly to one colocated worker shard or primary with zero cross-entity hops'),
      mkOb('relaxed-staleness-precomputed-cache',
        'High-read-fanout feature lookups tolerating 100-1000 ms staleness',
        'PostgreSQL 17 + Valkey 8 (Async CDC Stream)',
        'Serves precomputed in-memory cache keys in 1 hop when stale reads and backfill lag are acceptable'),
      mkOb('multi-entity-cross-az-colocated-workflow',
        'Multi-stage cross-entity risk decisions at >= 2 ms RTT and 256 KB working sets',
        'Lagrange',
        'Forwards compact 48 B stage continuations across partition leaders without coordinator round trips'),
      mkOb('zero-stall-live-rebalance-and-0ms-freshness-scaleout',
        '5x joint ingestion/decision scale-out under 0 ms read-your-writes SLA and live movement',
        'Lagrange',
        'Combines zero-stall epoch-forwarded partition handoff (45 ms convergence) with 0 s rule-change backfill'),
    ],
  };
}
