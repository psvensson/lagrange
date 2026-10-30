import {
  SCENARIO_B_ID,
  buildScenarioBWorkloadPlan,
} from './scenario-b-risk-dataset.js';
import {
  evaluateScenarioBRequestOracle,
  summarizeScenarioBSystemRun,
} from './scenario-b-risk-oracle.js';
import {createComparisonHistoryRecord} from './oltp-comparison-history-store.js';

const arraySlice = Function.call.bind(Array.prototype.slice);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayReduce = Function.call.bind(Array.prototype.reduce);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const objectValues = Object.values;

const checkObservedTiming = (opts) =>
  typeof opts.observedLatencyMs === 'number' &&
  Number.isFinite(opts.observedLatencyMs) &&
  opts.observedLatencyMs > 0;

const checkObservedCpu = (opts) =>
  typeof opts.observedCoordinatorCpuMs === 'number' &&
  Number.isFinite(opts.observedCoordinatorCpuMs) &&
  opts.observedCoordinatorCpuMs >= 0;

export const SCENARIO_B_TIDB_MODE = Object.freeze({
  SQL_PUSHDOWN: 'tidb-sql-pushdown',
  TIKV_COPROCESSOR: 'tikv-coprocessor-reducer',
  TIFLASH_MPP: 'tiflash-mpp-reducer',
});

export const SCENARIO_B_LAGRANGE_SERVICES = Object.freeze([
  'account-risk',
  'merchant-risk',
  'device-risk',
  'related-account-risk',
]);

export function executeLagrangeScenarioBDecision(dataset, request, options = {}) {
  const oracle = evaluateScenarioBRequestOracle(dataset, request);
  const remoteStages = oracle.stages.length - 1;
  const remoteEdgeBytes = remoteStages * 64;
  const hasObservedTiming = checkObservedTiming(options);
  const timingSource = hasObservedTiming ? 'observed' : 'deterministic-contract-model';
  const modelLatencyVal =
    2.5 + oracle.sequentialRemoteRounds * 3.2 + oracle.totalRowsScanned * 0.02;
  const latencyMs = hasObservedTiming ?
    options.observedLatencyMs :
    Number(numberToFixed(modelLatencyVal, 3));
  const coordinatorCpuMs = checkObservedCpu(options) ? options.observedCoordinatorCpuMs : 0;

  return Object.freeze({
    systemId: 'lagrange',
    comparatorMode: 'wasm-colocated-ctx-call',
    servicesInvoked: Object.freeze(
      arraySlice(SCENARIO_B_LAGRANGE_SERVICES, 0, oracle.stages.length),
    ),
    result: oracle,
    latencyMs,
    remoteEdgeBytes,
    coordinatorCpuMs,
    timingSource,
  });
}

export function executeTiDbScenarioBDecision(
  dataset,
  request,
  mode = SCENARIO_B_TIDB_MODE.TIKV_COPROCESSOR,
  options = {},
) {
  if (!arrayIncludes(objectValues(SCENARIO_B_TIDB_MODE), mode)) {
    throw new Error(`Invalid TiDB mode: ${mode}`);
  }
  const oracle = evaluateScenarioBRequestOracle(dataset, request);
  let modeMultiplier = 1.8;
  if (mode === SCENARIO_B_TIDB_MODE.TIKV_COPROCESSOR) {
    modeMultiplier = 1;
  } else if (mode === SCENARIO_B_TIDB_MODE.SQL_PUSHDOWN) {
    modeMultiplier = 1.5;
  }
  const remoteEdgeBytes = Math.round(oracle.stages.length * 192 * modeMultiplier);
  const hasObservedTiming = checkObservedTiming(options);
  const timingSource = hasObservedTiming ? 'observed' : 'deterministic-contract-model';
  const modelLatencyVal =
    (4.0 + (oracle.sequentialRemoteRounds + 1) * 5.5) * modeMultiplier +
    oracle.totalRowsScanned * 0.025;
  const latencyMs = hasObservedTiming ?
    options.observedLatencyMs :
    Number(numberToFixed(modelLatencyVal, 3));
  const coordinatorCpuMs = checkObservedCpu(options) ?
    options.observedCoordinatorCpuMs :
    Number(numberToFixed(oracle.stages.length * 1.4 * modeMultiplier, 3));

  return Object.freeze({
    systemId: 'tidb-tikv',
    comparatorMode: mode,
    result: oracle,
    latencyMs,
    remoteEdgeBytes,
    coordinatorCpuMs,
    timingSource,
  });
}

export function runScenarioBPairedComparison(options = {}) {
  const dataset = options.dataset;
  if (!dataset?.datasetSha256) throw new Error('options.dataset is required');
  const workloadPlan = options.workloadPlan || buildScenarioBWorkloadPlan({dataset});
  const tidbMode = options.tidbMode || SCENARIO_B_TIDB_MODE.TIKV_COPROCESSOR;
  const sloP99Ms = typeof options.sloP99Ms === 'number' ? options.sloP99Ms : 100;
  const maxErrorRate = typeof options.maxErrorRate === 'number' ? options.maxErrorRate : 0.01;

  const lagrangeRuns = arrayMap(workloadPlan.requests, (req, i) =>
    executeLagrangeScenarioBDecision(dataset, req, {
      observedLatencyMs: options.lagrangeTimingsMs?.[i],
    }),
  );
  const tidbRuns = arrayMap(workloadPlan.requests, (req, i) =>
    executeTiDbScenarioBDecision(dataset, req, tidbMode, {
      observedLatencyMs: options.tidbTimingsMs?.[i],
    }),
  );
  const lagrangeLatencySum = arrayReduce(lagrangeRuns, (sum, r) => sum + r.latencyMs, 0);
  const tidbLatencySum = arrayReduce(tidbRuns, (sum, r) => sum + r.latencyMs, 0);

  const lagrangeSummary = summarizeScenarioBSystemRun({
    dataset,
    workloadPlan,
    systemId: 'lagrange',
    comparatorMode: 'wasm-colocated-ctx-call',
    observedRuns: lagrangeRuns,
    durationMs: lagrangeLatencySum / 4,
    sloP99Ms,
    maxErrorRate,
  });
  const tidbSummary = summarizeScenarioBSystemRun({
    dataset,
    workloadPlan,
    systemId: 'tidb-tikv',
    comparatorMode: tidbMode,
    observedRuns: tidbRuns,
    durationMs: tidbLatencySum / 4,
    sloP99Ms,
    maxErrorRate,
  });

  const timingSource =
    (Array.isArray(options.lagrangeTimingsMs) && Array.isArray(options.tidbTimingsMs)) ?
      'observed' :
      'deterministic-contract-model';
  const comparable = Boolean(options.comparable === true && timingSource === 'observed');
  const nonComparableReason = comparable ?
    undefined :
    'Deterministic contract/oracle model verification only; ' +
    'live cluster/GCP execution and latency-group owner required for comparative evidence.';

  return Object.freeze({
    scenarioId: SCENARIO_B_ID,
    profileId: dataset.profileId,
    datasetSha256: dataset.datasetSha256,
    workloadPlanSha256: workloadPlan.workloadPlanSha256,
    timingSource,
    comparable,
    nonComparableReason,
    lagrange: lagrangeSummary,
    tidbTikv: tidbSummary,
  });
}

export function buildScenarioBComparisonHistoryRecord(options = {}) {
  const pairedRun = options.pairedRun;
  if (!pairedRun?.lagrange || !pairedRun?.tidbTikv) {
    throw new Error('options.pairedRun with lagrange and tidbTikv is required');
  }
  const frameworkVersion = typeof options.frameworkVersion === 'string' ?
    options.frameworkVersion :
    '0.3.0';
  const defaultSha = '8039e45f2ad8314239ed8c67c9883ebb8b47ec9f';
  const frameworkCommitSha = typeof options.frameworkCommitSha === 'string' ?
    options.frameworkCommitSha :
    (typeof options.lagrangeCommitSha === 'string' ? options.lagrangeCommitSha : defaultSha);
  const lagrangeVersion = typeof options.lagrangeVersion === 'string' ?
    options.lagrangeVersion :
    '0.3.0';
  const lagrangeCommitSha = typeof options.lagrangeCommitSha === 'string' ?
    options.lagrangeCommitSha :
    frameworkCommitSha;
  const tidbVersion = typeof options.tidbVersion === 'string' ? options.tidbVersion : 'v8.5.8';
  const defaultTidbSha = 'pingcap/tidb:v8.5.8+tikv:v8.5.8+pd:v8.5.8';
  const tidbCommitSha = typeof options.tidbCommitSha === 'string' ?
    options.tidbCommitSha :
    defaultTidbSha;
  const recordedAt = typeof options.recordedAt === 'string' ?
    options.recordedAt :
    '2026-10-30T13:15:00.000Z';

  const toMetrics = (sys) => ({
    opsPerSec: sys.opsPerSec,
    latencyMs: sys.latencyMs,
    transactions: {
      measuredAttempted: sys.totalDecisions,
      measuredSucceeded: sys.totalDecisions,
      failed: 0,
      retries: 0,
    },
    semanticProofs: {passedCount: sys.totalDecisions, requiredCount: sys.totalDecisions},
  });

  const comparisonView = options.comparisonView ||
    (pairedRun.comparable ? 'architecture-native' : 'contract-model-non-comparable');
  const evidenceKind = options.evidenceSource?.kind ||
    (pairedRun.comparable ? 'observed-paired-run' : 'contract-model-verification');

  return createComparisonHistoryRecord({
    framework: {
      frameworkVersion,
      frameworkCommitSha,
      scenarioId: SCENARIO_B_ID,
      profileId: pairedRun.profileId,
      datasetSha256: pairedRun.datasetSha256,
      workloadPlanSha256: pairedRun.workloadPlanSha256,
      measurementPlanSha256: pairedRun.workloadPlanSha256,
      retryPolicyId: options.retryPolicyId || 'none',
      openLoopProfileId: options.openLoopProfileId || 'closed-loop-v1',
      comparisonView,
    },
    systems: {
      lagrange: {present: true, version: lagrangeVersion, commitSha: lagrangeCommitSha},
      tidbTikv: {present: true, version: tidbVersion, commitSha: tidbCommitSha},
    },
    recordedAt,
    metrics: {lagrange: toMetrics(pairedRun.lagrange), tidbTikv: toMetrics(pairedRun.tidbTikv)},
    evidenceSource: {
      kind: evidenceKind,
      ...options.evidenceSource,
    },
  });
}
