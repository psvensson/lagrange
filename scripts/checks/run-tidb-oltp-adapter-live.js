#!/usr/bin/env node

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  TIDB_REFERENCE_DEFAULTS,
  startTiDbReferenceCluster,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {runOltpBaselineWorkload} from
  '../../test/distributed/harness/oltp-baseline-workload.js';
import {createPairedRetryingOltpAdapter} from
  '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {createTiDbOltpAdapter} from
  '../../test/distributed/reference-client/tidb-oltp-adapter.js';

const ZERO = 0;
const ONE = 1;
const TIKV_STORE_COUNT = 3;
const PASS_PREFIX = 'tidb-oltp-adapter-live: PASS ';
const DATABASE_RESOURCE_LIMITS = Object.freeze({
  memory: '2g',
  cpus: '2.0',
});
const CLIENT_RESOURCE_LIMITS = Object.freeze({
  memory: '256m',
  cpus: '0.5',
});
const LABELS = Object.freeze({
  'lagrange.benchmark': 'tidb-oltp-adapter-live',
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

function uniqueRunId() {
  return `lagrange-tidb-oltp-${process.pid}-${randomUUID().slice(0, 8)}`;
}

function resolveWorkloadOptions(overrides = {}) {
  return Object.freeze({...DEFAULT_WORKLOAD_OPTIONS, ...overrides});
}

function expectedMixedOperationCount(perHundred, workloadOptions) {
  const totalOperationsPerWorker =
    workloadOptions.warmupOperationsPerWorker +
    workloadOptions.measurementOperationsPerWorker;
  if (totalOperationsPerWorker % 100 !== ZERO) {
    throw new Error(
      'TiDB OLTP live proof requires warmup + measurement operations per ' +
      'worker to be divisible by 100 for exact mix assertions',
    );
  }
  const blocksPerWorker = totalOperationsPerWorker / 100;
  return perHundred * workloadOptions.workers * blocksPerWorker;
}

function normalizeMeasurementHooks(hooks) {
  if (hooks === undefined || hooks === null) return null;
  if (
    typeof hooks !== 'object' ||
    typeof hooks.start !== 'function' ||
    typeof hooks.end !== 'function'
  ) {
    throw new Error(
      'TiDB OLTP measurementHooks requires start(context) and end(context)',
    );
  }
  return hooks;
}

async function cleanup(provider, state) {
  const failures = [];
  if (state.adapter) {
    try {
      await state.adapter.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (state.cluster) {
    try {
      await state.cluster.stop();
    } catch (error) {
      failures.push(error);
    }
  }
  if (state.networkId) {
    try {
      await provider.removeNetwork(state.networkId);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > ZERO) {
    throw new AggregateError(failures, 'TiDB OLTP live cleanup failed');
  }
}

async function runTiDbOltpAdapterSmoke(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || uniqueRunId();
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
    const network = await provider.createNetwork(state.networkName, LABELS);
    state.networkId = network.id;
    state.cluster = await startTiDbReferenceCluster({
      provider,
      network: state.networkName,
      namePrefix: runId,
      tikvStoreCount: TIKV_STORE_COUNT,
      resourceLimits: DATABASE_RESOURCE_LIMITS,
      readinessResourceLimits: CLIENT_RESOURCE_LIMITS,
    });

    const tidbHost = String(state.cluster.containers.tidb.ip || '').trim();
    assert.ok(tidbHost, 'Expected host-reachable TiDB container IP');
    state.adapter = await createTiDbOltpAdapter({
      endpoint: {
        host: tidbHost,
        port: TIDB_REFERENCE_DEFAULTS.tidbPort,
      },
      databaseName: `${runId.replace(/-/gu, '_')}_db`,
      workload: workloadOptions,
    });

    const before = await state.adapter.getEvidence();
    assert.equal(before.stateCounts.orders, ZERO);
    assert.equal(before.stateCounts.newOrders, ZERO);
    assert.equal(before.stateCounts.orderLines, ZERO);
    assert.equal(before.stateCounts.history, ZERO);
    assert.equal(
      new Set(before.initialConnectionIds).size,
      workloadOptions.workers,
      'Expected one distinct persistent MySQL connection per workload worker',
    );
    assert.deepEqual(
      before.currentConnectionIds,
      before.initialConnectionIds,
      'Worker connection IDs changed before workload execution',
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
    assert.equal(workload.warmup.failed, ZERO);
    assert.equal(workload.measurement.failed, ZERO);
    assert.equal(workload.measurement.succeeded, expectedTransactions);
    const retryEvidence = retryingAdapter.getRetryEvidence();
    assert.equal(
      retryEvidence.logicalTransactions,
      expectedLogicalTransactions,
    );
    assert.equal(retryEvidence.terminalTransactions, ZERO);

    const after = await state.adapter.getEvidence();
    assert.deepEqual(
      after.currentConnectionIds,
      before.initialConnectionIds,
      'Persistent worker connections changed during the workload',
    );
    assert.equal(after.datasetSha256, before.datasetSha256);
    assert.equal(
      after.stateCounts.orders,
      expectedMixedOperationCount(45, workloadOptions),
    );
    assert.equal(
      after.stateCounts.history,
      expectedMixedOperationCount(43, workloadOptions),
    );
    assert.ok(after.stateCounts.orderLines >= after.stateCounts.orders * 5);
    assert.ok(after.stateCounts.newOrders <= after.stateCounts.orders);

    result = {
      status: 'passed',
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
      workload,
    };
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await cleanup(provider, state);
  } catch (error) {
    cleanupError = error;
  }

  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'TiDB OLTP live proof and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function main() {
  const result = await runTiDbOltpAdapterSmoke();
  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + '\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = ONE;
  });
}

export {
  DEFAULT_WORKLOAD_OPTIONS as TIDB_OLTP_LIVE_DEFAULT_WORKLOAD_OPTIONS,
  runTiDbOltpAdapterSmoke,
};
