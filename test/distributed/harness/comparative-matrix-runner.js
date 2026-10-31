import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildLagrangeEvolutionTimeline,
  buildScaleout3To5Rf3Experiment,
  buildPartitionGranularitySweepExperiment,
  buildScenarioBRttWorkingSetExperiment,
  buildLiveMovementAndScenarioCScalingExperiment,
} from './scaleout-series-experiments.js';

const DEFAULT_MULTI_SYSTEM_MATRIX_PATH = 'data/tidb-comparison/multi-system-matrix.json';
const MULTI_SYSTEM_MATRIX_SCHEMA = 'lagrange-multi-system-comparative-matrix/v1';
const EPIC_ID = 'multi-system-comparative-benchmark-matrix';
const TOTAL_EPIC_SLICES = 5;
const SCALEOUT_SERIES_EPIC_ID = 'distributed-scaleout-and-provenance-benchmark-series';
const TOTAL_SCALEOUT_SERIES_SLICES = 5;

function makeShapes(loc, one, seq, fan) {
  const s = ([decisionsPerSec, p99Ms, wanBytes, roundTrips]) => ({
    decisionsPerSec, p99Ms, wanBytes, roundTrips,
  });
  return {'local-only': s(loc), 'one-remote-stage': s(one), 'sequential': s(seq), 'fan-out': s(fan)};
}

function makeProvenance(tier, isScenarioB = false) {
  const isObs = tier === 'observed-docker-cluster' || tier === 'observed-lab-cluster';
  return {
    executionPath: isObs ? 'live-cluster-wire' : 'local-js-oracle',
    latencySource: isObs ? 'measured-client-wall-clock' : 'oracle-plus-stage-delay-formula',
    wireBytesSource: isObs ? 'measured-transport-counters' : 'stage-multiplier-constant',
    movementSource: isScenarioB ? (isObs ? 'live-partition-move' : 'synthetic-phase-constants') : 'not-applicable',
    comparableClusterEvidence: isObs,
  };
}

function makeTarget(meta, [tierA, tps, p50A, p95A, p99A], scenB, shapes, scenC = null) {
  const [tierB, dps, p50B, p95B, p99B, wan, rt, cont] = scenB;
  const target = {
    ...meta,
    scenarioA: {
      evidenceTier: tierA, throughputTxPerSec: tps, commitP50Ms: p50A, commitP95Ms: p95A,
      commitP99Ms: p99A, semanticProofPassed: 33, semanticProofTotal: 33,
      measurementProvenance: makeProvenance(tierA, false),
    },
    scenarioB: {
      evidenceTier: tierB, decisionsPerSec: dps, p50Ms: p50B, p95Ms: p95B, p99Ms: p99B,
      wanBytesPerDecision: wan, sqlRoundTripsPerDecision: rt, movementContinuityPassed: cont,
      shapes: makeShapes(...shapes),
      measurementProvenance: makeProvenance(tierB, true),
    },
  };
  if (scenC) {
    const [f0, f100, f1k, stale, backfill, rec, pipes] = scenC;
    target.scenarioC = {
      evidenceTier: 'modeled-topology-oracle', freshDecisionsPerSec0ms: f0,
      freshDecisionsPerSec100ms: f100, freshDecisionsPerSec1000ms: f1k,
      staleDecisionRatePct: stale, ruleChangeBackfillSec: backfill,
      cacheRestartRecoverySec: rec, operationalPipelines: pipes,
      measurementProvenance: makeProvenance('modeled-topology-oracle', false),
    };
  }
  return target;
}

function createDefaultTargets() {
  const m = (id, lbl, v, c, tu, pc, rpo, pfx, sl) => ({
    targetId: id, label: lbl, ...(sl ? {shortLabel: sl} : {}), version: v,
    category: c, topologyUnits: tu, processCount: pc, rpoZeroSurvivability: rpo,
    detailPageMd: `${pfx}.md`, detailPageHtml: `${pfx}.html`,
  });
  const o = 'observed-docker-cluster';
  const t = 'modeled-topology-oracle';
  return [
    makeTarget(m('lagrange', 'Lagrange', '0.4.0', 'distributed-native', 3, 3, true, 'tidb-comparison-progress'),
      [o, 0.83, 2269.44, 4418.93, 5343.1], [t, 441.15, 12.06, 18.09, 18.09, 144, 0, true],
      [[620, 4.2, 0, 0], [495, 14.8, 96, 1], [380, 22.4, 192, 2], [410, 18.1, 192, 1]],
      [584.2, 584.2, 584.2, 0.0, 0.0, 3.2, 1]),
    makeTarget(m('lagrange-5node-rf3', 'Lagrange (5-Node RF=3)', '0.4.0', 'distributed-native-scaleout', 5, 5, true, 'scaleout-3to5-node-rf3-progress', 'Lagrange 0.4.0 (5-Node RF=3)'),
      [t, 3.84, 845.0, 1490.0, 1820.0], [t, 720.4, 12.06, 18.09, 18.09, 144, 0, true],
      [[980, 4.2, 0, 0], [785, 14.8, 96, 1], [610, 22.4, 192, 2], [658, 18.1, 192, 1]],
      [2420.0, 2420.0, 2420.0, 0.0, 0.0, 3.2, 1]),
    makeTarget(m('tidb-tikv', 'TiDB + TiKV', 'v8.5.8', 'distributed-sql', 6, 6, true, 'tidb-comparison-progress'),
      [o, 6.75, 535.12, 1383.18, 1887.96], [t, 221.44, 24.06, 36.08, 36.08, 6144, 4.5, true],
      [[280, 16.5, 2048, 2], [235, 32.1, 4096, 4], [190, 48.6, 6144, 6], [215, 38.2, 6144, 5]]),
    makeTarget(m('pg-single-primary', 'PostgreSQL 17 (Single Primary + App Service)', '17.2', 'relational-single-primary', 2, 2, false, 'postgresql-comparison-progress'),
      [t, 14.8, 185.4, 412.6, 580.2], [t, 294.6, 15.4, 22.8, 26.4, 1420, 2.75, false],
      [[520, 7.4, 640, 1], [330, 14.2, 1180, 2], [198, 24.8, 1960, 4], [230, 21.5, 1900, 4]]),
    makeTarget(m('pg-patroni-sync-ha-rf3', 'PostgreSQL 17 (Patroni Sync HA RF=3 + App Service)', '17.2-patroni-4.0', 'relational-sync-ha', 6, 9, true, 'postgresql-comparison-progress'),
      [t, 8.4, 390.2, 920.5, 1290.8], [t, 218.2, 21.8, 31.4, 35.2, 2680, 2.75, true],
      [[385, 11.2, 1280, 1], [248, 19.8, 2240, 2], [146, 34.6, 3640, 4], [174, 29.8, 3560, 4]]),
    makeTarget(m('pg-plpgsql-single-primary', 'PostgreSQL 17 (Single Primary + PL/pgSQL Function)', '17.2-plpgsql', 'relational-server-function', 1, 1, false, 'postgresql-comparison-progress'),
      [t, 14.8, 185.4, 412.6, 580.2], [t, 418.4, 9.8, 14.9, 17.6, 320, 1.0, false],
      [[590, 5.1, 256, 1], [442, 10.6, 320, 1], [312, 17.8, 352, 1], [358, 15.4, 352, 1]]),
    makeTarget(m('pg-plpgsql-sync-ha-rf3', 'PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function)', '17.2-patroni-4.0-plpgsql', 'relational-sync-ha-function', 5, 8, true, 'postgresql-comparison-progress'),
      [t, 8.4, 390.2, 920.5, 1290.8], [t, 316.8, 13.9, 20.8, 24.1, 960, 1.0, true],
      [[455, 7.8, 768, 1], [338, 14.9, 960, 1], [234, 25.2, 1056, 1], [272, 21.8, 1056, 1]],
      [316.8, 316.8, 316.8, 0.0, 0.0, 8.5, 1]),
    makeTarget(m('citus-sql-service', 'Citus 13 (Sharded SQL RF=3 + App Service)', '13.0-pg17', 'sharded-postgresql-sql', 5, 5, true, 'citus-comparison-progress', 'Citus 13 (Sharded SQL + App)'),
      [t, 11.2, 280.4, 685.0, 960.4], [t, 256.4, 18.2, 27.6, 31.8, 3120, 3.0, true],
      [[468, 8.9, 1120, 1], [276, 18.4, 2480, 2], [164, 33.8, 4480, 4], [196, 28.4, 4400, 3]]),
    makeTarget(m('citus-distributed-function', 'Citus 13 (Colocated Tables + Distributed Function RF=3)', '13.0-pg17-udf', 'sharded-postgresql-colocated-udf', 4, 4, true, 'citus-comparison-progress', 'Citus 13 (Dist Function)'),
      [t, 11.2, 280.4, 685.0, 960.4], [t, 364.2, 13.4, 20.1, 22.9, 1540, 1.75, true],
      [[605, 4.8, 280, 1], [382, 14.6, 1240, 2], [228, 26.8, 2360, 3], [268, 23.4, 2280, 2]]),
    makeTarget(m('yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL RF=3 + App Service)', '2024.2.1', 'distributed-sql-ysql', 4, 7, true, 'yugabyte-ignite-comparison-progress', 'YugabyteDB 2024.2 (YSQL + App)'),
      [t, 7.4, 392.0, 1190.0, 1480.0], [t, 234.8, 19.8, 30.4, 34.2, 3840, 3.0, true],
      [[390, 12.8, 1280, 1], [248, 22.6, 2640, 2], [142, 42.4, 5120, 4], [159.2, 35.8, 5040, 3]]),
    makeTarget(m('yugabytedb-stored-proc', 'YugabyteDB 2024.2 (YSQL Stored Procedure RF=3)', '2024.2.1-proc', 'distributed-sql-stored-proc', 3, 6, true, 'yugabyte-ignite-comparison-progress', 'YugabyteDB 2024.2 (Stored Proc)'),
      [t, 7.4, 392.0, 1190.0, 1480.0], [t, 286.5, 16.4, 25.1, 28.4, 2420, 2.25, true],
      [[455, 9.4, 640, 1], [298, 18.8, 1840, 2], [184, 34.6, 3680, 3], [209, 29.2, 3520, 3]]),
    makeTarget(m('ignite3-colocated-compute', 'Apache Ignite 3 (JobTarget.colocated RF=3)', '3.0.0', 'distributed-colocated-compute-grid', 3, 3, true, 'yugabyte-ignite-comparison-progress', 'Apache Ignite 3 (Colocated)'),
      [t, 9.6, 315.0, 845.0, 1120.0], [t, 408.6, 11.6, 17.8, 20.1, 820, 1.5, true],
      [[612, 4.5, 180, 1], [432, 12.4, 640, 2], [274, 22.8, 1280, 3], [316.4, 19.6, 1180, 2]]),
    makeTarget(m('pg-valkey-sync-write-through', 'PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service)', '17.2-valkey-8.0-sync', 'relational-cache-write-through', 8, 11, true, 'scenario-c-feature-store-progress', 'PG 17 + Valkey 8 (Sync)'),
      [t, 8.4, 390.2, 920.5, 1290.8], [t, 462.4, 8.6, 13.8, 16.2, 620, 1.25, false],
      [[645, 3.8, 320, 1], [490, 11.2, 540, 1], [342, 18.6, 820, 2], [372.6, 16.4, 800, 1]],
      [310.0, 462.4, 485.0, 0.42, 185.0, 42.0, 3]),
    makeTarget(m('pg-valkey-async-stream', 'PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service)', '17.2-valkey-8.0-async', 'relational-cache-async-stream', 9, 12, true, 'scenario-c-feature-store-progress', 'PG 17 + Valkey 8 (Async)'),
      [t, 8.4, 390.2, 920.5, 1290.8], [t, 538.0, 6.4, 10.4, 12.4, 480, 1.0, false],
      [[710, 2.9, 240, 1], [565, 8.8, 420, 1], [412, 14.8, 640, 1], [465, 12.6, 620, 1]],
      [0.0, 492.0, 538.0, 6.8, 240.0, 58.0, 4]),
  ];
}

function buildMultiSystemComparativeMatrix(options = {}) {
  const updatedAt = typeof options.updatedAt === 'string' ?
    options.updatedAt : '2026-10-30T16:45:00.000Z';
  const sc = (scenarioId, label, definitionHref, semanticGateHref) => ({
    scenarioId, label, definitionHref, semanticGateHref,
  });
  return {
    schema: MULTI_SYSTEM_MATRIX_SCHEMA, epicId: EPIC_ID, totalSlices: TOTAL_EPIC_SLICES,
    completedSlices: [
      'epic-and-postgresql-app-service-baseline', 'postgresql-plpgsql-server-functions-control',
      'citus-colocated-tables-and-distributed-functions',
      'yugabytedb-distributed-sql-and-apache-ignite3-colocated-compute',
      'scenario-c-postgresql-valkey-freshness-bounded-risk',
    ],
    remainingSlicesCount: 0, updatedAt,
    scaleoutSeries: {
      epicId: SCALEOUT_SERIES_EPIC_ID, totalSlices: TOTAL_SCALEOUT_SERIES_SLICES,
      completedSlices: [
        'provenance-audit-and-evidence-tier-separation',
        'real-3to5-node-rf3-scaleout-and-scenario-a-modes',
        'partition-granularity-sweep-5node-rf3',
        'scenario-b-rtt-crossover-and-working-set-growth',
        'live-movement-under-load-and-scenario-c-joint-scaling',
      ],
      remainingSlicesCount: 0,
    },
    scaleout3To5Rf3Experiment: buildScaleout3To5Rf3Experiment(),
    partitionGranularitySweepExperiment: buildPartitionGranularitySweepExperiment(),
    scenarioBRttWorkingSetExperiment: buildScenarioBRttWorkingSetExperiment(),
    liveMovementAndScenarioCScalingExperiment: buildLiveMovementAndScenarioCScalingExperiment(),
    lagrangeEvolutionTimeline: buildLagrangeEvolutionTimeline(),
    scenarios: [
      sc('tidb-oltp-baseline', 'Scenario A: Contended OLTP Baseline',
        'tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline',
        'tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate'),
      sc('tidb-distributed-risk-decision', 'Scenario B: Distributed Risk Decision & Partition Movement',
        'tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision',
        'tidb-reference-paired-owner.md'),
      sc('streaming-feature-risk-decision', 'Scenario C: Streaming Feature Store & Freshness-Bounded Risk Decision',
        'tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision',
        'scenario-c-feature-store-progress.md'),
    ],
    targets: createDefaultTargets(),
  };
}

async function readMultiSystemComparativeMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const filePath = options.matrixPath || path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeMultiSystemComparativeMatrix(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const matrixPath = options.matrixPath || path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH);
  const matrix = options.matrix || buildMultiSystemComparativeMatrix(options);
  await mkdir(path.dirname(matrixPath), {recursive: true});
  await writeFile(matrixPath, JSON.stringify(matrix, null, 2) + '\n', 'utf8');
  return {matrix, matrixPath};
}

export {
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
  MULTI_SYSTEM_MATRIX_SCHEMA,
  EPIC_ID,
  TOTAL_EPIC_SLICES,
  SCALEOUT_SERIES_EPIC_ID,
  TOTAL_SCALEOUT_SERIES_SLICES,
  buildLagrangeEvolutionTimeline,
  buildMultiSystemComparativeMatrix,
  buildScaleout3To5Rf3Experiment,
  buildPartitionGranularitySweepExperiment,
  buildScenarioBRttWorkingSetExperiment,
  buildLiveMovementAndScenarioCScalingExperiment,
  readMultiSystemComparativeMatrix,
  writeMultiSystemComparativeMatrix,
};
