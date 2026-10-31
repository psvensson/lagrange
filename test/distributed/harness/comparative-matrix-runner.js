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

function makeUnadmittedTarget(meta, hasScenarioC = false) {
  const shapes = {
    'local-only': {
      status: 'not measured',
      reason: 'Awaiting original GCP/lab execution receipt',
      decisionsPerSec: null,
      p99Ms: null,
      wanBytes: null,
      roundTrips: null,
    },
    'one-remote-stage': {
      status: 'not measured',
      reason: 'Awaiting original GCP/lab execution receipt',
      decisionsPerSec: null,
      p99Ms: null,
      wanBytes: null,
      roundTrips: null,
    },
    'sequential': {
      status: 'not measured',
      reason: 'Awaiting original GCP/lab execution receipt',
      decisionsPerSec: null,
      p99Ms: null,
      wanBytes: null,
      roundTrips: null,
    },
    'fan-out': {
      status: 'not measured',
      reason: 'Awaiting original GCP/lab execution receipt',
      decisionsPerSec: null,
      p99Ms: null,
      wanBytes: null,
      roundTrips: null,
    },
  };
  const target = {
    ...meta,
    scenarioA: {
      status: 'not measured',
      reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
      evidenceTier: 'none',
      throughputTxPerSec: null,
      commitP50Ms: null,
      commitP95Ms: null,
      commitP99Ms: null,
      semanticProofPassed: null,
      semanticProofTotal: 33,
      measurementProvenance: {
        executionPath: 'none',
        latencySource: 'not-measured',
        wireBytesSource: 'not-measured',
        movementSource: 'not-applicable',
        comparableClusterEvidence: false,
      },
    },
    scenarioB: {
      status: 'not measured',
      reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
      evidenceTier: 'none',
      decisionsPerSec: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      wanBytesPerDecision: null,
      sqlRoundTripsPerDecision: null,
      movementContinuityPassed: null,
      shapes,
      measurementProvenance: {
        executionPath: 'none',
        latencySource: 'not-measured',
        wireBytesSource: 'not-measured',
        movementSource: 'not-applicable',
        comparableClusterEvidence: false,
      },
    },
  };
  if (hasScenarioC) {
    target.scenarioC = {
      status: 'not measured',
      reason: 'Awaiting original GCP/lab execution receipt backed by real product processes and raw observations',
      evidenceTier: 'none',
      freshDecisionsPerSec0ms: null,
      freshDecisionsPerSec100ms: null,
      freshDecisionsPerSec1000ms: null,
      staleDecisionRatePct: null,
      ruleChangeBackfillSec: null,
      cacheRestartRecoverySec: null,
      operationalPipelines: null,
      measurementProvenance: {
        executionPath: 'none',
        latencySource: 'not-measured',
        wireBytesSource: 'not-measured',
        movementSource: 'not-applicable',
        comparableClusterEvidence: false,
      },
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
  return [
    makeUnadmittedTarget(m('lagrange', 'Lagrange', '0.4.0', 'distributed-native', 3, 3, true, 'tidb-comparison-progress'), true),
    makeUnadmittedTarget(m('lagrange-5node-rf3', 'Lagrange (5-Node RF=3)', '0.4.0', 'distributed-native-scaleout', 5, 5, true, 'scaleout-3to5-node-rf3-progress', 'Lagrange 0.4.0 (5-Node RF=3)'), true),
    makeUnadmittedTarget(m('tidb-tikv', 'TiDB + TiKV', 'v8.5.8', 'distributed-sql', 6, 6, true, 'tidb-comparison-progress')),
    makeUnadmittedTarget(m('pg-single-primary', 'PostgreSQL 17 (Single Primary + App Service)', '17.2', 'relational-single-primary', 2, 2, false, 'postgresql-comparison-progress')),
    makeUnadmittedTarget(m('pg-patroni-sync-ha-rf3', 'PostgreSQL 17 (Patroni Sync HA RF=3 + App Service)', '17.2-patroni-4.0', 'relational-sync-ha', 6, 9, true, 'postgresql-comparison-progress')),
    makeUnadmittedTarget(m('pg-plpgsql-single-primary', 'PostgreSQL 17 (Single Primary + PL/pgSQL Function)', '17.2-plpgsql', 'relational-server-function', 1, 1, false, 'postgresql-comparison-progress')),
    makeUnadmittedTarget(m('pg-plpgsql-sync-ha-rf3', 'PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function)', '17.2-patroni-4.0-plpgsql', 'relational-sync-ha-function', 5, 8, true, 'postgresql-comparison-progress'), true),
    makeUnadmittedTarget(m('citus-sql-service', 'Citus 13 (Sharded SQL RF=3 + App Service)', '13.0-pg17', 'sharded-postgresql-sql', 5, 5, true, 'citus-comparison-progress', 'Citus 13 (Sharded SQL + App)')),
    makeUnadmittedTarget(m('citus-distributed-function', 'Citus 13 (Colocated Tables + Distributed Function RF=3)', '13.0-pg17-udf', 'sharded-postgresql-colocated-udf', 4, 4, true, 'citus-comparison-progress', 'Citus 13 (Dist Function)')),
    makeUnadmittedTarget(m('yugabytedb-ysql-rf3', 'YugabyteDB 2024.2 (YSQL RF=3 + App Service)', '2024.2.1', 'distributed-sql-ysql', 4, 7, true, 'yugabyte-ignite-comparison-progress', 'YugabyteDB 2024.2 (YSQL + App)')),
    makeUnadmittedTarget(m('yugabytedb-stored-proc', 'YugabyteDB 2024.2 (YSQL Stored Procedure RF=3)', '2024.2.1-proc', 'distributed-sql-stored-proc', 3, 6, true, 'yugabyte-ignite-comparison-progress', 'YugabyteDB 2024.2 (Stored Proc)')),
    makeUnadmittedTarget(m('ignite3-colocated-compute', 'Apache Ignite 3 (JobTarget.colocated RF=3)', '3.0.0', 'distributed-colocated-compute-grid', 3, 3, true, 'yugabyte-ignite-comparison-progress', 'Apache Ignite 3 (Colocated)')),
    makeUnadmittedTarget(m('pg-valkey-sync-write-through', 'PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service)', '17.2-valkey-8.0-sync', 'relational-cache-write-through', 8, 11, true, 'scenario-c-feature-store-progress', 'PG 17 + Valkey 8 (Sync)'), true),
    makeUnadmittedTarget(m('pg-valkey-async-stream', 'PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service)', '17.2-valkey-8.0-async', 'relational-cache-async-stream', 9, 12, true, 'scenario-c-feature-store-progress', 'PG 17 + Valkey 8 (Async)'), true),
  ];
}

function buildMultiSystemComparativeMatrix(options = {}) {
  const updatedAt = typeof options.updatedAt === 'string' ?
    options.updatedAt : '2026-10-31T09:00:00.000Z';
  const sc = (scenarioId, label, definitionHref, semanticGateHref) => ({
    scenarioId, label, definitionHref, semanticGateHref,
  });
  return {
    schema: MULTI_SYSTEM_MATRIX_SCHEMA,
    epicId: EPIC_ID,
    totalSlices: TOTAL_EPIC_SLICES,
    completedSlices: [],
    remainingSlicesCount: TOTAL_EPIC_SLICES,
    updatedAt,
    scaleoutSeries: {
      epicId: SCALEOUT_SERIES_EPIC_ID,
      totalSlices: TOTAL_SCALEOUT_SERIES_SLICES,
      completedSlices: [],
      remainingSlicesCount: TOTAL_SCALEOUT_SERIES_SLICES,
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
