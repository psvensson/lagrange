#!/usr/bin/env node

import assert from 'node:assert/strict';

import {runOltpBaselineWorkload} from
  '../../test/distributed/harness/oltp-baseline-workload.js';
import {createTiDbOltpAdapter} from
  '../../test/distributed/reference-client/tidb-oltp-adapter.js';

const ZERO = 0;
const ONE = 1;
const PASS_PREFIX = 'tidb-oltp-loadgen-runner: PASS ';
const DEFAULT_DATABASE_NAME = 'lagrange_tidb_loadgen';

function requiredEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function workloadOptions() {
  const raw = requiredEnvironment('TIDB_WORKLOAD_JSON');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`TIDB_WORKLOAD_JSON is invalid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('TIDB_WORKLOAD_JSON must decode to an object');
  }
  return Object.freeze({...parsed});
}

function endpoint() {
  const host = requiredEnvironment('TIDB_ENDPOINT_HOST');
  const port = Number(requiredEnvironment('TIDB_ENDPOINT_PORT'));
  if (!Number.isInteger(port) || port < ONE || port > 65535) {
    throw new Error('TIDB_ENDPOINT_PORT must be a valid TCP port');
  }
  return {host, port};
}

function expectedMixedOperationCount(perHundred, workload) {
  const totalPerWorker =
    workload.warmupOperationsPerWorker +
    workload.measurementOperationsPerWorker;
  if (!Number.isInteger(totalPerWorker) || totalPerWorker % 100 !== ZERO) {
    throw new Error(
      'load-generator proof requires warmup + measurement operations per ' +
      'worker to be divisible by 100',
    );
  }
  return perHundred * workload.workers * (totalPerWorker / 100);
}

async function main() {
  const workload = workloadOptions();
  const adapter = await createTiDbOltpAdapter({
    endpoint: endpoint(),
    databaseName: process.env.TIDB_DATABASE_NAME || DEFAULT_DATABASE_NAME,
    workload,
  });

  let primaryError = null;
  let result = null;
  try {
    const before = await adapter.getEvidence();
    assert.equal(before.stateCounts.orders, ZERO);
    assert.equal(before.stateCounts.history, ZERO);
    assert.equal(new Set(before.initialConnectionIds).size, workload.workers);
    assert.deepEqual(before.currentConnectionIds, before.initialConnectionIds);

    const run = await runOltpBaselineWorkload(adapter, workload);
    assert.equal(run.warmup.failed, ZERO);
    assert.equal(run.measurement.failed, ZERO);
    assert.equal(
      run.measurement.succeeded,
      workload.workers * workload.measurementOperationsPerWorker,
    );

    const after = await adapter.getEvidence();
    assert.deepEqual(
      after.currentConnectionIds,
      before.initialConnectionIds,
      'persistent worker connection IDs changed during remote workload',
    );
    assert.equal(after.datasetSha256, before.datasetSha256);
    assert.equal(
      after.stateCounts.orders,
      expectedMixedOperationCount(45, workload),
    );
    assert.equal(
      after.stateCounts.history,
      expectedMixedOperationCount(43, workload),
    );

    result = {
      status: 'passed',
      endpoint: {
        host: requiredEnvironment('TIDB_ENDPOINT_HOST'),
        port: Number(requiredEnvironment('TIDB_ENDPOINT_PORT')),
      },
      workerConnectionIds: after.currentConnectionIds,
      datasetSha256: after.datasetSha256,
      datasetSummary: after.datasetSummary,
      stateCounts: after.stateCounts,
      workload: run,
    };
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await adapter.close();
  } catch (error) {
    cleanupError = error;
  }

  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'load-generator workload and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;

  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
