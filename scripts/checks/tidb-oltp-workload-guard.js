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

const ZERO = 0;
const ONE = 1;
const PASS_LINE = 'tidb-oltp-workload-guard: PASS\n';

function countKinds(operations) {
  const counts = Object.fromEntries(
    Object.keys(OLTP_OPERATION_MIX).map((kind) => [kind, ZERO]),
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
      assert.equal(counts[kind], expectedPerHundred * 2);
    }
  }
}

function assertFailClosedBounds() {
  assert.throws(
    () => buildOltpBaselinePlan({itemCount: 14}),
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
    seed: 777,
    workers: 1,
    warmupOperationsPerWorker: 0,
    measurementOperationsPerWorker: 100,
    warehouseCount: 4,
    itemCount: 1000,
  });
  const operations = plan.workers[0].measurement;
  for (const operation of operations) {
    assert.ok(operation.warehouseId >= 1 && operation.warehouseId <= 4);
    assert.equal(operation.phase, 'measurement');
    assert.equal(operation.workerId, 1);
    assert.ok(operation.sequence >= 1 && operation.sequence <= 100);

    if (operation.kind === OLTP_OPERATION_KIND.NEW_ORDER) {
      assert.ok(operation.lines.length >= 5 && operation.lines.length <= 15);
      const itemIds = operation.lines.map((line) => line.itemId);
      assert.equal(new Set(itemIds).size, itemIds.length);
      for (const line of operation.lines) {
        assert.ok(line.quantity >= 1 && line.quantity <= 10);
        assert.ok(line.supplyWarehouseId >= 1 && line.supplyWarehouseId <= 4);
      }
    }
    if (operation.kind === OLTP_OPERATION_KIND.PAYMENT) {
      assert.ok(operation.amountCents >= 100);
      assert.ok(operation.amountCents <= 500000);
      assert.ok(operation.customerWarehouseId >= 1);
      assert.ok(operation.customerWarehouseId <= 4);
    }
  }
}

function assertLatencySummary() {
  assert.deepEqual(
    summarizeOltpBaselineLatencies([5, 1, 4, 2, 3]),
    {
      count: 5,
      avg: 3,
      p50: 3,
      p95: 5,
      p99: 5,
      min: 1,
      max: 5,
    },
  );
  assert.deepEqual(
    summarizeOltpBaselineLatencies([]),
    {
      count: 0,
      avg: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
    },
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
    seed: 991,
    workers: 4,
    warmupOperationsPerWorker: 25,
    measurementOperationsPerWorker: 100,
    warehouseCount: 4,
    itemCount: 1000,
    now() {
      clock += 0.25;
      return clock;
    },
  });

  assert.equal(result.warmup.attempted, 100);
  assert.equal(result.warmup.failed, ZERO);
  assert.deepEqual(result.warmup.errorSamples, []);
  assert.equal(result.measurement.attempted, 400);
  assert.equal(result.measurement.succeeded, 400);
  assert.equal(result.measurement.failed, ZERO);
  assert.deepEqual(result.measurement.errorSamples, []);
  assert.equal(result.latency.count, 400);
  assert.ok(result.opsPerSec > ZERO);
  assert.ok(maxActive > ONE, 'Expected different workers to execute concurrently');
  assert.match(result.measurementPlanSha256, /^[a-f0-9]{64}$/u);

  for (const [kind, expectedPerHundred] of
    Object.entries(OLTP_OPERATION_MIX)) {
    assert.equal(result.operations[kind].attempted, expectedPerHundred * 4);
    assert.equal(result.operations[kind].failed, ZERO);
    assert.deepEqual(result.operations[kind].errorSamples, []);
  }
}

async function assertMeasuredErrorsAreCounted() {
  let failed = false;
  const result = await runOltpBaselineWorkload({
    async executeTransaction(operation) {
      if (!failed && operation.phase === 'measurement') {
        failed = true;
        const error = new Error('synthetic measured failure');
        error.code = 'SYNTHETIC';
        error.sqlState = 'ZZ999';
        throw error;
      }
    },
  }, {
    workers: 1,
    warmupOperationsPerWorker: 0,
    measurementOperationsPerWorker: 100,
    itemCount: 1000,
  });
  assert.equal(result.measurement.attempted, 100);
  assert.equal(result.measurement.succeeded, 99);
  assert.equal(result.measurement.failed, ONE);
  assert.equal(result.latency.count, 99);
  assert.equal(result.measurement.errorSamples.length, ONE);
  assert.equal(result.measurement.errorSamples[0].message, 'synthetic measured failure');
  assert.equal(result.measurement.errorSamples[0].code, 'SYNTHETIC');
  assert.equal(result.measurement.errorSamples[0].sqlState, 'ZZ999');
  assert.equal(result.measurement.errorSamples[0].phase, 'measurement');
  assert.equal(result.measurement.errorSamples[0].workerId, ONE);
}

async function assertWarmupFailureFailsClosed() {
  await assert.rejects(
    runOltpBaselineWorkload({
      async executeTransaction(operation) {
        if (operation.phase === 'warmup') {
          const error = new Error('synthetic warmup failure');
          error.code = 'WARMUP_SYNTHETIC';
          throw error;
        }
      },
    }, {
      workers: 1,
      warmupOperationsPerWorker: 1,
      measurementOperationsPerWorker: 1,
      itemCount: 1000,
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
  await assertMeasuredErrorsAreCounted();
  await assertWarmupFailureFailsClosed();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
