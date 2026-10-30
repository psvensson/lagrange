#!/usr/bin/env node

import assert from 'node:assert/strict';

import {runOltpBaselineWorkload} from
  '../../test/distributed/harness/oltp-baseline-workload.js';
import {createTiDbOltpAdapter} from
  '../../test/distributed/reference-client/tidb-oltp-adapter.js';

const stringTrim = Function.call.bind(String.prototype.trim);

const ZERO = 0;
const ONE = 1;
const PASS_PREFIX = 'tidb-oltp-loadgen-runner: PASS ';
const DEFAULT_DATABASE_NAME = 'lagrange_tidb_loadgen';
const MAX_PORT = 65535;
const HUNDRED = 100;
const ORDERS_PER_HUNDRED = 45;
const HISTORY_PER_HUNDRED = 43;
const STATUS_PASSED = 'passed';
const NEWLINE = '\n';

const ENV_TIDB_ENDPOINT_HOST = 'TIDB_ENDPOINT_HOST';
const ENV_TIDB_ENDPOINT_PORT = 'TIDB_ENDPOINT_PORT';
const ENV_TIDB_WORKLOAD_JSON = 'TIDB_WORKLOAD_JSON';

const MSG_WORKLOAD_NOT_OBJECT = 'TIDB_WORKLOAD_JSON must decode to an object';
const MSG_PORT_INVALID = 'TIDB_ENDPOINT_PORT must be a valid TCP port';
const MSG_TOTAL_DIVISIBLE =
  'load-generator proof requires warmup + measurement operations per ' +
  'worker to be divisible by 100';
const MSG_CONNECTIONS_CHANGED =
  'persistent worker connection IDs changed during remote workload';
const MSG_WORKLOAD_AND_CLEANUP_FAILED =
  'load-generator workload and cleanup both failed';

function requiredEnvironment(name) {
  const value = stringTrim(String(process.env[name] || ''));
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function workloadOptions() {
  const raw = requiredEnvironment(ENV_TIDB_WORKLOAD_JSON);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`TIDB_WORKLOAD_JSON is invalid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(MSG_WORKLOAD_NOT_OBJECT);
  }
  return Object.freeze({...parsed});
}

function endpoint() {
  const host = requiredEnvironment(ENV_TIDB_ENDPOINT_HOST);
  const port = Number(requiredEnvironment(ENV_TIDB_ENDPOINT_PORT));
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error(MSG_PORT_INVALID);
  }
  return {host, port};
}

function expectedMixedOperationCount(perHundred, workload) {
  const totalPerWorker =
    workload.warmupOperationsPerWorker +
    workload.measurementOperationsPerWorker;
  if (!Number.isInteger(totalPerWorker) || totalPerWorker % HUNDRED !== ZERO) {
    throw new Error(MSG_TOTAL_DIVISIBLE);
  }
  return perHundred * workload.workers * (totalPerWorker / HUNDRED);
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
      MSG_CONNECTIONS_CHANGED,
    );
    assert.equal(after.datasetSha256, before.datasetSha256);
    assert.equal(
      after.stateCounts.orders,
      expectedMixedOperationCount(ORDERS_PER_HUNDRED, workload),
    );
    assert.equal(
      after.stateCounts.history,
      expectedMixedOperationCount(HISTORY_PER_HUNDRED, workload),
    );

    result = {
      status: STATUS_PASSED,
      endpoint: {
        host: requiredEnvironment(ENV_TIDB_ENDPOINT_HOST),
        port: Number(requiredEnvironment(ENV_TIDB_ENDPOINT_PORT)),
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
      MSG_WORKLOAD_AND_CLEANUP_FAILED,
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;

  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + NEWLINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
