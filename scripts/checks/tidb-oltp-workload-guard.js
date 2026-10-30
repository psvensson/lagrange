#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  OLTP_OPERATION_KIND,
  OLTP_OPERATION_MIX,
  buildOltpBaselinePlan,
  hashOltpBaselineMeasurementPlan,
  runOltpBaselineWorkload,
  summarizeOltpBaselineLatencies,
} from '../../test/distributed/harness/oltp-baseline-workload.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const PASS_LINE = 'tidb-oltp-workload-guard: PASS\n';

const INVALID_ITEM_COUNT = 14;

const SEED_PAYLOAD = 777;
const WORKERS_PAYLOAD = 1;
const WARMUP_OPS_PAYLOAD = 0;
const MEASUREMENT_OPS_PAYLOAD = 100;
const WAREHOUSE_COUNT_PAYLOAD = 4;
const ITEM_COUNT_PAYLOAD = 1000;

const PHASE_WARMUP = 'warmup';
const PHASE_MEASUREMENT = 'measurement';
const MIN_ORDER_LINES = 5;
const MAX_ORDER_LINES = 15;
const MAX_LINE_QUANTITY = 10;
const MIN_PAYMENT_CENTS = 100;
const MAX_PAYMENT_CENTS = 500000;

const LATENCY_INPUT_SAMPLE = Object.freeze([5, 1, 4, 2, 3]);
const EXPECTED_LATENCY_SUMMARY = Object.freeze({
  count: 5,
  avg: 3,
  p50: 3,
  p95: 5,
  p99: 5,
  min: 1,
  max: 5,
});
const EMPTY_LATENCY_SUMMARY = Object.freeze({
  count: 0,
  avg: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  min: 0,
  max: 0,
});

const SEED_EXECUTION = 991;
const WORKERS_EXECUTION = 4;
const WARMUP_OPS_EXECUTION = 25;
const MEASUREMENT_OPS_EXECUTION = 100;
const CLOCK_TICK_EXECUTION = 0.25;
const EXPECTED_WARMUP_OPS = 100;
const EXPECTED_MEASUREMENT_OPS = 400;
const MIX_MULTIPLIER_EXECUTION = 4;
const MSG_CONCURRENT = 'Expected different workers to execute concurrently';

const TRANSACTION_DURATION_MS = 10;
const HOOK_DURATION_MS = 1000;
const HOOK_START = 'start-hook';
const HOOK_END = 'end-hook';
const EXPECTED_HOOK_EVENTS = Object.freeze([
  PHASE_WARMUP,
  HOOK_START,
  PHASE_MEASUREMENT,
  HOOK_END,
]);
const EXPECTED_OPS_PER_SEC = 100;

const SYNTHETIC_MEASURED_ERROR = 'synthetic measured failure';
const CODE_SYNTHETIC = 'SYNTHETIC';
const SQLSTATE_ZZ999 = 'ZZ999';
const SUCCEEDED_OPS_COUNT = 99;

const SYNTHETIC_WARMUP_ERROR = 'synthetic warmup failure';
const CODE_WARMUP_SYNTHETIC = 'WARMUP_SYNTHETIC';

function countKinds(operations) {
  const counts = Object.fromEntries(
    arrayMap(Object.keys(OLTP_OPERATION_MIX), (kind) => [kind, ZERO]),
  );
  for (const operation of operations) counts[operation.kind] += ONE;
  return counts;
}

function assertDeterministicPlanAndMix() {
  const options = {
    seed: 123456,
    workers: 2,
    warmupOperationsPerWorker: 100,
    measurementOperationsPerWorker: 200,
    warehouseCount: 4,
    districtsPerWarehouse: 10,
    customersPerDistrict: 300,
    itemCount: 1000,
  };
  const first = buildOltpBaselinePlan(options);
  const second = buildOltpBaselinePlan(options);
  assert.deepEqual(first, second);
  assert.equal(
    hashOltpBaselineMeasurementPlan(first),
    hashOltpBaselineMeasurementPlan(second),
  );

  const changed = buildOltpBaselinePlan({...options, seed: 123457});
  assert.notEqual(
    hashOltpBaselineMeasurementPlan(first),
    hashOltpBaselineMeasurementPlan(changed),
  );

  for (const worker of first.workers) {
    const counts = countKinds(worker.measurement);
    for (const [kind, expectedPerHundred] of
      Object.entries(OLTP_OPERATION_MIX)) {
      assert.equal(counts[kind], expectedPerHundred * TWO);
    }
  }
}

function assertFailClosedBounds() {
  assert.throws(
    () => buildOltpBaselinePlan({itemCount: INVALID_ITEM_COUNT}),
    /itemCount must be an integer >= 15/u,
  );
  assert.throws(
    () => buildOltpBaselinePlan({workers: 0}),
    /workers must be an integer >= 1/u,
  );
  assert.throws(
    () => buildOltpBaselinePlan({measurementOperationsPerWorker: 0}),
    /measurementOperationsPerWorker must be an integer >= 1/u,
  );
}

function assertPayloadContracts() {
  const plan = buildOltpBaselinePlan({
    seed: SEED_PAYLOAD,
    workers: WORKERS_PAYLOAD,
    warmupOperationsPerWorker: WARMUP_OPS_PAYLOAD,
    measurementOperationsPerWorker: MEASUREMENT_OPS_PAYLOAD,
    warehouseCount: WAREHOUSE_COUNT_PAYLOAD,
    itemCount: ITEM_COUNT_PAYLOAD,
  });
  const operations = plan.workers[0].measurement;
  for (const operation of operations) {
    assert.ok(
      operation.warehouseId >= ONE &&
      operation.warehouseId <= WAREHOUSE_COUNT_PAYLOAD,
    );
    assert.equal(operation.phase, PHASE_MEASUREMENT);
    assert.equal(operation.workerId, 1);
    assert.ok(
      operation.sequence >= ONE &&
      operation.sequence <= MEASUREMENT_OPS_PAYLOAD,
    );

    if (operation.kind === OLTP_OPERATION_KIND.NEW_ORDER) {
      assert.ok(
        operation.lines.length >= MIN_ORDER_LINES &&
        operation.lines.length <= MAX_ORDER_LINES,
      );
      const itemIds = arrayMap(operation.lines, (line) => line.itemId);
      assert.equal(new Set(itemIds).size, itemIds.length);
      for (const line of operation.lines) {
        assert.ok(line.quantity >= ONE && line.quantity <= MAX_LINE_QUANTITY);
        assert.ok(
          line.supplyWarehouseId >= ONE &&
          line.supplyWarehouseId <= WAREHOUSE_COUNT_PAYLOAD,
        );
      }
    }
    if (operation.kind === OLTP_OPERATION_KIND.PAYMENT) {
      assert.ok(operation.amountCents >= MIN_PAYMENT_CENTS);
      assert.ok(operation.amountCents <= MAX_PAYMENT_CENTS);
      assert.ok(operation.customerWarehouseId >= ONE);
      assert.ok(operation.customerWarehouseId <= WAREHOUSE_COUNT_PAYLOAD);
    }
  }
}

function assertLatencySummary() {
  assert.deepEqual(
    summarizeOltpBaselineLatencies(LATENCY_INPUT_SAMPLE),
    EXPECTED_LATENCY_SUMMARY,
  );
  assert.deepEqual(
    summarizeOltpBaselineLatencies([]),
    EMPTY_LATENCY_SUMMARY,
  );
}

async function assertExecutionAndMetrics() {
  const activeWorkers = new Set();
  let active = ZERO;
  let maxActive = ZERO;
  let clock = ZERO;
  const adapter = {
    async executeTransaction(operation) {
      assert.equal(activeWorkers.has(operation.workerId), false);
      activeWorkers.add(operation.workerId);
      active += ONE;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= ONE;
      activeWorkers.delete(operation.workerId);
    },
  };
  const result = await runOltpBaselineWorkload(adapter, {
    seed: SEED_EXECUTION,
    workers: WORKERS_EXECUTION,
    warmupOperationsPerWorker: WARMUP_OPS_EXECUTION,
    measurementOperationsPerWorker: MEASUREMENT_OPS_EXECUTION,
    warehouseCount: WAREHOUSE_COUNT_PAYLOAD,
    itemCount: ITEM_COUNT_PAYLOAD,
    now() {
      clock += CLOCK_TICK_EXECUTION;
      return clock;
    },
  });

  assert.equal(result.warmup.attempted, EXPECTED_WARMUP_OPS);
  assert.equal(result.warmup.failed, ZERO);
  assert.deepEqual(result.warmup.errorSamples, []);
  assert.equal(result.measurement.attempted, EXPECTED_MEASUREMENT_OPS);
  assert.equal(result.measurement.succeeded, EXPECTED_MEASUREMENT_OPS);
  assert.equal(result.measurement.failed, ZERO);
  assert.deepEqual(result.measurement.errorSamples, []);
  assert.equal(result.latency.count, EXPECTED_MEASUREMENT_OPS);
  assert.ok(result.opsPerSec > ZERO);
  assert.ok(maxActive > ONE, MSG_CONCURRENT);
  assert.match(result.measurementPlanSha256, /^[a-f0-9]{64}$/u);

  for (const [kind, expectedPerHundred] of
    Object.entries(OLTP_OPERATION_MIX)) {
    assert.equal(result.operations[kind].attempted, expectedPerHundred * MIX_MULTIPLIER_EXECUTION);
    assert.equal(result.operations[kind].failed, ZERO);
    assert.deepEqual(result.operations[kind].errorSamples, []);
  }
}

async function assertMeasurementHooksOutsideTimer() {
  const events = [];
  let clock = ZERO;
  const result = await runOltpBaselineWorkload({
    async executeTransaction(operation) {
      events.push(operation.phase);
      clock += TRANSACTION_DURATION_MS;
    },
  }, {
    workers: 1,
    warmupOperationsPerWorker: 1,
    measurementOperationsPerWorker: 1,
    itemCount: ITEM_COUNT_PAYLOAD,
    now() {
      return clock;
    },
    async onMeasurementStart() {
      events.push(HOOK_START);
      clock += HOOK_DURATION_MS;
    },
    async onMeasurementEnd() {
      events.push(HOOK_END);
      clock += HOOK_DURATION_MS;
    },
  });

  assert.deepEqual(events, EXPECTED_HOOK_EVENTS);
  assert.equal(result.measurement.elapsedMs, TRANSACTION_DURATION_MS);
  assert.equal(result.latency.count, ONE);
  assert.equal(result.latency.avg, TRANSACTION_DURATION_MS);
  assert.equal(result.latency.p50, TRANSACTION_DURATION_MS);
  assert.equal(result.opsPerSec, EXPECTED_OPS_PER_SEC);
}

async function assertMeasuredErrorsAreCounted() {
  let failed = false;
  const result = await runOltpBaselineWorkload({
    async executeTransaction(operation) {
      if (!failed && operation.phase === PHASE_MEASUREMENT) {
        failed = true;
        const error = new Error(SYNTHETIC_MEASURED_ERROR);
        error.code = CODE_SYNTHETIC;
        error.sqlState = SQLSTATE_ZZ999;
        throw error;
      }
    },
  }, {
    workers: 1,
    warmupOperationsPerWorker: 0,
    measurementOperationsPerWorker: MEASUREMENT_OPS_PAYLOAD,
    itemCount: ITEM_COUNT_PAYLOAD,
  });

  assert.equal(result.measurement.attempted, MEASUREMENT_OPS_PAYLOAD);
  assert.equal(result.measurement.succeeded, SUCCEEDED_OPS_COUNT);
  assert.equal(result.measurement.failed, ONE);
  assert.equal(result.latency.count, SUCCEEDED_OPS_COUNT);
  assert.equal(result.measurement.errorSamples.length, ONE);
  assert.equal(result.measurement.errorSamples[0].message, SYNTHETIC_MEASURED_ERROR);
  assert.equal(result.measurement.errorSamples[0].code, CODE_SYNTHETIC);
  assert.equal(result.measurement.errorSamples[0].sqlState, SQLSTATE_ZZ999);
  assert.equal(result.measurement.errorSamples[0].phase, PHASE_MEASUREMENT);
  assert.equal(result.measurement.errorSamples[0].workerId, ONE);
}

async function assertWarmupFailureFailsClosed() {
  await assert.rejects(
    runOltpBaselineWorkload({
      async executeTransaction(operation) {
        if (operation.phase === PHASE_WARMUP) {
          const error = new Error(SYNTHETIC_WARMUP_ERROR);
          error.code = CODE_WARMUP_SYNTHETIC;
          throw error;
        }
      },
    }, {
      workers: 1,
      warmupOperationsPerWorker: 1,
      measurementOperationsPerWorker: 1,
      itemCount: ITEM_COUNT_PAYLOAD,
    }),
    (error) => {
      assert.match(error.message, /warmup failed 1 transaction/u);
      assert.match(error.message, /synthetic warmup failure/u);
      assert.match(error.message, /WARMUP_SYNTHETIC/u);
      return true;
    },
  );
}

async function main() {
  assertDeterministicPlanAndMix();
  assertFailClosedBounds();
  assertPayloadContracts();
  assertLatencySummary();
  await assertExecutionAndMetrics();
  await assertMeasurementHooksOutsideTimer();
  await assertMeasuredErrorsAreCounted();
  await assertWarmupFailureFailsClosed();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
