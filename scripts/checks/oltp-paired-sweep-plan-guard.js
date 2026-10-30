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
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-profile.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);

const PASS_LINE = 'oltp-paired-sweep-plan-guard: PASS\n';
const PROFILE_ID = 'scenario-a-paired-sweep-v1';
const COUNTERBALANCE_MODE = 'alternate-rate-direction-and-system-first';
const SEMANTIC_PROFILE_ID = 'scenario-a-semantic-v1';
const OPEN_LOOP_PROFILE_ID = 'scenario-a-open-loop-v1';
const RETRY_POLICY_ID = 'scenario-a-retry-v1';
const SHA256_LENGTH = 64;
const COMPARISON_VIEW_MATCHED_TOTAL_BUDGET = 'matched-total-budget';
const RATES_ASCENDING = Object.freeze([100, 150, 200]);
const RATES_DESCENDING = Object.freeze([200, 150, 100]);
const EXPECTED_REPETITIONS = 4;
const EXPECTED_SLO = Object.freeze({p99Ms: 100, maxErrorRate: 0.01});
const EXPECTED_PAIRS_COUNT = 12;
const SLICE_THREE = 3;
const SLICE_SIX = 6;
const PAIRS_PER_RATE_COUNT = 4;
const EXPECTED_SYSTEMS = Object.freeze([
  OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV,
  OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE,
]);
const EXPECTED_PROFILE = Object.freeze({
  id: PROFILE_ID,
  systems: EXPECTED_SYSTEMS,
  counterbalance: COUNTERBALANCE_MODE,
  freshDatasetPerSystemRateRun: true,
  warmupBeforeMeasurement: true,
  semanticProfileId: SEMANTIC_PROFILE_ID,
  openLoopProfileId: OPEN_LOOP_PROFILE_ID,
  retryPolicyId: RETRY_POLICY_ID,
});
const INVALID_ODD_REPETITIONS = 3;
const INVALID_DUPLICATE_RATES = Object.freeze([100, 100, 200]);
const TAMPERED_PROFILE_CHAR = 'c';
const INVALID_SEMANTIC_PROFILE_ID = 'caller-owned-profile';
const INVALID_COMPARISON_VIEW = 'same-node-count';
const INVALID_SLO = Object.freeze({p99Ms: 100, maxErrorRate: 1.01});

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
  offeredRatesPerSec: RATES_ASCENDING,
  repetitions: EXPECTED_REPETITIONS,
  slo: EXPECTED_SLO,
  workload: BASE_WORKLOAD,
});

function assertProfile() {
  assert.deepEqual(OLTP_PAIRED_SWEEP_PROFILE, EXPECTED_PROFILE);
}

function assertCounterbalancedPlan() {
  const plan = buildScenarioAPairedSweepPlan(BASE_OPTIONS);
  assert.equal(plan.sweepPlanSha256.length, SHA256_LENGTH);
  assert.equal(plan.identity.comparisonView, COMPARISON_VIEW_MATCHED_TOTAL_BUDGET);
  assert.deepEqual(plan.identity.offeredRatesPerSec, RATES_ASCENDING);
  assert.equal(plan.identity.repetitions, EXPECTED_REPETITIONS);
  assert.deepEqual(plan.identity.slo, EXPECTED_SLO);
  assert.match(plan.identity.datasetSha256, /^[0-9a-f]{64}$/u);
  assert.match(plan.identity.workloadPlanSha256, /^[0-9a-f]{64}$/u);
  assert.match(plan.identity.measurementPlanSha256, /^[0-9a-f]{64}$/u);
  assert.equal(
    plan.identity.semanticProfileId,
    OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
  );
  assert.equal(
    plan.identity.semanticProfileSha256,
    hashScenarioASemanticProfile(),
  );
  assert.equal(plan.pairs.length, EXPECTED_PAIRS_COUNT);

  assert.deepEqual(
    arrayMap(
      plan.pairs.slice(0, SLICE_THREE),
      ({offeredRatePerSec}) => offeredRatePerSec,
    ),
    RATES_ASCENDING,
  );
  assert.deepEqual(
    arrayMap(
      plan.pairs.slice(SLICE_THREE, SLICE_SIX),
      ({offeredRatePerSec}) => offeredRatePerSec,
    ),
    RATES_DESCENDING,
  );
  assert.deepEqual(
    plan.pairs[0].systemOrder,
    [OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV, OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE],
  );
  assert.deepEqual(
    plan.pairs[SLICE_THREE].systemOrder,
    [OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE, OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV],
  );
  assert.equal(
    arrayEvery(
      plan.pairs,
      ({freshDatasetPerSystem, warmupBeforeMeasurement}) =>
        freshDatasetPerSystem && warmupBeforeMeasurement,
    ),
    true,
  );

  for (const rate of BASE_OPTIONS.offeredRatesPerSec) {
    const pairs = arrayFilter(
      plan.pairs,
      ({offeredRatePerSec}) => offeredRatePerSec === rate,
    );
    assert.equal(pairs.length, PAIRS_PER_RATE_COUNT);
    assert.equal(
      arrayFilter(
        pairs,
        ({systemOrder}) => systemOrder[0] === OLTP_PAIRED_SWEEP_SYSTEM.TIDB_TIKV,
      ).length,
      2,
    );
    assert.equal(
      arrayFilter(
        pairs,
        ({systemOrder}) => systemOrder[0] === OLTP_PAIRED_SWEEP_SYSTEM.LAGRANGE,
      ).length,
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
      repetitions: INVALID_ODD_REPETITIONS,
    }),
    /even repetitions value >= 2/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      offeredRatesPerSec: INVALID_DUPLICATE_RATES,
    }),
    /strictly increasing and unique/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      semanticProfileSha256: TAMPERED_PROFILE_CHAR.repeat(SHA256_LENGTH),
    }),
    /semantic profile is owned by the semantic-profile owner/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      semanticProfileId: INVALID_SEMANTIC_PROFILE_ID,
    }),
    /semantic profile is owned by the semantic-profile owner/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      comparisonView: INVALID_COMPARISON_VIEW,
    }),
    /known comparisonView/u,
  );
  assert.throws(
    () => buildScenarioAPairedSweepPlan({
      ...BASE_OPTIONS,
      slo: INVALID_SLO,
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
