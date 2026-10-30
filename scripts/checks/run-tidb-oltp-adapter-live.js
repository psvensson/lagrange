#!/usr/bin/env node

import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {runOltpBaselineWorkload} from
  '../../test/distributed/harness/oltp-baseline-workload.js';
import {createPairedRetryingOltpAdapter} from
  '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  cleanupTiDbLive,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  runLiveMain,
  startTiDbLiveEnvironment,
} from '../../test/distributed/harness/tidb-scenario-a-live-harness.js';

const stringReplace = Function.call.bind(String.prototype.replace);

const SCENARIO_NAME = 'oltp';
const SCENARIO_DISPLAY_NAME = 'OLTP live';
const DATABASE_NAME_SUFFIX = '_db';
const TIKV_STORE_COUNT = 3;
const PASS_PREFIX = 'tidb-oltp-adapter-live: PASS ';
const NEWLINE = '\n';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'tidb-oltp-adapter-live';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_WORKLOAD_OPTIONS = Object.freeze({
  seed: 20260911,
  workers: 2,
  warmupOperationsPerWorker: 100,
  measurementOperationsPerWorker: 100,
  warehouseCount: 2,
  districtsPerWarehouse: 4,
  customersPerDistrict: 50,
  itemCount: 200,
});
const ASSERT_DISTINCT_CONNECTIONS =
  'Expected one distinct persistent MySQL connection per workload worker';
const ASSERT_CONNECTION_IDS_MATCH_BEFORE =
  'Worker connection IDs changed before workload execution';
const ASSERT_CONNECTION_IDS_MATCH_AFTER =
  'Persistent worker connections changed during the workload';
const ERROR_DIVISIBLE_BY_HUNDRED =
  'TiDB OLTP live proof requires warmup + measurement operations per ' +
  'worker to be divisible by 100 for exact mix assertions';
const ERROR_HOOKS_INVALID =
  'TiDB OLTP measurementHooks requires start(context) and end(context)';
const PERCENT_ORDERS = 45;
const PERCENT_HISTORY = 43;
const DIVISOR_BLOCK_SIZE = 100;
const ORDER_LINES_PER_ORDER_FACTOR = 5;
const STATUS_PASSED = 'passed';

function resolveWorkloadOptions(overrides = {}) {
  return Object.freeze({...DEFAULT_WORKLOAD_OPTIONS, ...overrides});
}

function expectedMixedOperationCount(perHundred, workloadOptions) {
  const totalOperationsPerWorker =
    workloadOptions.warmupOperationsPerWorker +
    workloadOptions.measurementOperationsPerWorker;
  if (totalOperationsPerWorker % DIVISOR_BLOCK_SIZE !== 0) {
    throw new Error(ERROR_DIVISIBLE_BY_HUNDRED);
  }
  const blocksPerWorker = totalOperationsPerWorker / DIVISOR_BLOCK_SIZE;
  return perHundred * workloadOptions.workers * blocksPerWorker;
}

function normalizeMeasurementHooks(hooks) {
  if (hooks === undefined || hooks === null) return null;
  if (
    typeof hooks !== 'object' ||
    typeof hooks.start !== 'function' ||
    typeof hooks.end !== 'function'
  ) {
    throw new Error(ERROR_HOOKS_INVALID);
  }
  return hooks;
}

async function runTiDbOltpAdapterSmoke(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const workloadOptions = resolveWorkloadOptions(options.workloadOptions);
  const measurementHooks = normalizeMeasurementHooks(options.measurementHooks);
  const state = {
    networkName: `${runId}-net`,
    networkId: null,
    cluster: null,
    adapter: null,
  };
  let primaryError = null;
  let result = null;

  try {
    const databaseName =
      `${stringReplace(runId, /-/gu, '_')}${DATABASE_NAME_SUFFIX}`;
    await startTiDbLiveEnvironment({
      provider,
      state,
      runId,
      labels: LABELS,
      databaseName,
      workload: workloadOptions,
    });

    const before = await state.adapter.getEvidence();
    assert.equal(before.stateCounts.orders, 0);
    assert.equal(before.stateCounts.newOrders, 0);
    assert.equal(before.stateCounts.orderLines, 0);
    assert.equal(before.stateCounts.history, 0);
    assert.equal(
      new Set(before.initialConnectionIds).size,
      workloadOptions.workers,
      ASSERT_DISTINCT_CONNECTIONS,
    );
    assert.deepEqual(
      before.currentConnectionIds,
      before.initialConnectionIds,
      ASSERT_CONNECTION_IDS_MATCH_BEFORE,
    );

    const expectedTransactions =
      workloadOptions.workers * workloadOptions.measurementOperationsPerWorker;
    const expectedLogicalTransactions = workloadOptions.workers * (
      workloadOptions.warmupOperationsPerWorker +
      workloadOptions.measurementOperationsPerWorker
    );
    const measurementContext = Object.freeze({
      provider,
      runId,
      networkId: state.networkId,
      networkName: state.networkName,
      cluster: state.cluster,
      workloadOptions,
      expectedTransactions,
    });
    const workloadRunOptions = {
      ...workloadOptions,
      ...(measurementHooks ? {
        onMeasurementStart: () => measurementHooks.start(measurementContext),
        onMeasurementEnd: () => measurementHooks.end({
          ...measurementContext,
          completedTransactions: expectedTransactions,
        }),
      } : {}),
    };
    const retryingAdapter = createPairedRetryingOltpAdapter(state.adapter);

    const workload = await runOltpBaselineWorkload(
      retryingAdapter,
      workloadRunOptions,
    );
    assert.equal(workload.warmup.failed, 0);
    assert.equal(workload.measurement.failed, 0);
    assert.equal(workload.measurement.succeeded, expectedTransactions);
    const retryEvidence = retryingAdapter.getRetryEvidence();
    assert.equal(
      retryEvidence.logicalTransactions,
      expectedLogicalTransactions,
    );
    assert.equal(retryEvidence.terminalTransactions, 0);

    const after = await state.adapter.getEvidence();
    assert.deepEqual(
      after.currentConnectionIds,
      before.initialConnectionIds,
      ASSERT_CONNECTION_IDS_MATCH_AFTER,
    );
    assert.equal(after.datasetSha256, before.datasetSha256);
    assert.equal(
      after.stateCounts.orders,
      expectedMixedOperationCount(PERCENT_ORDERS, workloadOptions),
    );
    assert.equal(
      after.stateCounts.history,
      expectedMixedOperationCount(PERCENT_HISTORY, workloadOptions),
    );
    assert.ok(
      after.stateCounts.orderLines >=
        after.stateCounts.orders * ORDER_LINES_PER_ORDER_FACTOR,
    );
    assert.ok(after.stateCounts.newOrders <= after.stateCounts.orders);

    const measuredWorkload = Object.freeze({...workload, retryEvidence});
    result = {
      status: STATUS_PASSED,
      tikvStoreCount: TIKV_STORE_COUNT,
      workers: workloadOptions.workers,
      warmupTransactions: workload.warmup.succeeded,
      measuredTransactions: workload.measurement.succeeded,
      datasetSha256: after.datasetSha256,
      datasetSummary: after.datasetSummary,
      workerConnectionIds: after.currentConnectionIds,
      stateCounts: after.stateCounts,
      images: state.cluster.images,
      retryEvidence,
      workload: measuredWorkload,
    };
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await cleanupTiDbLive(provider, state);
  } catch (error) {
    cleanupError = error;
  }

  finalizeLiveExecution({
    primaryError,
    cleanupError,
    scenarioName: SCENARIO_DISPLAY_NAME,
  });
  return result;
}

async function main() {
  const result = await runTiDbOltpAdapterSmoke();
  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + NEWLINE);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  runLiveMain(main);
}

export {
  DEFAULT_WORKLOAD_OPTIONS as TIDB_OLTP_LIVE_DEFAULT_WORKLOAD_OPTIONS,
  runTiDbOltpAdapterSmoke,
};
