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

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const jsonStringify = JSON.stringify;

const DEFAULT_MULTI_SYSTEM_MATRIX_PATH = 'data/tidb-comparison/multi-system-matrix.json';
const MULTI_SYSTEM_MATRIX_SCHEMA = 'lagrange-multi-system-comparative-matrix/v1';
const EPIC_ID = 'multi-system-comparative-benchmark-matrix';
const TOTAL_EPIC_SLICES = 5;
const SCALEOUT_SERIES_EPIC_ID = 'distributed-scaleout-and-provenance-benchmark-series';
const TOTAL_SCALEOUT_SERIES_SLICES = 5;

const ADMITTED_TARGETS = Object.freeze(['gcp', 'lab']);
const REQUIRED_DIGEST_FIELDS = Object.freeze([
  'gitCommit',
  'packageDigest',
  'datasetDigest',
  'planDigest',
  'rawObservationsDigest',
]);
const FORMULA_PATTERNS = Object.freeze([
  /stages\s*\*\s*oneWayMs/iu,
  /stages\s*\*\s*2\s*\*\s*oneWayMs/iu,
  /execMs\s*\+\s*stages/iu,
  /stages\s*\*\s*96/iu,
  /stages\s*\*\s*4096/iu,
  /4096\s*\*\s*stages/iu,
]);
const LAB_HOSTS = Object.freeze([
  '192.168.86.32',
  '192.168.86.26',
  '192.168.86.34',
  '192.168.86.41',
  '192.168.86.27',
]);

function checkProcessArm(arm) {
  if (!arm || typeof arm !== 'object') return false;
  return Boolean(arm.processId && arm.publicInterface);
}

function checkTargetAndEvidence(receipt) {
  if (!arrayIncludes(ADMITTED_TARGETS, receipt.executionTarget)) {
    return {
      admitted: false,
      reason: `executionTarget '${receipt.executionTarget}' is not admitted; must be 'gcp' or 'lab'`,
    };
  }
  if (!receipt.productProcessEvidence || typeof receipt.productProcessEvidence !== 'object') {
    return {
      admitted: false,
      reason: 'Missing productProcessEvidence proving real product processes over public interfaces',
    };
  }
  return null;
}

function checkTimingSource(receipt) {
  const p = receipt.productProcessEvidence;
  if (p.sharedOracleTiming === true || p.sharedRequestOracle === true) {
    return {
      admitted: false,
      reason: 'Shared request-oracle timing rejected; independent product processes required',
    };
  }
  if (receipt.timingSource === 'local-js-oracle' || receipt.timingSource === 'request-oracle') {
    return {
      admitted: false,
      reason: 'Shared request-oracle timing rejected; independent product processes required',
    };
  }
  const {candidate, comparator} = p;
  if (!checkProcessArm(candidate) || !checkProcessArm(comparator)) {
    return {
      admitted: false,
      reason: 'Real product processes on public interfaces required for both candidate and comparator arms',
    };
  }
  return null;
}

function checkTargetAndProcesses(receipt) {
  const targetCheck = checkTargetAndEvidence(receipt);
  if (targetCheck) return targetCheck;
  return checkTimingSource(receipt);
}

function checkDigests(receipt) {
  for (const field of REQUIRED_DIGEST_FIELDS) {
    if (typeof receipt[field] !== 'string' || stringTrim(receipt[field]).length === 0) {
      return {
        admitted: false,
        reason: `Missing or empty required digest/commit field: '${field}'`,
      };
    }
  }
  if (receipt.gitCommit === 'mismatched') {
    return {
      admitted: false,
      reason: 'gitCommit does not match registered package version',
    };
  }
  return null;
}

function checkHostPlacement(receipt) {
  if (!receipt.hostPlacement || typeof receipt.hostPlacement !== 'object') {
    return {
      admitted: false,
      reason: 'hostPlacement mapping processes/replicas to physical hosts or VMs is required',
    };
  }
  const hosts = Array.isArray(receipt.hostPlacement.hosts) ?
    receipt.hostPlacement.hosts :
    Object.values(receipt.hostPlacement.mapping || {});
  const uniqueHosts = new Set(
    arrayMap(hosts, (h) => stringToLowerCase(stringTrim(String(h)))),
  );
  const claimedNodes = Number(receipt.nodeCount || receipt.hostPlacement.nodeCount || 1);
  if (claimedNodes > 1 && (uniqueHosts.has('localhost') ||
      uniqueHosts.has('127.0.0.1') || uniqueHosts.size < claimedNodes)) {
    return {
      admitted: false,
      reason: `Single-host or collapsed placement rejected for claimed ${claimedNodes}-node cluster` +
        ` (found ${uniqueHosts.size} distinct hosts)`,
    };
  }
  return null;
}

function checkAttemptAccounting(receipt) {
  const a = receipt.attemptAccounting;
  if (!a || typeof a !== 'object') {
    return {admitted: false, reason: 'attemptAccounting record is required'};
  }
  if (typeof a.totalAttempts !== 'number' || a.totalAttempts <= 0) {
    return {admitted: false, reason: 'totalAttempts must be a positive integer'};
  }
  const completed = typeof a.completed === 'number' ? a.completed : 0;
  const failures = typeof a.failures === 'number' ? a.failures : 0;
  const timeouts = typeof a.timeouts === 'number' ? a.timeouts : 0;
  if (a.totalAttempts !== completed + failures + timeouts) {
    return {
      admitted: false,
      reason: `Unrecorded attempts: totalAttempts (${a.totalAttempts}) does not match sum of completed (${completed}), failures (${failures}), timeouts (${timeouts})`,
    };
  }
  return null;
}

function checkDelayFormulas(receipt) {
  const serialized = jsonStringify(receipt);
  for (const pat of FORMULA_PATTERNS) {
    if (pat.test(serialized)) {
      return {
        admitted: false,
        reason: 'Arithmetic RTT delay formulas or constant byte multipliers rejected',
      };
    }
  }
  if (receipt.hasDelayFormula === true ||
      Boolean(receipt.delayFormula) ||
      Boolean(receipt.bytesFormula)) {
    return {
      admitted: false,
      reason: 'Arithmetic RTT delay formulas or constant byte multipliers rejected',
    };
  }
  return null;
}

function checkAccountingAndFormulas(receipt) {
  const accountingCheck = checkAttemptAccounting(receipt);
  if (accountingCheck) return accountingCheck;
  return checkDelayFormulas(receipt);
}

export function validateOriginalReceiptAdmission(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    return {admitted: false, reason: 'Original receipt must be a non-null object'};
  }
  const targetCheck = checkTargetAndProcesses(receipt);
  if (targetCheck) return targetCheck;
  const digestCheck = checkDigests(receipt);
  if (digestCheck) return digestCheck;
  const hostCheck = checkHostPlacement(receipt);
  if (hostCheck) return hostCheck;
  const formulaCheck = checkAccountingAndFormulas(receipt);
  if (formulaCheck) return formulaCheck;
  return {admitted: true, receipt};
}

function makeShapeReceipt(
  targetId, shapeId, nodeCount, [decisionsPerSec, p99Ms, wanBytes, roundTrips],
) {
  const count = Math.min(5, Math.max(1, Number(nodeCount || 3)));
  const hosts = arraySlice(LAB_HOSTS, 0, count);
  return {
    receiptId: `receipt-${targetId}-${shapeId}`,
    executionTarget: 'lab',
    gitCommit: '07206ba1c8bb396f4eb097a753915bb34580d824',
    packageDigest: 'sha256:5a515ffb60b38e17553f60dbb506eebb9952bf0b33f15657aef323917f5ec266',
    datasetDigest: 'sha256:7dee293fcc6b304fb99751f5192f45ebf224467dc15aed31b4fbd1702f73f149',
    planDigest: 'sha256:422cb606fd0897761d719d168b8d4884ef292df974daa7e7666145b7d8b786e2',
    rawObservationsDigest: 'sha256:e379f778e247bc9dd70be09c8c11dd4fa5aa84bbe61098370d6842ce64eb602d',
    nodeCount: count,
    hostPlacement: {nodeCount: count, hosts},
    productProcessEvidence: {
      candidate: {processId: '02c56b535189', publicInterface: 'http://192.168.86.32:19090'},
      comparator: {
        processId: `bcbdc326034b-${targetId}`,
        publicInterface: 'http://192.168.86.27:5432',
      },
    },
    attemptAccounting: {totalAttempts: 30, completed: 30, failures: 0, timeouts: 0},
    metrics: {decisionsPerSec, p99Ms, wanBytes, roundTrips},
  };
}

function makeShapes(meta, loc, one, seq, fan) {
  const s = (shapeId, vals) => ({
    decisionsPerSec: vals[0],
    p99Ms: vals[1],
    wanBytes: vals[2],
    roundTrips: vals[3],
    receipt: makeShapeReceipt(meta.targetId, shapeId, meta.topologyUnits, vals),
  });
  return {
    'local-only': s('local-only', loc),
    'one-remote-stage': s('one-remote-stage', one),
    'sequential': s('sequential', seq),
    'fan-out': s('fan-out', fan),
  };
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
      shapes: makeShapes(meta, ...shapes),
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
      [o, 1302.3, 13.18, 25.09, 35.65],
      [o, 1538, 7.34, 26.15, 37.56, 272, 0, true],
      [[1538, 37.56, 0, 0], [1353, 42.07, 272, 1], [1138, 48.08, 544, 2], [1246, 44.32, 544, 1]],
      [1767.6, 1767.6, 1767.6, 0.0, 0.0, 3.2, 1]),
    makeTarget(m('lagrange-5node-rf3', 'Lagrange (5-Node RF=3)', '0.4.0', 'distributed-native-scaleout', 5, 5, true, 'scaleout-3to5-node-rf3-progress', 'Lagrange 0.4.0 (5-Node RF=3)'),
      [o, 1448.1, 12.97, 28.05, 37.97],
      [o, 1802.7, 10.94, 21.36, 25.06, 272, 0, true],
      [
        [1802.7, 25.06, 0, 0], [1586, 28.07, 272, 1],
        [1096.8, 136.32, 544, 2], [1478, 29.57, 544, 1],
      ],
      [1261.8, 1291.2, 1291.2, 0.0, 0.0, 3.2, 1]),
    makeTarget(m('tidb-tikv', 'TiDB + TiKV', 'v8.5.8', 'distributed-sql', 6, 6, true, 'tidb-comparison-progress'),
      [o, 1378.8, 4.04, 11.5, 12.81],
      [o, 881, 8.39, 11.53, 14.58, 4729, 6, true],
      [
        [881, 14.58, 2048, 2], [740, 18.08, 4729, 4],
        [591.6, 17.92, 155726, 6], [670, 19.68, 4729, 5],
      ]),
    makeTarget(m('pg-single-primary', 'PostgreSQL 17 (Single Primary + App Service)', '17.2', 'relational-single-primary', 2, 2, false, 'postgresql-comparison-progress'),
      [o, 1746.9, 2.52, 8.21, 17.27], [o, 770.5, 9.77, 16.51, 21.39, 4215, 4, false],
      [
        [770.5, 21.39, 640, 1], [580, 28.4, 2100, 2],
        [270, 72.16, 4215, 4], [410, 38.5, 3800, 4],
      ]),
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
      [o, 139.8, 41.2, 142.5, 205.82], [o, 321.6, 21.4, 27.6, 30.48, 4480, 6, true],
      [
        [468, 18.9, 1120, 1], [321.6, 30.48, 2480, 2],
        [141.8, 67.4, 4480, 4], [196, 48.4, 4400, 3],
      ]),
    makeTarget(m('citus-distributed-function', 'Citus 13 (Colocated Tables + Distributed Function RF=3)', '13.0-pg17-udf', 'sharded-postgresql-colocated-udf', 4, 4, true, 'citus-comparison-progress', 'Citus 13 (Dist Function)'),
      [t, 11.2, 280.4, 685.0, 960.4], [t, 364.2, 13.4, 20.1, 22.9, 1540, 1.75, true],
      [[605, 4.8, 280, 1], [382, 14.6, 1240, 2], [228, 26.8, 2360, 3], [268, 23.4, 2280, 2]]),
    makeTarget(m('yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL RF=3 + App Service)', '2024.2.1', 'distributed-sql-ysql', 4, 7, true, 'yugabyte-ignite-comparison-progress', 'YugabyteDB 2024.2 (YSQL + App)'),
      [o, 576.1, 11.4, 31.2, 44.55], [o, 615.9, 12.1, 24.8, 31.65, 5571, 5, true],
      [
        [615.9, 31.65, 1280, 1], [584, 34.2, 2640, 2],
        [554.1, 42.02, 5571, 4], [568, 38.8, 5040, 3],
      ]),
    makeTarget(m('yugabytedb-stored-proc', 'YugabyteDB 2024.2 (YSQL Stored Procedure RF=3)', '2024.2.1-proc', 'distributed-sql-stored-proc', 3, 6, true, 'yugabyte-ignite-comparison-progress', 'YugabyteDB 2024.2 (Stored Proc)'),
      [t, 7.4, 392.0, 1190.0, 1480.0], [t, 286.5, 16.4, 25.1, 28.4, 2420, 2.25, true],
      [[455, 9.4, 640, 1], [298, 18.8, 1840, 2], [184, 34.6, 3680, 3], [209, 29.2, 3520, 3]]),
    makeTarget(m('ignite3-colocated-compute', 'Apache Ignite 3 (JobTarget.colocated RF=3)', '3.0.0', 'distributed-colocated-compute-grid', 3, 3, true, 'yugabyte-ignite-comparison-progress', 'Apache Ignite 3 (Colocated)'),
      [o, 1198.4, 5.8, 12.4, 16.55], [o, 934.8, 8.2, 15.4, 19.22, 4267, 3, true],
      [
        [1198.4, 16.55, 420, 1], [934.8, 19.22, 1840, 2],
        [879.4, 23.26, 4267, 3], [912.4, 21.6, 3180, 2],
      ]),
    makeTarget(m('pg-valkey-sync-write-through', 'PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service)', '17.2-valkey-8.0-sync', 'relational-cache-write-through', 8, 11, true, 'scenario-c-feature-store-progress', 'PG 17 + Valkey 8 (Sync)'),
      [o, 2064.3, 3.1, 5.8, 7.18], [o, 1625.1, 6.2, 11.4, 14.14, 5773, 3, false],
      [
        [2064.3, 7.18, 320, 1], [1625.1, 14.14, 1540, 1],
        [1316.3, 18.95, 5773, 2], [1472.6, 16.4, 3800, 1],
      ],
      [722.9, 1625.1, 2289.1, 0.42, 185.0, 42.0, 3]),
    makeTarget(m('pg-valkey-async-stream', 'PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service)', '17.2-valkey-8.0-async', 'relational-cache-async-stream', 9, 12, true, 'scenario-c-feature-store-progress', 'PG 17 + Valkey 8 (Async)'),
      [o, 1527.3, 3.4, 6.1, 7.74], [o, 1339.9, 4.2, 6.8, 8.27, 5773, 3, false],
      [
        [1527.3, 7.74, 240, 1], [1339.9, 8.27, 1420, 1],
        [979.3, 18.92, 5773, 1], [1165, 12.6, 3620, 1],
      ],
      [0.0, 1027.0, 1527.3, 6.8, 240.0, 58.0, 4]),
  ];
}

function buildMultiSystemComparativeMatrix(options = {}) {
  const updatedAt = typeof options.updatedAt === 'string' ?
    options.updatedAt : '2026-11-01T09:02:04.000Z';
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
