// Executes a Scenario A paired sweep plan (oltp-paired-sweep-plan.js, v2):
// for every pair, every compared system in the pair's recorded order runs
// one open-loop step through the caller's step executor, and the per-system
// curves are summarised from the step summaries alone. There is no default
// executor, no substituted outcome, no numeric fallback and no cached
// result: a sweep that is not run is a typed `not-measured` outcome.
import {
  OLTP_OPEN_LOOP_PROFILE,
} from './oltp-open-loop-step-owner.js';
import {
  OLTP_PAIRED_SWEEP_PROFILE,
} from './oltp-paired-sweep-plan.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);

const OLTP_PAIRED_SWEEP_RUNNER_VERSION = 'scenario-a-open-loop-paired-sweep-runner-v2';
const SWEEP_STATUS = Object.freeze({
  MEASURED: 'measured',
  NOT_MEASURED: 'not-measured',
});
const NOT_MEASURED_REASON = Object.freeze({
  SYSTEM_VERSIONS_UNCHANGED: 'system-versions-unchanged',
});

function requireFiniteOrNull(value, label) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Scenario A sweep step ${label} must be a finite number or null`);
  }
  return value;
}

function requireSlo(slo) {
  const p99Ms = slo?.p99Ms;
  const maxErrorRate = slo?.maxErrorRate;
  if (typeof p99Ms !== 'number' || !(p99Ms > 0) ||
      typeof maxErrorRate !== 'number' || maxErrorRate < 0 || maxErrorRate > 1) {
    throw new Error('Scenario A sweep requires slo.p99Ms > 0 and 0 <= slo.maxErrorRate <= 1');
  }
  return slo;
}

// One step against the SLO, from the v2 step summary fields only.
function evaluateOltpSweepStepSlo(step, slo) {
  requireSlo(slo);
  if (step?.profileId !== OLTP_OPEN_LOOP_PROFILE.id || !step.accounting) {
    throw new Error(`Scenario A sweep step must be a ${OLTP_OPEN_LOOP_PROFILE.id} summary`);
  }
  const p99Ms = requireFiniteOrNull(step.latency?.p99 ?? null, 'latency.p99');
  const errorRate = requireFiniteOrNull(step.errorRate, 'errorRate');
  const completedPerSec = requireFiniteOrNull(step.completedPerSec, 'completedPerSec');
  const latencyPass = step.accounting.committed > 0 && p99Ms !== null && p99Ms <= slo.p99Ms;
  const errorRatePass = errorRate !== null && errorRate <= slo.maxErrorRate;
  return Object.freeze({
    offeredRatePerSec: step.offeredRatePerSec,
    completedPerSec,
    offered: step.accounting.offered,
    committed: step.accounting.committed,
    unresolved: step.accounting.unresolved,
    errorRate,
    p99Ms,
    latencyPass,
    errorRatePass,
    sloPass: latencyPass && errorRatePass,
  });
}

function median(values) {
  if (values.length === 0 || arraySome(values, (value) => value === null)) return null;
  const sorted = arraySort([...values], (left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] :
    (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildRatePoint(rate, runs, slo) {
  const evaluations = arrayMap(runs, (run) => evaluateOltpSweepStepSlo(run.step, slo));
  return Object.freeze({
    offeredRatePerSec: rate,
    repetitionCount: evaluations.length,
    medianCompletedPerSec: median(arrayMap(evaluations, (e) => e.completedPerSec)),
    medianP99Ms: median(arrayMap(evaluations, (e) => e.p99Ms)),
    allRepetitionsPassSlo: evaluations.length > 0 &&
      arrayFilter(evaluations, (e) => e.sloPass).length === evaluations.length,
    evaluations: Object.freeze(evaluations),
  });
}

// A curve with no passing rate has no sustained rate: null, never zero.
function summarizePairedSweepSystemCurve({system, runs, slo}) {
  const rates = arraySort([...new Set(arrayMap(runs, (run) => run.offeredRatePerSec))],
    (left, right) => left - right);
  const ratePoints = Object.freeze(arrayMap(rates, (rate) =>
    buildRatePoint(rate, arrayFilter(runs, (run) => run.offeredRatePerSec === rate), slo)));
  const passing = arrayFilter(ratePoints, (point) =>
    point.allRepetitionsPassSlo && point.medianCompletedPerSec !== null);
  let best = null;
  for (const point of passing) {
    if (!best || point.medianCompletedPerSec >= best.medianCompletedPerSec) best = point;
  }
  return Object.freeze({
    system,
    ratePoints,
    maxSustainedCommittedPerSecUnderSlo: best ? best.medianCompletedPerSec : null,
    bestMedianP99Ms: best ? best.medianP99Ms : null,
  });
}

function requireSweepPlan(plan) {
  if (plan?.profile?.id !== OLTP_PAIRED_SWEEP_PROFILE.id || !Array.isArray(plan.pairs)) {
    throw new Error(`Scenario A sweep requires a ${OLTP_PAIRED_SWEEP_PROFILE.id} plan`);
  }
  return plan;
}

function notMeasured(plan, versionGate) {
  return Object.freeze({
    runnerVersion: OLTP_PAIRED_SWEEP_RUNNER_VERSION,
    status: SWEEP_STATUS.NOT_MEASURED,
    reason: NOT_MEASURED_REASON.SYSTEM_VERSIONS_UNCHANGED,
    gateReason: versionGate.reason,
    matchedCombinationSha256: versionGate.matchedCombinationSha256 ?? null,
    sweepPlanSha256: plan.sweepPlanSha256,
    executionOrderLog: Object.freeze([]),
    curves: null,
  });
}

async function runScenarioAPairedSweep(options = {}) {
  const plan = requireSweepPlan(options.sweepPlan);
  if (typeof options.executeStep !== 'function') {
    throw new Error('Scenario A sweep requires executeStep');
  }
  if (options.versionGate && options.versionGate.shouldRun === false) {
    return notMeasured(plan, options.versionGate);
  }
  const executionOrderLog = [];
  const runsBySystem = new Map(arrayMap(plan.identity.systems, (system) => [system, []]));
  for (const pair of plan.pairs) {
    for (let orderIndex = 0; orderIndex < pair.systemOrder.length; orderIndex += 1) {
      const system = pair.systemOrder[orderIndex];
      const step = await options.executeStep(Object.freeze({
        system,
        offeredRatePerSec: pair.offeredRatePerSec,
        repetition: pair.repetition,
        orderIndex,
        sweepPlanSha256: plan.sweepPlanSha256,
      }));
      const sloEvaluation = evaluateOltpSweepStepSlo(step, plan.identity.slo);
      if (typeof step.datasetResetMethod !== 'string') {
        throw new Error('Scenario A sweep step must record its datasetResetMethod');
      }
      executionOrderLog.push(Object.freeze({
        system,
        offeredRatePerSec: pair.offeredRatePerSec,
        repetition: pair.repetition,
        orderIndex,
        datasetResetMethod: step.datasetResetMethod,
        sloEvaluation,
      }));
      runsBySystem.get(system).push({offeredRatePerSec: pair.offeredRatePerSec, step});
    }
  }
  return Object.freeze({
    runnerVersion: OLTP_PAIRED_SWEEP_RUNNER_VERSION,
    status: SWEEP_STATUS.MEASURED,
    sweepPlanSha256: plan.sweepPlanSha256,
    executionOrderLog: Object.freeze(executionOrderLog),
    curves: Object.freeze(Object.fromEntries(arrayMap(plan.identity.systems, (system) => [
      system,
      summarizePairedSweepSystemCurve({
        system,
        runs: runsBySystem.get(system),
        slo: plan.identity.slo,
      }),
    ]))),
  });
}

export {
  NOT_MEASURED_REASON as OLTP_PAIRED_SWEEP_NOT_MEASURED_REASON,
  OLTP_PAIRED_SWEEP_RUNNER_VERSION,
  SWEEP_STATUS as OLTP_PAIRED_SWEEP_STATUS,
  evaluateOltpSweepStepSlo,
  runScenarioAPairedSweep,
  summarizePairedSweepSystemCurve,
};
