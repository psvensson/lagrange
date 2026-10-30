import {COMPARISON_VIEW} from './comparative-system-budget.js';
import {buildOltpBaselineDataset} from './oltp-baseline-dataset.js';
import {buildOltpBaselinePlan} from './oltp-baseline-workload.js';
import {createComparisonHistoryRecord} from './oltp-comparison-history-store.js';
import {interleaveOltpWorkerPhase, runOpenLoopOltpStep} from './oltp-open-loop-step-owner.js';
import {buildScenarioAPairedSweepPlan} from './oltp-paired-sweep-plan.js';
import {evaluateScenarioSystemVersionGate} from './scenario-b-fairness-gate.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

const OLTP_PAIRED_SWEEP_RUNNER_VERSION = 'scenario-a-open-loop-paired-sweep-runner-v1';

function calculateMedian(values) {
  if (!values || values.length === 0) return 0;
  const sorted = arraySort(arraySlice(values), (a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function extractStepTotalScheduled(r) {
  return Number(r?.totalScheduled ?? r?.attempted ?? 0);
}

function extractStepCompletedOk(r) {
  return Number(r?.completedOk ?? r?.succeeded ?? 0);
}

function extractStepFailedCount(r) {
  if (r?.failedCount !== undefined && r?.failedCount !== null) {
    return Number(r.failedCount);
  }
  return Number(r?.failed ?? 0) + Number(r?.timedOut ?? 0);
}

function resolveP99Latency(r) {
  if (r?.overallLatencyMs?.p99 !== undefined) return Number(r.overallLatencyMs.p99);
  if (r?.latency?.p99 !== undefined) return Number(r.latency.p99);
  return Number(r?.p99Ms ?? 0);
}

function extractStepAchievedCompletedPerSec(r) {
  return Number(r?.achievedCompletedPerSec ?? r?.completedPerSec ?? 0);
}

function extractStepLatency(stepReport) {
  return stepReport?.overallLatencyMs ?? stepReport?.latency ?? {p99: 0};
}

function resolveSloLimits(sloConfig) {
  const sloP99LimitMs = Number(sloConfig?.p99Ms ?? 50);
  const sloMaxErrorRate = Number(sloConfig?.maxErrorRate ?? 0.001);
  return {sloP99LimitMs, sloMaxErrorRate};
}

function checkSloPass({
  totalScheduled, completedOk, p99Ms, errorRate, sloP99LimitMs, sloMaxErrorRate,
}) {
  const hasRuns = totalScheduled > 0;
  const latencyPass = hasRuns && completedOk > 0 && p99Ms <= sloP99LimitMs;
  const errorRatePass = hasRuns && errorRate <= sloMaxErrorRate;
  const sloPass = latencyPass && errorRatePass;
  return {latencyPass, errorRatePass, sloPass};
}

function evaluateOltpSweepStepSlo(stepReport, sloConfig = {}) {
  const totalScheduled = extractStepTotalScheduled(stepReport);
  const completedOk = extractStepCompletedOk(stepReport);
  const failedCount = extractStepFailedCount(stepReport);
  const p99Ms = resolveP99Latency(stepReport);
  const achievedCompletedPerSec = extractStepAchievedCompletedPerSec(stepReport);
  const offeredRatePerSec = Number(stepReport?.offeredRatePerSec ?? 0);
  const {sloP99LimitMs, sloMaxErrorRate} = resolveSloLimits(sloConfig);
  const errorRate = totalScheduled > 0 ? failedCount / totalScheduled : 1;

  const {latencyPass, errorRatePass, sloPass} = checkSloPass({
    totalScheduled, completedOk, p99Ms, errorRate, sloP99LimitMs, sloMaxErrorRate,
  });

  return Object.freeze({
    offeredRatePerSec, achievedCompletedPerSec, totalScheduled, completedOk, failedCount,
    errorRate, p99Ms, sloP99LimitMs, sloMaxErrorRate, latencyPass, errorRatePass, sloPass,
  });
}

function buildRatePoint(rate, matchingRuns, sloConfig) {
  const evaluations = [];
  const completedPerSecs = [];
  const p99s = [];
  const errorRates = [];
  for (const run of matchingRuns) {
    const evaluation = evaluateOltpSweepStepSlo(run.stepReport, sloConfig);
    arrayPush(evaluations, evaluation);
    arrayPush(completedPerSecs, evaluation.achievedCompletedPerSec);
    arrayPush(p99s, evaluation.p99Ms);
    arrayPush(errorRates, evaluation.errorRate);
  }
  const allRepetitionsPassSlo = evaluations.length > 0 &&
    arrayFilter(evaluations, (e) => e.sloPass).length === evaluations.length;

  return Object.freeze({
    offeredRatePerSec: rate,
    repetitionCount: evaluations.length,
    medianCompletedPerSec: calculateMedian(completedPerSecs),
    medianP99Ms: calculateMedian(p99s),
    worstP99Ms: p99s.length > 0 ? Math.max(...p99s) : 0,
    worstErrorRate: errorRates.length > 0 ? Math.max(...errorRates) : 1,
    allRepetitionsPassSlo,
    evaluations: Object.freeze(evaluations),
  });
}

function findBestPassingPoint(passingPoints) {
  let bestPoint = passingPoints[0];
  for (let i = 1; i < passingPoints.length; i += 1) {
    if (passingPoints[i].medianCompletedPerSec >= bestPoint.medianCompletedPerSec) {
      bestPoint = passingPoints[i];
    }
  }
  return {
    maxSustainedCommittedPerSecUnderSlo: bestPoint.medianCompletedPerSec,
    bestMedianP99Ms: bestPoint.medianP99Ms,
  };
}

function findFallbackMinP99(ratePoints) {
  let minP99 = ratePoints[0].medianP99Ms;
  for (let i = 1; i < ratePoints.length; i += 1) {
    if (ratePoints[i].medianP99Ms < minP99) minP99 = ratePoints[i].medianP99Ms;
  }
  return minP99;
}

function resolveCurveBestMetrics(ratePoints) {
  const passingPoints = arrayFilter(ratePoints, (point) => point.allRepetitionsPassSlo === true);
  if (passingPoints.length > 0) {
    return findBestPassingPoint(passingPoints);
  }
  if (ratePoints.length > 0) {
    return {
      maxSustainedCommittedPerSecUnderSlo: 0,
      bestMedianP99Ms: findFallbackMinP99(ratePoints),
    };
  }
  return {
    maxSustainedCommittedPerSecUnderSlo: 0,
    bestMedianP99Ms: 0,
  };
}

function summarizePairedSweepSystemCurve({system, runs = [], sloConfig = {}}) {
  const rateSet = new Set();
  for (const run of runs) rateSet.add(Number(run.offeredRatePerSec));
  const uniqueRates = arraySort(arraySlice([...rateSet]), (a, b) => a - b);
  const ratePoints = [];

  for (const rate of uniqueRates) {
    const matchingRuns = arrayFilter(runs, (r) => Number(r.offeredRatePerSec) === rate);
    arrayPush(ratePoints, buildRatePoint(rate, matchingRuns, sloConfig));
  }

  const {
    maxSustainedCommittedPerSecUnderSlo,
    bestMedianP99Ms,
  } = resolveCurveBestMetrics(ratePoints);

  return Object.freeze({
    system, ratePoints: Object.freeze(ratePoints),
    maxSustainedCommittedPerSecUnderSlo, bestMedianP99Ms,
  });
}

function checkSweepVersionGate(options, profile, timingSource) {
  if (!Array.isArray(options.existingRecords) ||
      !options.systems?.lagrange?.version ||
      !options.systems?.tidbTikv?.version) {
    return null;
  }
  const versionGate = evaluateScenarioSystemVersionGate({
    existingRecords: options.existingRecords,
    scenarioId: options.scenarioId || 'scenario-a-oltp-core',
    profileId: options.profileId,
    systems: options.systems,
    forceRerun: options.forceRerun === true,
  });
  if (versionGate.shouldRun === false) {
    return Object.freeze({
      runnerVersion: OLTP_PAIRED_SWEEP_RUNNER_VERSION,
      profile, timingSource, comparable: false,
      nonComparableReason: versionGate.reason,
      skipped: true, skippedBecauseSystemVersionsUnchanged: true,
      versionGate, cachedRecord: versionGate.matchedRecord,
      executionOrderLog: Object.freeze([]),
    });
  }
  return {versionGate};
}

function resolvePairSystemOrder(pair) {
  if (Array.isArray(pair.systemOrder) && pair.systemOrder.length > 0) {
    return pair.systemOrder;
  }
  return pair.repetition % 2 === 1 ? ['tidb-tikv', 'lagrange'] : ['lagrange', 'tidb-tikv'];
}

function warmPhases(phases) {
  return phases;
}

async function runSystemStepWarmup(
  prepareSystemStep, executeSystemTx, system, rate, rep, dataset, warmupPhases, warmupCount,
) {
  if (typeof prepareSystemStep === 'function') {
    await prepareSystemStep({system, offeredRatePerSec: rate, repetition: rep, dataset});
  }
  for (const tx of arraySlice(warmPhases(warmupPhases), 0, warmupCount)) {
    if (typeof executeSystemTx === 'function') {
      await executeSystemTx({
        system, tx, phase: 'warmup', offeredRatePerSec: rate, repetition: rep,
      });
    }
  }
}

async function executeStepReport(
  options, system, rate, stepDurationMs, measurePhases, rep, executeSystemTx,
) {
  if (typeof options.runOpenLoopOltpStep === 'function') {
    return options.runOpenLoopOltpStep({
      system, offeredRatePerSec: rate, durationMs: stepDurationMs, workerPhases: measurePhases,
      executeTx: (tx, meta) => executeSystemTx?.({
        system, tx, phase: 'measure', offeredRatePerSec: rate, repetition: rep, meta,
      }),
      clock: options.clock,
    });
  }
  const adapter = {
    executeTransaction: async (tx) => (typeof executeSystemTx === 'function') ?
      executeSystemTx({
        system, tx, phase: 'measure', offeredRatePerSec: rate, repetition: rep, meta: {},
      }) :
      {committed: true},
  };
  const count = Math.max(1, Math.ceil((rate * stepDurationMs) / 1000));
  const stepOpts = {
    offeredRatePerSec: rate,
    ...(options.clock?.now ? {now: options.clock.now} : {}),
    ...(options.clock?.sleep ? {schedulerSleep: options.clock.sleep} : {}),
  };
  const slicePhases = arraySlice(measurePhases, 0, count);
  return runOpenLoopOltpStep(adapter, slicePhases, stepOpts);
}

function normalizeSweepStepReport(stepReport, rate) {
  return Object.freeze({
    totalScheduled: extractStepTotalScheduled(stepReport),
    completedOk: extractStepCompletedOk(stepReport),
    failed: Number(stepReport?.failed ?? 0),
    timedOut: Number(stepReport?.timedOut ?? 0),
    overallLatencyMs: extractStepLatency(stepReport),
    achievedCompletedPerSec: extractStepAchievedCompletedPerSec(stepReport),
    offeredRatePerSec: Number(rate),
    records: stepReport?.records ?? [],
  });
}

function buildSweepExecutionPlans(
  options, profile, offeredRatesPerSec, repetitions, stepDurationMs, sloConfig, seed, warmupCount,
) {
  const comparisonView = options.comparisonView || COMPARISON_VIEW.ARCHITECTURE_NATIVE;
  const sweepPlan = buildScenarioAPairedSweepPlan({
    profile, comparisonView, offeredRatesPerSec, repetitions, stepDurationMs,
    slo: sloConfig, sloP99Ms: sloConfig.p99Ms, sloMaxErrorRatePct: sloConfig.maxErrorRate * 100,
    seed, workload: options.workload || {seed},
  });

  const dataset = buildOltpBaselineDataset({profile, seed, ...options.workload});
  const baselinePlan = buildOltpBaselinePlan({
    seed, scale: dataset.scale,
    warmupOperationsPerWorker: warmupCount,
    measurementOperationsPerWorker: 100,
  });
  const warmupPhases = interleaveOltpWorkerPhase(baselinePlan.workers, 'warmup');
  const measurePhases = interleaveOltpWorkerPhase(baselinePlan.workers, 'measurement');

  return {sweepPlan, dataset, warmupPhases, measurePhases};
}

function resolveSweepComparability(timingSource, semanticGatePassed, resourceIntegrityVerified) {
  const comparable = Boolean(
    timingSource === 'observed' && semanticGatePassed === true &&
    resourceIntegrityVerified === true,
  );
  const nonComparableReason = comparable ? undefined :
    'Non-comparable evidence: non-live contract model or missing semantic/resource gate evidence ' +
    `(timingSource=${timingSource}, semanticGatePassed=${Boolean(semanticGatePassed)}, ` +
    `resourceIntegrityVerified=${Boolean(resourceIntegrityVerified)})`;
  return {comparable, nonComparableReason};
}

function resolveSweepOptions(options = {}) {
  return {
    profile: options.profile || 'smoke',
    offeredRatesPerSec: options.offeredRatesPerSec || [25, 50],
    repetitions: options.repetitions ?? 2,
    stepDurationMs: options.stepDurationMs ?? 50,
    warmupCount: options.warmupOperationsPerSystem ?? 4,
    seed: options.seed ?? 0x51a7e001,
    slo: options.slo || {},
    timingSource: options.timingSource || 'deterministic-contract-model',
    semanticGatePassed: options.semanticGatePassed === true,
    resourceIntegrityVerified: options.resourceIntegrityVerified === true,
  };
}

async function executeSweepPair({
  pair, options, stepDurationMs, measurePhases, warmupPhases,
  warmupCount, dataset, sloConfig, executionOrderLog, systemRuns,
}) {
  const order = resolvePairSystemOrder(pair);
  for (const rawSys of order) {
    const system = (rawSys === 'tidb-tikv') ? 'tidb' : rawSys;
    const rate = pair.offeredRatePerSec;
    const rep = pair.repetition;

    await runSystemStepWarmup(
      options.prepareSystemStep, options.executeSystemTx,
      system, rate, rep, dataset, warmupPhases, warmupCount,
    );

    const stepReport = await executeStepReport(
      options, system, rate, stepDurationMs, measurePhases, rep, options.executeSystemTx,
    );
    const normalizedReport = normalizeSweepStepReport(stepReport, rate);
    const sloEvaluation = evaluateOltpSweepStepSlo(normalizedReport, sloConfig);

    arrayPush(executionOrderLog, Object.freeze({
      system, offeredRatePerSec: rate, repetition: rep,
      freshDatasetPrepared: true, warmupCompleted: true,
      warmupOperations: warmupCount,
      stepReport: normalizedReport, sloEvaluation,
    }));

    const targetRuns = (system === 'lagrange') ? systemRuns.lagrange : systemRuns.tidb;
    arrayPush(targetRuns, Object.freeze({
      offeredRatePerSec: rate, repetition: rep, stepReport: normalizedReport,
    }));
  }
}

async function runScenarioAPairedSweep(options = {}) {
  const sweepOpts = resolveSweepOptions(options);
  const gateResult = checkSweepVersionGate(options, sweepOpts.profile, sweepOpts.timingSource);
  if (gateResult && gateResult.skipped) {
    return gateResult;
  }
  const versionGate = gateResult?.versionGate;

  const sloConfig = Object.freeze({
    p99Ms: Number(sweepOpts.slo.p99Ms ?? 50),
    maxErrorRate: Number(sweepOpts.slo.maxErrorRate ?? 0.001),
  });

  const {
    sweepPlan, dataset, warmupPhases, measurePhases,
  } = buildSweepExecutionPlans(
    options, sweepOpts.profile, sweepOpts.offeredRatesPerSec, sweepOpts.repetitions,
    sweepOpts.stepDurationMs, sloConfig, sweepOpts.seed, sweepOpts.warmupCount,
  );

  const executionOrderLog = [];
  const systemRuns = {lagrange: [], tidb: []};

  for (const pair of sweepPlan.pairs) {
    await executeSweepPair({
      pair, options, stepDurationMs: sweepOpts.stepDurationMs, measurePhases,
      warmupPhases, warmupCount: sweepOpts.warmupCount, dataset, sloConfig,
      executionOrderLog, systemRuns,
    });
  }

  const lagrangeCurve = summarizePairedSweepSystemCurve({
    system: 'lagrange', runs: systemRuns.lagrange, sloConfig,
  });
  const tidbCurve = summarizePairedSweepSystemCurve({
    system: 'tidb', runs: systemRuns.tidb, sloConfig,
  });
  const lagMax = lagrangeCurve.maxSustainedCommittedPerSecUnderSlo;
  const tidbMax = tidbCurve.maxSustainedCommittedPerSecUnderSlo;
  const speedupRatioUnderSlo = (tidbMax > 0) ? Number(numberToFixed(lagMax / tidbMax, 6)) : null;

  const {comparable, nonComparableReason} = resolveSweepComparability(
    sweepOpts.timingSource, sweepOpts.semanticGatePassed, sweepOpts.resourceIntegrityVerified,
  );

  return Object.freeze({
    runnerVersion: OLTP_PAIRED_SWEEP_RUNNER_VERSION,
    profile: sweepOpts.profile, timingSource: sweepOpts.timingSource,
    comparable, nonComparableReason,
    skipped: false, skippedBecauseSystemVersionsUnchanged: false,
    ...(versionGate ? {versionGate} : {}),
    sweepPlan, executionOrderLog: Object.freeze(executionOrderLog),
    curves: Object.freeze({lagrange: lagrangeCurve, tidb: tidbCurve}),
    speedupRatioUnderSlo,
  });
}

function fallbackSha(primary, fallback) {
  return primary || fallback || null;
}

function fallbackValue(a, b, defaultValue) {
  return a || b || defaultValue;
}

function buildSweepHistoryFramework(fw, id, sweepResult) {
  const defaultView = sweepResult.comparable ?
    'architecture-native' : 'contract-model-non-comparable';
  const fwCommit = fw.frameworkCommitSha || 'ea537171a4b66119655b7e1fa73e0cd21500aa41';
  return {
    frameworkVersion: fw.frameworkVersion || '0.3.0',
    frameworkCommitSha: fwCommit,
    scenarioId: fw.scenarioId || 'scenario-a-oltp-core',
    profileId: fallbackValue(fw.profileId, sweepResult.profile, 'scenario-a-paired-sweep-v1'),
    profileSha256: fw.profileSha256 || null,
    datasetSha256: fallbackSha(fw.datasetSha256, id.datasetSha256),
    workloadPlanSha256: fallbackSha(fw.workloadPlanSha256, id.workloadPlanSha256),
    measurementPlanSha256: fallbackSha(fw.measurementPlanSha256, id.measurementPlanSha256),
    retryPolicyId: fallbackValue(fw.retryPolicyId, id.retryPolicyId, 'scenario-a-retry-v1'),
    openLoopProfileId: fallbackValue(fw.openLoopProfileId, id.openLoopProfileId, 'scenario-a-open-loop-v1'),
    comparisonView: fw.comparisonView || defaultView,
  };
}

function buildSweepCurveMetric(cur) {
  const p99 = cur?.bestMedianP99Ms ?? 0;
  return {
    opsPerSec: cur?.maxSustainedCommittedPerSecUnderSlo ?? 0,
    latencyMs: {p50: p99, p95: p99, p99},
    transactions: {measuredAttempted: 0, measuredSucceeded: 0, failed: 0, retries: 0},
    semanticProofs: {passedCount: 0},
  };
}

function buildSystemDescriptor(sys, defaultVersion, defaultCommit) {
  return {
    present: true,
    version: sys.version || defaultVersion,
    commitSha: sys.commitSha || defaultCommit,
  };
}

function resolveEvidenceSource(comparable, environment) {
  return {
    kind: comparable ? 'observed-paired-run' : 'contract-model-verification',
    runId: environment?.runId || null,
  };
}

function resolveHistoryCurvesMetrics(curves) {
  return {
    lagrange: buildSweepCurveMetric(curves?.lagrange),
    tidbTikv: buildSweepCurveMetric(curves?.tidb),
  };
}

function buildPairedSweepHistoryRecord(options = {}) {
  const {sweepResult} = options;
  if (!sweepResult) throw new Error('sweepResult is required');
  const fw = options.framework || {};
  const lagSys = options.lagrangeSystem || {};
  const tidbSys = options.tidbSystem || {};
  const id = sweepResult.sweepPlan?.identity || {};
  const framework = buildSweepHistoryFramework(fw, id, sweepResult);
  const defaultTidbSha = 'pingcap/tidb:v8.5.8+tikv:v8.5.8+pd:v8.5.8';

  const record = createComparisonHistoryRecord({
    framework,
    systems: {
      lagrange: buildSystemDescriptor(lagSys, '0.3.0', framework.frameworkCommitSha),
      tidbTikv: buildSystemDescriptor(tidbSys, 'v8.5.8', defaultTidbSha),
    },
    recordedAt: options.recordedAt || '2026-10-30T14:50:00.000Z',
    evidenceSource: resolveEvidenceSource(sweepResult.comparable, options.environment),
    metrics: resolveHistoryCurvesMetrics(sweepResult.curves),
    comparable: sweepResult.comparable,
    nonComparableReason: sweepResult.nonComparableReason,
  });
  return Object.freeze({
    ...record,
    comparable: sweepResult.comparable,
    nonComparableReason: sweepResult.nonComparableReason,
  });
}

export {
  OLTP_PAIRED_SWEEP_RUNNER_VERSION,
  evaluateOltpSweepStepSlo,
  summarizePairedSweepSystemCurve,
  runScenarioAPairedSweep,
  buildPairedSweepHistoryRecord,
};
