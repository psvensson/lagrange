#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  COMPARISON_VIEW,
} from '../../test/distributed/harness/comparative-system-budget.js';
import {
  OLTP_PAIRED_SWEEP_PROFILE,
  OLTP_PAIRED_SWEEP_SYSTEM,
  buildScenarioAPairedSweepPlan,
} from '../../test/distributed/harness/oltp-paired-sweep-plan.js';

const PASS_LINE = 'oltp-paired-sweep-plan-guard: PASS\n';
const SEMANTIC_PROFILE_SHA256 = 'c'.repeat(64);
const BASE_WORKLOAD = Object.freeze({
  seed: 12345,
  workers: 2,
  warmupOperationsPerWorker: 4,
  measurementOperationsPerWorker: 10,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 10,
  itemCount: 30,
});

const BASE_OPTIONS = Object.freeze({
  comparisonView: COMPARISON_VIEW.MATCHED_TOTAL_BUDGET,
  offeredRatesPerSec: Object.freeze([100, 150, 200]),
  repetitions: 4,
  slo: Object.freeze({p99Ms: 100, maxErrorRate: 0.01}),
  workload: BASE_WORKLOAD,
  semanticProfileSha256: SEMANTIC_PROFILE_SHA256,
});

function assertProfile() {
  assert.deepEqual(OLTP_PAIRED_SWEEP_PROFILE, {
    id: 'scenario-a-paired-sweep-v1',
    systems: ['tidb-tikv', 'lagrange'],
    counterbalance: 'alternate-rate-direction-and-system-first',
    freshDatasetPerSystemRateRun: true,
    warmupBeforeMeasurement: true,
    openLoopProfileId: 'scenario-a-open-loop-v1',
    retryPolicyId: 'scenario-a-retry-v1',
  });
}

function assertCounterbalancedPlan() {
  const plan = buildScenarioAPairedSweepPlan(BASE_OPTIONS);
  assert.equal(plan.sweepPlanSha256.length, 64);
  assert.equal(plan.identity.comparisonView, 'matched-total-budget');
  assert.deepEqual(plan.identity.offeredRatesPerSec, [100, 150, 200]);
  assert.equal(plan.identity.repetitions, 4);
  assert.deepEqual(plan.identity.slo, {p99Ms: 100, maxErrorRate: 0.01});
  assert.match(plan.identity.datasetSha256, /^[0-9a-f]{64}$/u);
  assert.match(plan.identity.workloadPlanSha256, /^[0-9a-f]{64}$/u);
  assert.match(plan.identity.measurementPlanSha256, /^[0-9a-f]{64}$/u);
  assert.equal(plan.pairs.length, 12);

  assert.deepEqual(
    plan.pairs.slice(0, 3).map(({offeredRatePerSec}) => offeredRatePerSec),
    [100, 150, 200],
  );
  assert.deepEqual(
    plan.pairs.slice(3, 6).map(({offeredRatePerSec}) => offeredRatePerSec),
    [200, 150, 100],
  );
  assert.deepEqual(
    plan.pairs[0].systemOrder,
    [OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV, OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE],
  );
  assert.deepEqual(
    plan.pairs[3].systemOrder,
    [OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE, OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV],
  );
  assert.equal(
    plan.pairs.every(({freshDatasetPerSystem, warmupBeforeMeasurement}) =>
      freshDatasetPerSystem && warmupBeforeMeasurement),
    true,
  );

  for (const rate of BASE_OPTIONS.offeredRatesPerSec) {
    const pairs = plan.pairs.filter(({offeredRatePerSec}) =>
      offeredRatePerSec === rate);
    assert.equal(pairs.length, 4);
    assert.equal(
      pairs.filter(({systemOrder}) =>
        systemOrder[0] === OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV).length,
      2,
    );
    assert.equal(
      pairs.filter(({systemOrder}) =>
        systemOrder[0] === OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE).length,
      2,
    );
  }
}

function assertIdentityIsImmutable() {
  const first = buildScenarioAPairedSweepPlan(BASE_OPTIONS);
  const second = buildScenarioAPairedSweepPlan({...BASE_OPTIONS});
  assert.equal(first.sweepPlanSha256, second.sweepPlanSha256);

  const changedSlo = buildScenarioAPairedSweepPlan({
    ...BASE_OPTIONS,
    slo: {p99Ms: 120, maxErrorRate: 0.01},
  });
  assert.notEqual(first.sweepPlanSha256, changedSlo.sweepPlanSha256);

  const changedRates = buildScenarioAPairedSweepPlan({
    ...BASE_OPTIONS,
    offeredRatesPerSec: [100, 160, 200],
  });
  assert.notEqual(first.sweepPlanSha256, changedRates.sweepPlanSha256);

  const changedWarmup = buildScenarioAPairedSweepPlan({
    ...BASE_OPTIONS,
    workload: {
      ...BASE_WORKLOAD,
      warmupOperationsPerWorker: 5,
    },
  });
  assert.equal(first.identity.datasetSha256, changedWarmup.identity.datasetSha256);
  assert.equal(
    first.identity.measurementPlanSha256,
    changedWarmup.identity.measurementPlanSha256,
  );
  assert.notEqual(
    first.identity.workloadPlanSha256,
    changedWarmup.identity.workloadPlanSha256,
  );
  assert.notEqual(first.sweepPlanSha256, changedWarmup.sweepPlanSha256);
}

function assertInvalidPlansFailClosed() {
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      repetitions: 3,
    }),
    /even repetitions value >= 2/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      offeredRatesPerSec: [100, 100, 200],
    }),
    /strictly increasing and unique/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      semanticProfileSha256: 'not-a-digest',
    }),
    /semanticProfileSha256 must be a SHA-256 digest/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      comparisonView: 'same-node-count',
    }),
    /known comparisonView/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      slo: {p99Ms: 100, maxErrorRate: 1.01},
    }),
    /maxErrorRate must be between 0 and 1/u,
  );
}

function main() {
  assertProfile();
  assertCounterbalancedPlan();
  assertIdentityIsImmutable();
  assertInvalidPlansFailClosed();
  process.stdout.write(PASS_LINE);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}
