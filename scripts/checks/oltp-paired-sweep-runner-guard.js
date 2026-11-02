#!/usr/bin/env node
// Guard of the Scenario A paired sweep runner (v2): every pair runs every
// compared system in its recorded order through the caller's step executor
// (real open-loop v2 step summaries here), curves come from the summaries
// only, there is no default executor, no substituted outcome, no numeric
// fallback, and a version-gated skip is a typed not-measured outcome.
import assert from 'node:assert/strict';

import {
  COMPARISON_VIEW,
} from '../../test/distributed/harness/comparative-system-budget.js';
import {
  interleaveOltpWorkerPhase,
  runOpenLoopOltpStep,
} from '../../test/distributed/harness/oltp-open-loop-step-owner.js';
import {
  buildOltpBaselinePlan,
} from '../../test/distributed/harness/oltp-baseline-workload.js';
import {
  buildScenarioAPairedSweepPlan,
} from '../../test/distributed/harness/oltp-paired-sweep-plan.js';
import {
  OLTP_PAIRED_SWEEP_STATUS,
  evaluateOltpSweepStepSlo,
  runScenarioAPairedSweep,
} from '../../test/distributed/harness/oltp-paired-sweep-runner.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const PASS_MESSAGE = 'oltp-paired-sweep-runner-guard: PASS';
const SYSTEMS = Object.freeze([
  OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
  OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
  OLTP_SCENARIO_A_SYSTEM.POSTGRESQL,
]);
const SLO = Object.freeze({p99Ms: 50, maxErrorRate: 0.01});
const WORKLOAD = Object.freeze({seed: 7, workers: 2, warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 3, warehouseCount: 1, districtsPerWarehouse: 1,
  customersPerDistrict: 3, itemCount: 15});
const WATCHDOG = Object.freeze({boundMs: 10000, derivation: Object.freeze({rule: 'guard'})});
const FAILING_SYSTEM = OLTP_SCENARIO_A_SYSTEM.POSTGRESQL;
const RATES = Object.freeze([100, 200]);
const REPETITIONS = 6;
const RESET_METHOD = 'truncate-and-reload';

function plan() {
  return buildScenarioAPairedSweepPlan({
    systems: SYSTEMS,
    comparisonView: COMPARISON_VIEW.ARCHITECTURE_NATIVE,
    offeredRatesPerSec: RATES,
    repetitions: REPETITIONS,
    slo: SLO,
    workload: WORKLOAD,
  });
}

// A real v2 step summary over a logical clock: every transaction takes 2 ms;
// the failing system answers a product error for every request.
async function step({system, offeredRatePerSec}) {
  let now = 0;
  const operations = interleaveOltpWorkerPhase(buildOltpBaselinePlan(WORKLOAD).workers);
  const summary = await runOpenLoopOltpStep({
    async executeTransaction() {
      now += 2;
      if (system === FAILING_SYSTEM) {
        throw Object.assign(new Error('relation missing'), {code: '42P01',
          benchmarkAttemptEvidence: {statements: [], productAnsweredError: true}});
      }
      return {outcome: 'committed', result: {}, attemptEvidence: {statements: []}};
    },
  }, operations, {
    offeredRatePerSec,
    startTimeMs: 0,
    now: () => now,
    waitUntil: async (target) => {
      now = Math.max(now, target);
    },
    watchdog: WATCHDOG,
    setWatchdogTimer: () => () => undefined,
  });
  return {...summary, datasetResetMethod: RESET_METHOD};
}

async function assertSweepRunsEverySystemInRecordedOrder() {
  const sweepPlan = plan();
  const calls = [];
  const result = await runScenarioAPairedSweep({
    sweepPlan,
    executeStep: async (request) => {
      calls.push(request);
      return step(request);
    },
  });
  assert.equal(result.status, OLTP_PAIRED_SWEEP_STATUS.MEASURED);
  assert.equal(calls.length, sweepPlan.pairs.length * SYSTEMS.length);
  assert.deepEqual(arrayMap(calls.slice(0, SYSTEMS.length), ({system}) => system),
    sweepPlan.pairs[0].systemOrder);
  assert.deepEqual(arrayMap(result.executionOrderLog, ({orderIndex}) => orderIndex)
    .slice(0, SYSTEMS.length), [0, 1, 2]);
  const failing = result.curves[FAILING_SYSTEM];
  // A curve without a passing rate has no sustained rate (null, never 0).
  assert.equal(failing.maxSustainedCommittedPerSecUnderSlo, null);
  assert.equal(failing.bestMedianP99Ms, null);
  assert.equal(failing.ratePoints[0].medianP99Ms, null);
  const passing = result.curves[OLTP_SCENARIO_A_SYSTEM.LAGRANGE];
  assert.ok(passing.maxSustainedCommittedPerSecUnderSlo > 0);
}

async function assertNoSubstitutes() {
  await assert.rejects(runScenarioAPairedSweep({sweepPlan: plan()}),
    /requires executeStep/u);
  await assert.rejects(runScenarioAPairedSweep({
    sweepPlan: plan(),
    executeStep: async () => ({committed: true}),
  }), /must be a scenario-a-open-loop-v2 summary/u);
  const skipped = await runScenarioAPairedSweep({
    sweepPlan: plan(),
    executeStep: async () => assert.fail('a gated sweep executes nothing'),
    versionGate: {shouldRun: false, reason: 'versions unchanged',
      matchedCombinationSha256: 'a'.repeat(64)},
  });
  assert.equal(skipped.status, OLTP_PAIRED_SWEEP_STATUS.NOT_MEASURED);
  assert.equal(skipped.curves, null);
  assert.throws(() => evaluateOltpSweepStepSlo({}, SLO), /open-loop-v2 summary/u);
}

async function main() {
  await assertSweepRunsEverySystemInRecordedOrder();
  await assertNoSubstitutes();
  process.stdout.write(`${PASS_MESSAGE}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
