// Comparative-benchmark workload driver: the one entry the campaign runner
// calls per run. It dispatches (target, scenario, subkind) to an enumerated
// business-operation family and executes the canonical workload through the
// shared owners, returning the `observations` and `correctness` parts of
// the raw observation record v2 (chain-design.md) plus the harness identity,
// plan identity and dataset verification. It emits no phase spans or byte
// counters it did not measure: only client-observed request boundaries.
//
// The generated, base64-evaluated bench_* script that lived here is deleted
// (defect ledger D01-D03, D06, D07, D09, D11, D24): it counted timeouts and
// error envelopes as completions, substituted GET /health for the data path,
// ran a non-canonical workload per arm and fabricated phases and bytes.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

import {
  BENCHMARK_DISPATCH_STATUS,
  resolveBenchmarkDispatch,
} from './benchmark-workload-dispatch.js';
import {
  executeScenarioARun,
} from './benchmark-scenario-a-run.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const RECORD_KIND = 'benchmark-workload-run';
const SHA256 = 'sha256';
const HEX = 'hex';

// The sources this driver executes, hashed into driverSourceSha256.
const DRIVER_SOURCES = Object.freeze([
  './real-product-workload-drivers.js',
  './run-benchmark-workload.js',
  './benchmark-workload-dispatch.js',
  './benchmark-scenario-a-run.js',
  './benchmark-operation-outcome.js',
  './benchmark-oltp-attempt-capture.js',
  './benchmark-oltp-state-reconciliation.js',
  './oltp-open-loop-step-owner.js',
  './oltp-paired-retry-owner.js',
  './oltp-error-classification.js',
  './oltp-baseline-transaction-executor.js',
  './oltp-baseline-workload.js',
  './oltp-baseline-dataset.js',
  './oltp-scenario-a-semantic-profile.js',
  './oltp-scenario-a-lagrange-public-pg-context.js',
  '../reference-client/lagrange-oltp-adapter.js',
  '../reference-client/postgresql-oltp-adapter.js',
  '../reference-client/tidb-oltp-adapter.js',
  '../reference-client/oltp-state-snapshot-shared.js',
  '../reference-client/lagrange-oltp-state-snapshot.js',
  '../reference-client/tidb-oltp-state-snapshot.js',
]);

function sha256Hex(value) {
  return createHash(SHA256).update(value).digest(HEX);
}

async function driverSourceIdentity() {
  const sources = await Promise.all(arrayMap(DRIVER_SOURCES, async (relative) => {
    const url = new URL(relative, import.meta.url);
    return Object.freeze({
      path: fileURLToPath(url),
      sha256: sha256Hex(await readFile(url)),
    });
  }));
  return Object.freeze({
    driverSourceSha256: sha256Hex(JSON.stringify(arrayMap(sources,
      ({sha256}, index) => [DRIVER_SOURCES[index], sha256]))),
    driverSources: Object.freeze(sources),
  });
}

/**
 * Execute one benchmark run.
 *
 * @param {object} request
 * @param {string} request.targetId     campaign target label (recorded only)
 * @param {string} request.system       'lagrange' | 'tidb-tikv' | 'postgresql'
 * @param {string} request.scenario     'scenarioA' | 'scenarioB' | 'scenarioC'
 * @param {string} request.subkind      Scenario A: 'main' | 'smoke'
 * @param {object} request.connection   lagrange: {endpoint, credentials} or
 *   {cluster, admission}; postgresql: {endpoint, credentials};
 *   tidb-tikv: {endpoint, databaseName}
 * @param {object} request.plan         {offeredRatePerSec, repetition?,
 *   orderIndex?, sweepPlanSha256?, workload? (Scenario A main only)}
 * @param {string} request.evidenceDir retains response evidence over the
 *   inline bound (required for an executed run)
 * @return {Promise<object>} dispatch, identity, plan, deployment,
 *   observations, correctness, cleanup
 */
async function executeBenchmarkWorkload(request = {}) {
  const dispatch = resolveBenchmarkDispatch(request);
  if (dispatch.status === BENCHMARK_DISPATCH_STATUS.EXECUTED &&
      (!request.plan || typeof request.plan !== 'object')) {
    throw new Error('benchmark run requires a plan');
  }
  // Response evidence over the inline bound is retained as files: an
  // executed run names where.
  if (dispatch.status === BENCHMARK_DISPATCH_STATUS.EXECUTED &&
      (typeof request.evidenceDir !== 'string' || request.evidenceDir === '')) {
    throw new Error('benchmark run requires evidenceDir');
  }
  const harness = await driverSourceIdentity();
  const base = {
    recordKind: RECORD_KIND,
    dispatch: Object.freeze({
      targetId: dispatch.targetId,
      system: dispatch.system,
      scenario: dispatch.scenario,
      subkind: dispatch.subkind,
      family: dispatch.family,
      status: dispatch.status,
      reason: dispatch.reason,
    }),
  };
  if (dispatch.status !== BENCHMARK_DISPATCH_STATUS.EXECUTED) {
    return Object.freeze({
      ...base,
      identity: Object.freeze({harness: Object.freeze({...harness, adapterIds: []})}),
      observations: null,
      correctness: null,
    });
  }
  const run = await executeScenarioARun({
    dispatch,
    connection: request.connection,
    plan: request.plan,
    drivers: request.drivers,
    runtime: request.runtime,
    evidenceDir: request.evidenceDir,
  });
  return Object.freeze({
    ...base,
    identity: Object.freeze({harness: Object.freeze({...harness,
      adapterIds: Object.freeze([run.adapterId])})}),
    plan: run.plan,
    deployment: run.deployment,
    observations: run.observations,
    correctness: run.correctness,
    cleanup: run.cleanup,
  });
}

export {
  RECORD_KIND as BENCHMARK_WORKLOAD_RECORD_KIND,
  driverSourceIdentity as benchmarkDriverSourceIdentity,
  executeBenchmarkWorkload,
};
