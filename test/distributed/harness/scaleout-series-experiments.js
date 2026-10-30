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
        mkA(['lagrange', 'Lagrange', 0.88, 4120.0, 0.83, 4418.93, -5.7, o]),
        mkA(['tidb-tikv', 'TiDB + TiKV', 6.9, 1310.0, 6.75, 1383.18, -2.2, o]),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)', 11.2, 685.0, 10.6, 730.0, -5.4]),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)', 7.4, 1190.0, 7.1, 1245.0, -4.1]),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 9.6, 845.0, 9.15, 890.0, -4.7]),
      ],
      'proportional-growth-scaleout': [
        mkA(['lagrange', 'Lagrange', 1.42, 2480.0, 2.24, 2590.0, 57.7]),
        mkA(['tidb-tikv', 'TiDB + TiKV', 7.85, 1120.0, 11.9, 1185.0, 51.6]),
        mkA(['citus-sql-service', 'Citus 13 (Sharded SQL + App)', 12.8, 590.0, 19.4, 625.0, 51.6]),
        mkA(['yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL + App)', 8.3, 1040.0, 12.4, 1095.0, 49.4]),
        mkA(['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 10.8, 740.0, 16.5, 780.0, 52.8]),
      ],
      'hot-contention-baseline': [
        mkA(['lagrange', 'Lagrange', 0.85, 4290.0, 0.79, 4580.0, -7.1]),
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
