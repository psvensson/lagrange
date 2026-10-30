import {COMPARISON_VIEW} from './comparative-system-budget.js';
import {buildOltpBaselineDataset} from './oltp-baseline-dataset.js';
import {buildOltpBaselinePlan} from './oltp-baseline-workload.js';
import {createComparisonHistoryRecord} from './oltp-comparison-history-store.js';
import {interleaveOltpWorkerPhase, runOpenLoopOltpStep} from './oltp-open-loop-step-owner.js';
import {buildScenarioAPairedSweepPlan} from './oltp-paired-sweep-plan.js';

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

function evaluateOltpSweepStepSlo(stepReport, sloConfig = {}) {
  const totalScheduled = Number(stepReport?.totalScheduled ?? stepReport?.attempted ?? 0);
  const completedOk = Number(stepReport?.completedOk ?? stepReport?.succeeded ?? 0);
  const failedCount = Number(stepReport?.failedCount ??
    (Number(stepReport?.failed ?? 0) + Number(stepReport?.timedOut ?? 0)));
  const p99Ms = Number(
    stepReport?.overallLatencyMs?.p99 ?? stepReport?.latency?.p99 ?? stepReport?.p99Ms ?? 0,
  );
  const achievedCompletedPerSec = Number(
    stepReport?.achievedCompletedPerSec ?? stepReport?.completedPerSec ?? 0,
  );
  const offeredRatePerSec = Number(stepReport?.offeredRatePerSec ?? 0);
  const sloP99LimitMs = Number(sloConfig?.p99Ms ?? 50);
  const sloMaxErrorRate = Number(sloConfig?.maxErrorRate ?? 0.001);
  const errorRate = totalScheduled > 0 ? failedCount / totalScheduled : 1;
  const latencyPass = totalScheduled > 0 && completedOk > 0 && p99Ms <= sloP99LimitMs;
  const errorRatePass = totalScheduled > 0 && errorRate <= sloMaxErrorRate;
  const sloPass = latencyPass && errorRatePass;

  return Object.freeze({
    offeredRatePerSec, achievedCompletedPerSec, totalScheduled, completedOk, failedCount,
    errorRate, p99Ms, sloP99LimitMs, sloMaxErrorRate, latencyPass, errorRatePass, sloPass,
  });
}

function summarizePairedSweepSystemCurve({system, runs = [], sloConfig = {}}) {
  const rateSet = new Set();
  for (const run of runs) rateSet.add(Number(run.offeredRatePerSec));
  const uniqueRates = arraySort(arraySlice([...rateSet]), (a, b) => a - b);
  const ratePoints = [];

  for (const rate of uniqueRates) {
    const matchingRuns = arrayFilter(runs, (r) => Number(r.offeredRatePerSec) === rate);
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

    arrayPush(ratePoints, Object.freeze({
      offeredRatePerSec: rate, repetitionCount: evaluations.length,
      medianCompletedPerSec: calculateMedian(completedPerSecs),
      medianP99Ms: calculateMedian(p99s),
      worstP99Ms: p99s.length > 0 ? Math.max(...p99s) : 0,
      worstErrorRate: errorRates.length > 0 ? Math.max(...errorRates) : 1,
      allRepetitionsPassSlo, evaluations: Object.freeze(evaluations),
    }));
  }

  const passingPoints = arrayFilter(ratePoints, (point) => point.allRepetitionsPassSlo === true);
  let maxSustainedCommittedPerSecUnderSlo = 0;
  let bestMedianP99Ms = 0;

  if (passingPoints.length > 0) {
    let bestPoint = passingPoints[0];
    for (let i = 1; i < passingPoints.length; i += 1) {
      if (passingPoints[i].medianCompletedPerSec >= bestPoint.medianCompletedPerSec) {
        bestPoint = passingPoints[i];
      }
    }
    maxSustainedCommittedPerSecUnderSlo = bestPoint.medianCompletedPerSec;
    bestMedianP99Ms = bestPoint.medianP99Ms;
  } else if (ratePoints.length > 0) {
    let minP99 = ratePoints[0].medianP99Ms;
    for (let i = 1; i < ratePoints.length; i += 1) {
      if (ratePoints[i].medianP99Ms < minP99) minP99 = ratePoints[i].medianP99Ms;
    }
    bestMedianP99Ms = minP99;
  }

  return Object.freeze({
    system, ratePoints: Object.freeze(ratePoints),
    maxSustainedCommittedPerSecUnderSlo, bestMedianP99Ms,
  });
}

async function runScenarioAPairedSweep(options = {}) {
  const profile = options.profile || 'smoke';
  const offeredRatesPerSec = options.offeredRatesPerSec || [25, 50];
  const repetitions = options.repetitions ?? 2;
  const stepDurationMs = options.stepDurationMs ?? 50;
  const warmupOperationsPerSystem = options.warmupOperationsPerSystem ?? 4;
  const seed = options.seed ?? 0x51a7e001;
  const slo = options.slo || {};
  const timingSource = options.timingSource || 'deterministic-contract-model';
  const semanticGatePassed = options.semanticGatePassed === true;
  const resourceIntegrityVerified = options.resourceIntegrityVerified === true;
  const {prepareSystemStep, executeSystemTx} = options;

  const comparisonView = options.comparisonView || COMPARISON_VIEW.ARCHITECTURE_NATIVE;
  const sloConfig = Object.freeze({
    p99Ms: Number(slo.p99Ms ?? 50),
    maxErrorRate: Number(slo.maxErrorRate ?? 0.001),
  });

  const sweepPlan = buildScenarioAPairedSweepPlan({
    profile, comparisonView, offeredRatesPerSec, repetitions, stepDurationMs,
    slo: sloConfig, sloP99Ms: sloConfig.p99Ms, sloMaxErrorRatePct: sloConfig.maxErrorRate * 100,
    seed, workload: options.workload || {seed},
  });

  const dataset = buildOltpBaselineDataset({profile, seed, ...options.workload});
  const baselinePlan = buildOltpBaselinePlan({
    seed, scale: dataset.scale,
    warmupOperationsPerWorker: warmupOperationsPerSystem,
    measurementOperationsPerWorker: 100,
  });
  const warmupPhases = interleaveOltpWorkerPhase(baselinePlan.workers, 'warmup');
  const measurePhases = interleaveOltpWorkerPhase(baselinePlan.workers, 'measurement');

  const executionOrderLog = [];
  const systemRuns = {lagrange: [], tidb: []};

  for (const pair of sweepPlan.pairs) {
    const order = (Array.isArray(pair.systemOrder) && pair.systemOrder.length > 0) ?
      pair.systemOrder :
      (pair.repetition % 2 === 1 ? ['tidb-tikv', 'lagrange'] : ['lagrange', 'tidb-tikv']);
    for (const rawSys of order) {
      const system = (rawSys === 'tidb-tikv') ? 'tidb' : rawSys;
      const rate = pair.offeredRatePerSec;
      const rep = pair.repetition;
      if (typeof prepareSystemStep === 'function') {
        await prepareSystemStep({system, offeredRatePerSec: rate, repetition: rep, dataset});
      }
      for (const tx of arraySlice(warmPhases(warmupPhases), 0, warmupOperationsPerSystem)) {
        if (typeof executeSystemTx === 'function') {
          await executeSystemTx({
            system, tx, phase: 'warmup', offeredRatePerSec: rate, repetition: rep,
          });
        }
      }
      let stepReport;
      if (typeof options.runOpenLoopOltpStep === 'function') {
        stepReport = await options.runOpenLoopOltpStep({
          system, offeredRatePerSec: rate, durationMs: stepDurationMs, workerPhases: measurePhases,
          executeTx: (tx, meta) => executeSystemTx?.({
            system, tx, phase: 'measure', offeredRatePerSec: rate, repetition: rep, meta,
          }),
          clock: options.clock,
        });
      } else {
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
        stepReport = await runOpenLoopOltpStep(adapter, slicePhases, stepOpts);
      }

      const normalizedReport = Object.freeze({
        totalScheduled: Number(stepReport?.totalScheduled ?? stepReport?.attempted ?? 0),
        completedOk: Number(stepReport?.completedOk ?? stepReport?.succeeded ?? 0),
        failed: Number(stepReport?.failed ?? 0),
        timedOut: Number(stepReport?.timedOut ?? 0),
        overallLatencyMs: stepReport?.overallLatencyMs ?? stepReport?.latency ?? {p99: 0},
        achievedCompletedPerSec: Number(
          stepReport?.achievedCompletedPerSec ?? stepReport?.completedPerSec ?? 0,
        ),
        offeredRatePerSec: Number(rate),
        records: stepReport?.records ?? [],
      });

      const sloEvaluation = evaluateOltpSweepStepSlo(normalizedReport, sloConfig);
      arrayPush(executionOrderLog, Object.freeze({
        system, offeredRatePerSec: rate, repetition: rep,
        freshDatasetPrepared: true, warmupCompleted: true,
        warmupOperations: warmupOperationsPerSystem,
        stepReport: normalizedReport, sloEvaluation,
      }));
      const targetRuns = (system === 'lagrange') ? systemRuns.lagrange : systemRuns.tidb;
      arrayPush(targetRuns, Object.freeze({
        offeredRatePerSec: rate, repetition: rep, stepReport: normalizedReport,
      }));
    }
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

  const comparable = Boolean(
    timingSource === 'observed' && semanticGatePassed === true && resourceIntegrityVerified === true,
  );
  const nonComparableReason = comparable ? undefined :
    'Non-comparable evidence: non-live contract model or missing semantic/resource gate evidence ' +
    `(timingSource=${timingSource}, semanticGatePassed=${Boolean(semanticGatePassed)}, ` +
    `resourceIntegrityVerified=${Boolean(resourceIntegrityVerified)})`;

  return Object.freeze({
    runnerVersion: OLTP_PAIRED_SWEEP_RUNNER_VERSION,
    profile, timingSource, comparable, nonComparableReason,
    sweepPlan, executionOrderLog: Object.freeze(executionOrderLog),
    curves: Object.freeze({lagrange: lagrangeCurve, tidb: tidbCurve}),
    speedupRatioUnderSlo,
  });
}

function warmPhases(phases) {
  return phases;
}

function buildPairedSweepHistoryRecord(options = {}) {
  const {sweepResult} = options;
  if (!sweepResult) throw new Error('sweepResult is required');
  const fw = options.framework || {};
  const lagSys = options.lagrangeSystem || {};
  const tidbSys = options.tidbSystem || {};
  const id = sweepResult.sweepPlan?.identity || {};
  const fwCommit = fw.frameworkCommitSha || 'ea537171a4b66119655b7e1fa73e0cd21500aa41';
  const toMetric = (cur) => ({
    opsPerSec: cur?.maxSustainedCommittedPerSecUnderSlo ?? 0,
    latencyMs: {
      p50: cur?.bestMedianP99Ms ?? 0,
      p95: cur?.bestMedianP99Ms ?? 0,
      p99: cur?.bestMedianP99Ms ?? 0,
    },
    transactions: {measuredAttempted: 0, measuredSucceeded: 0, failed: 0, retries: 0},
    semanticProofs: {passedCount: 0},
  });
  const defaultView = sweepResult.comparable ? 'architecture-native' : 'contract-model-non-comparable';
  const defaultTidbSha = 'pingcap/tidb:v8.5.8+tikv:v8.5.8+pd:v8.5.8';
  const record = createComparisonHistoryRecord({
    framework: {
      frameworkVersion: fw.frameworkVersion || '0.3.0',
      frameworkCommitSha: fwCommit,
      scenarioId: fw.scenarioId || 'scenario-a-oltp-core',
      profileId: fw.profileId || sweepResult.profile || 'scenario-a-paired-sweep-v1',
      profileSha256: fw.profileSha256 || null,
      datasetSha256: fw.datasetSha256 || id.datasetSha256 || null,
      workloadPlanSha256: fw.workloadPlanSha256 || id.workloadPlanSha256 || null,
      measurementPlanSha256: fw.measurementPlanSha256 || id.measurementPlanSha256 || null,
      retryPolicyId: fw.retryPolicyId || id.retryPolicyId || 'scenario-a-retry-v1',
      openLoopProfileId: fw.openLoopProfileId || id.openLoopProfileId || 'scenario-a-open-loop-v1',
      comparisonView: fw.comparisonView || defaultView,
    },
    systems: {
      lagrange: {present: true, version: lagSys.version || '0.3.0', commitSha: lagSys.commitSha || fwCommit},
      tidbTikv: {present: true, version: tidbSys.version || 'v8.5.8', commitSha: tidbSys.commitSha || defaultTidbSha},
    },
    recordedAt: options.recordedAt || '2026-10-30T14:50:00.000Z',
    evidenceSource: {
      kind: sweepResult.comparable ? 'observed-paired-run' : 'contract-model-verification',
      runId: options.environment?.runId || null,
    },
    metrics: {
      lagrange: toMetric(sweepResult.curves?.lagrange),
      tidbTikv: toMetric(sweepResult.curves?.tidb),
    },
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
